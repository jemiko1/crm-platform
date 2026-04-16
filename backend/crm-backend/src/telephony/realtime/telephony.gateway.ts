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
import type { ActiveCall } from './telephony-state.manager';
import { AmiClientService } from '../ami/ami-client.service';
import { TelephonyCallsService } from '../services/telephony-calls.service';
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly stateManager: TelephonyStateManager,
    private readonly amiClient: AmiClientService,
    private readonly callsService: TelephonyCallsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.amiClient.on('ami:event', (evt: RawAmiEvent) => {
      this.broadcastAmiEvent(evt).catch((err) =>
        this.logger.error(`WS broadcast error: ${err.message}`),
      );
    });
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
        if (sockets.size === 0) this.connectedUsers.delete(client.userId);
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

    this.server.to('dashboard').emit('queue:updated', {
      queues: this.stateManager.getQueueSnapshots(),
      timestamp: new Date().toISOString(),
    });

    for (const agent of this.stateManager.getAgentStates()) {
      this.server.to(`agent:${agent.userId}`).emit('agent:status', {
        ...agent,
        timestamp: new Date().toISOString(),
      });
    }
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

    // Resolve the call session to get its ID
    const session = await this.prisma.callSession.findUnique({
      where: { linkedId: call.linkedId },
      select: { id: true, direction: true, callerNumber: true, calleeNumber: true },
    });
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
  ): { id: string; email: string } | null {
    try {
      const authHeader = client.handshake.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const payload = this.jwtService.verify(authHeader.slice(7));
        if (payload?.id) return payload as { id: string; email: string };
      }

      const cookies = client.handshake.headers.cookie;
      if (cookies) {
        const parsed = cookie.parse(cookies);
        const token = parsed[process.env.COOKIE_NAME ?? 'access_token'];
        if (token) {
          const payload = this.jwtService.verify(token);
          if (payload?.id) return payload as { id: string; email: string };
        }
      }
    } catch {
      return null;
    }
    return null;
  }
}
