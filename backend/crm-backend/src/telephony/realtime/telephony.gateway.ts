import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger, OnModuleInit } from '@nestjs/common';
import * as cookie from 'cookie';
import { getCorsOrigins } from '../../cors';
import { TelephonyStateManager } from './telephony-state.manager';
import type { ActiveCall, AgentState } from './telephony-state.manager';
import { AmiClientService } from '../ami/ami-client.service';
import { TelephonyCallsService } from '../services/telephony-calls.service';
import { AgentPresenceService } from '../services/agent-presence.service';
import { OperatorBreakService } from '../services/operator-break.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RawAmiEvent } from '../ami/ami.types';

interface TelephonySocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  namespace: '/telephony',
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
})
export class TelephonyGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TelephonyGateway.name);
  private readonly connectedUsers = new Map<string, Set<string>>();
  private readonly reportTriggerSent = new Set<string>();

  // P1-9: diff-then-emit for queue:updated — one hash per queueId of the
  // last snapshot fields that matter to the dashboard. Skip re-emit if unchanged.
  private readonly lastQueueSnapshot = new Map<string, string>();

  // P1-9: per-user throttle for agent:status — max 1 emit per userId per second.
  // Trailing emit guarantees the final state is delivered after the throttle window.
  private readonly lastAgentEmitAt = new Map<string, number>();
  private readonly pendingAgentEmit = new Map<string, NodeJS.Timeout>();
  private readonly pendingAgentState = new Map<string, AgentState>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly stateManager: TelephonyStateManager,
    private readonly amiClient: AmiClientService,
    private readonly callsService: TelephonyCallsService,
    private readonly prisma: PrismaService,
    private readonly presenceService: AgentPresenceService,
    private readonly breakService: OperatorBreakService,
  ) {}

  onModuleInit() {
    this.amiClient.on('ami:event', (evt: RawAmiEvent) => {
      this.broadcastAmiEvent(evt).catch((err) =>
        this.logger.error(`WS broadcast error: ${err.message}`),
      );
    });

    // When the presence sweep flips an extension from registered→offline
    // (softphone silently died), surface it on the manager dashboard.
    // Without this, managers would still see "available" for up to one
    // full UI refresh cycle even though the SIP side is dead.
    this.presenceService.onStaleFlipped = (userId, extension) => {
      this.server.to('dashboard').emit('agent:status', {
        userId,
        extension,
        sipRegistered: false,
        sipStaleFlip: true,
        timestamp: new Date().toISOString(),
      });
      this.server.to(`agent:${userId}`).emit('agent:status', {
        userId,
        extension,
        sipRegistered: false,
        sipStaleFlip: true,
        timestamp: new Date().toISOString(),
      });
    };

    // Operator break events — dashboards need these live so the "On break"
    // badge + Breaks tab update without polling. Dashboard gets both
    // started/ended; the operator's own agent room ALSO gets them so
    // the softphone can restore countdown state on reconnect (future
    // softphone v1.10.0 PR — no consumer yet, harmless no-op).
    this.breakService.onBreakStarted = (payload) => {
      const envelope = {
        ...payload,
        startedAt: payload.startedAt.toISOString(),
      };
      this.server.to('dashboard').emit('operator:break:started', envelope);
      this.server.to(`agent:${payload.userId}`).emit('operator:break:started', envelope);
    };
    this.breakService.onBreakEnded = (payload) => {
      const envelope = {
        ...payload,
        startedAt: payload.startedAt.toISOString(),
        endedAt: payload.endedAt.toISOString(),
      };
      this.server.to('dashboard').emit('operator:break:ended', envelope);
      this.server.to(`agent:${payload.userId}`).emit('operator:break:ended', envelope);
    };
  }

  async handleConnection(client: TelephonySocket) {
    try {
      const user = this.authenticateSocket(client);
      if (!user) {
        client.disconnect();
        return;
      }
      client.userId = user.id;

      if (!this.connectedUsers.has(user.id)) {
        this.connectedUsers.set(user.id, new Set());
      }
      this.connectedUsers.get(user.id)!.add(client.id);

      client.join('dashboard');
      client.join(`agent:${user.id}`);

      client.emit('state:snapshot', {
        calls: this.stateManager.getActiveCalls(),
        agents: this.stateManager.getAgentStates(),
        queues: this.stateManager.getQueueSnapshots(),
      });

      this.logger.debug(`Client connected: ${client.id} (user ${user.id})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: TelephonySocket) {
    if (client.userId) {
      const sockets = this.connectedUsers.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.connectedUsers.delete(client.userId);

          // P1-9: clear any pending throttled agent:status timer + state for
          // this user so we do not leak timers after the last socket leaves.
          const timer = this.pendingAgentEmit.get(client.userId);
          if (timer) {
            clearTimeout(timer);
            this.pendingAgentEmit.delete(client.userId);
          }
          this.pendingAgentState.delete(client.userId);
          this.lastAgentEmitAt.delete(client.userId);
        }
      }
    }
  }

  @SubscribeMessage('queue:subscribe')
  handleQueueSubscribe(
    @ConnectedSocket() client: TelephonySocket,
    @MessageBody() data: { queueId: string },
  ) {
    if (data?.queueId) client.join(`queue:${data.queueId}`);
    return { subscribed: data?.queueId };
  }

  @SubscribeMessage('queue:unsubscribe')
  handleQueueUnsubscribe(
    @ConnectedSocket() client: TelephonySocket,
    @MessageBody() data: { queueId: string },
  ) {
    if (data?.queueId) client.leave(`queue:${data.queueId}`);
    return { unsubscribed: data?.queueId };
  }

  private async broadcastAmiEvent(raw: RawAmiEvent): Promise<void> {
    const eventName = (raw.event ?? '').toLowerCase();

    switch (eventName) {
      case 'newchannel':
        if (raw.uniqueid === raw.linkedid) {
          const call = this.stateManager.getActiveCall(raw.linkedid!);
          if (call) {
            this.emitCallEvent('call:ringing', call);
            await this.emitScreenPop(call);
          }
        }
        break;

      case 'agentconnect':
      case 'dialend':
      case 'bridgeenter': {
        const call = this.stateManager.getActiveCall(raw.linkedid ?? '');
        if (call) {
          this.emitCallEvent('call:answered', call);
          this.emitReportTrigger(call).catch((err) =>
            this.logger.error(`Report trigger error: ${err.message}`),
          );
        }
        break;
      }

      case 'hangup':
        if (raw.uniqueid === raw.linkedid) {
          this.server.to('dashboard').emit('call:ended', {
            linkedId: raw.linkedid,
            cause: raw['cause-txt'] ?? raw.cause,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'musiconholdstart':
      case 'musiconholdstop': {
        const call = this.stateManager.getActiveCall(raw.linkedid ?? '');
        if (call) this.emitCallEvent('call:hold', call);
        break;
      }

      case 'queuememberpause':
      case 'queuememberstatus':
        break;
    }

    // P1-9: diff-then-emit for queue:updated (skip no-op snapshots) and
    // throttle agent:status per userId. See emitQueueUpdated / emitAgentStatus.
    this.emitQueueUpdated();
    for (const agent of this.stateManager.getAgentStates()) {
      this.emitAgentStatus(agent.userId, agent);
    }
  }

  /**
   * P1-9: compare each queue's snapshot to the last emitted hash and only
   * emit `queue:updated` for queues that actually changed. Previously this
   * fanned the full queue array to every `dashboard` socket on every AMI
   * event — ~115 msg/sec during 10-call/min bursts with 70 subscribers.
   */
  private emitQueueUpdated(): void {
    const queues = this.stateManager.getQueueSnapshots();
    const seen = new Set<string>();
    for (const q of queues) {
      seen.add(q.queueId);
      const hash = `${q.activeCalls}|${q.waitingCallers}|${q.longestWaitSec ?? ''}|${q.availableAgents}`;
      if (this.lastQueueSnapshot.get(q.queueId) === hash) continue;
      this.lastQueueSnapshot.set(q.queueId, hash);
      this.server.to('dashboard').emit('queue:updated', {
        ...q,
        timestamp: new Date().toISOString(),
      });
    }
    // Evict hashes for queues no longer reported (queue closed / empty).
    for (const queueId of this.lastQueueSnapshot.keys()) {
      if (!seen.has(queueId)) this.lastQueueSnapshot.delete(queueId);
    }
  }

  /**
   * P1-9: throttle `agent:status` emits to at most 1 per userId per second.
   * If an emit arrives within the throttle window we schedule a trailing
   * emit so the final state is guaranteed to be delivered.
   */
  private emitAgentStatus(userId: string, state: AgentState): void {
    const now = Date.now();
    const last = this.lastAgentEmitAt.get(userId) ?? 0;
    if (now - last < 1000) {
      this.scheduleTrailingAgentEmit(userId, state);
      return;
    }
    this.lastAgentEmitAt.set(userId, now);
    this.doEmitAgentStatus(userId, state);
  }

  private scheduleTrailingAgentEmit(userId: string, state: AgentState): void {
    // Always keep the latest pending state so the trailing emit delivers
    // the most recent value, not whichever event happened to first land in
    // the throttle window.
    this.pendingAgentState.set(userId, state);
    if (this.pendingAgentEmit.has(userId)) return;

    const last = this.lastAgentEmitAt.get(userId) ?? 0;
    const elapsed = Date.now() - last;
    const wait = Math.max(1000 - elapsed, 0);
    const timer = setTimeout(() => {
      this.pendingAgentEmit.delete(userId);
      const finalState = this.pendingAgentState.get(userId);
      this.pendingAgentState.delete(userId);
      if (!finalState) return;
      this.lastAgentEmitAt.set(userId, Date.now());
      this.doEmitAgentStatus(userId, finalState);
    }, wait);
    this.pendingAgentEmit.set(userId, timer);
  }

  private doEmitAgentStatus(userId: string, state: AgentState): void {
    const payload = { ...state, timestamp: new Date().toISOString() };
    this.server.to(`agent:${userId}`).emit('agent:status', payload);
    this.server.to('dashboard').emit('agent:status', payload);
  }

  private emitCallEvent(event: string, call: ActiveCall): void {
    this.server.to('dashboard').emit(event, {
      ...call,
      timestamp: new Date().toISOString(),
    });
    if (call.queueId) {
      this.server.to(`queue:${call.queueId}`).emit(event, {
        ...call,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async emitScreenPop(call: ActiveCall): Promise<void> {
    if (!call.callerNumber || call.callerNumber === 'unknown') return;
    try {
      const lookup = await this.callsService.lookupPhone(call.callerNumber);
      this.server.to('dashboard').emit('screen:pop', {
        linkedId: call.linkedId,
        callerNumber: call.callerNumber,
        lookup,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // lookup failure is non-critical
    }
  }

  /**
   * Emits a call:report-trigger to the assigned operator's socket room
   * so the CRM frontend can open the call report modal.
   */
  private async emitReportTrigger(call: ActiveCall): Promise<void> {
    if (!call.assignedUserId) return;

    // Dedup: only emit once per linkedId
    if (this.reportTriggerSent.has(call.linkedId)) return;
    this.reportTriggerSent.add(call.linkedId);
    setTimeout(() => this.reportTriggerSent.delete(call.linkedId), 60_000);

    // Check if the user is an operator via TelephonyExtension.isOperator
    const ext = await this.prisma.telephonyExtension.findFirst({
      where: { crmUserId: call.assignedUserId, isOperator: true, isActive: true },
      select: { crmUserId: true },
    });
    if (!ext) return;

    // Resolve the call session — retry once after 1s to handle ingestion pipeline race
    let session = await this.prisma.callSession.findUnique({
      where: { linkedId: call.linkedId },
      select: { id: true, direction: true, callerNumber: true, calleeNumber: true },
    });
    if (!session) {
      await new Promise((r) => setTimeout(r, 1000));
      session = await this.prisma.callSession.findUnique({
        where: { linkedId: call.linkedId },
        select: { id: true, direction: true, callerNumber: true, calleeNumber: true },
      });
    }
    if (!session) return;

    // Try to resolve caller client from phone number
    let callerClient: { id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null } | null = null;
    const phoneToLookup = session.callerNumber;
    if (phoneToLookup && phoneToLookup !== 'unknown') {
      const client = await this.prisma.client.findFirst({
        where: { primaryPhone: phoneToLookup, isActive: true },
        select: { id: true, firstName: true, lastName: true, primaryPhone: true },
      });
      callerClient = client;
    }

    this.server.to(`agent:${call.assignedUserId}`).emit('call:report-trigger', {
      callSessionId: session.id,
      direction: session.direction,
      callerNumber: session.callerNumber,
      calleeNumber: session.calleeNumber,
      callerClient,
    });
  }

  private authenticateSocket(
    client: Socket,
  ): { id: string; email: string; role: string } | null {
    try {
      const authHeader = client.handshake.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const payload = this.jwtService.verify(authHeader.slice(7));
        if (payload?.sub) {
          return {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
          };
        }
      }

      const cookies = client.handshake.headers.cookie;
      if (cookies) {
        const parsed = cookie.parse(cookies);
        const token = parsed[process.env.COOKIE_NAME ?? 'access_token'];
        if (token) {
          const payload = this.jwtService.verify(token);
          if (payload?.sub) {
            return {
              id: payload.sub,
              email: payload.email,
              role: payload.role,
            };
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }
}
