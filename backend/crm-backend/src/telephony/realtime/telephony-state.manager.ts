import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AmiClientService } from '../ami/ami-client.service';
import type { RawAmiEvent } from '../ami/ami.types';
import { extractExtensionFromChannel } from '../ami/ami.types';

export interface ActiveCall {
  linkedId: string;
  callerNumber: string;
  callerName: string | null;
  queueId: string | null;
  queueName: string | null;
  assignedUserId: string | null;
  assignedExtension: string | null;
  state: 'RINGING' | 'QUEUED' | 'CONNECTED' | 'ON_HOLD';
  startedAt: Date;
  answeredAt: Date | null;
}

export type AgentPresence =
  | 'ON_CALL'
  | 'RINGING'
  | 'IDLE'
  | 'WRAPUP'
  | 'PAUSED'
  | 'OFFLINE';

export interface AgentState {
  userId: string;
  displayName: string | null;
  extension: string | null;
  presence: AgentPresence;
  currentLinkedId: string | null;
  callStartedAt: Date | null;
  callsHandledToday: number;
  pausedReason: string | null;
}

export interface QueueSnapshot {
  queueId: string;
  queueName: string;
  activeCalls: number;
  waitingCallers: number;
  longestWaitSec: number | null;
  availableAgents: number;
}

@Injectable()
export class TelephonyStateManager implements OnModuleInit {
  private readonly logger = new Logger(TelephonyStateManager.name);

  private readonly activeCalls = new Map<string, ActiveCall>();
  private readonly agents = new Map<string, AgentState>();
  private readonly extensionToUser = new Map<string, string>();
  private amiConnected = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly amiClient: AmiClientService,
  ) {}

  async onModuleInit() {
    await this.hydrateFromDb();
    this.amiClient.on('ami:connected', () => {
      this.amiConnected = true;
      this.logger.log('State manager: AMI connected');
      // B15 — on every reconnect, ask Asterisk for a full channel dump
      // so any events missed during the disconnect window are reconciled.
      // Without this, FreePBX "Apply Config" reloads (or any transient
      // AMI blip) during business hours silently drop live call state:
      // `newchannel` / `answer` / `hangup` during the gap are gone, and
      // the dashboard lies until CDR import catches up 5 min later.
      this.resyncLiveCallsFromAmi().catch((err) =>
        this.logger.warn(`Live resync after AMI reconnect failed: ${err.message}`),
      );
    });
    this.amiClient.on('ami:disconnected', () => {
      this.amiConnected = false;
    });
    this.amiClient.on('ami:event', (evt: RawAmiEvent) => {
      this.handleAmiEvent(evt);
    });
  }

  /**
   * B15 — After an AMI reconnect, issue `CoreShowChannels` and reconcile
   * `activeCalls` with Asterisk's ground truth. Entries we have but
   * Asterisk doesn't → purge (the hangup happened during the gap).
   * Entries Asterisk has but we don't → skip for now (the next `newchannel`
   * / AMI event for them will populate us; `CoreShowChannels` returns a
   * line per channel but without the linkedid→session mapping we'd need
   * to synthesize a full ActiveCall row). The purge is the critical part
   * — without it, manager dashboards show ghost "in progress" calls
   * forever.
   */
  private async resyncLiveCallsFromAmi(): Promise<void> {
    const channels = await this.fetchLiveLinkedIds();
    if (channels === null) return; // AMI unavailable; nothing to do.

    const asteriskLinkedIds = new Set(channels);
    let purged = 0;
    for (const linkedId of Array.from(this.activeCalls.keys())) {
      if (!asteriskLinkedIds.has(linkedId)) {
        this.activeCalls.delete(linkedId);
        purged++;
      }
    }
    if (purged > 0) {
      this.logger.log(
        `AMI resync: purged ${purged} ghost active-call(s) not present in Asterisk`,
      );
    }
  }

  /**
   * Issues AMI `CoreShowChannels` and collects the reported `linkedid`
   * values. asterisk-manager resolves with the summary event; per-channel
   * rows arrive as discrete events. We collect for a bounded window
   * (1.5 s) to cover the stream, then resolve.
   */
  private async fetchLiveLinkedIds(): Promise<string[] | null> {
    const manager: any = (this.amiClient as any).manager;
    if (!manager) return null;

    return new Promise((resolve) => {
      const collected = new Set<string>();
      const onEvent = (evt: RawAmiEvent) => {
        const name = (evt.event ?? '').toLowerCase();
        if (name === 'coreshowchannel' && evt.linkedid) {
          collected.add(evt.linkedid);
        } else if (name === 'coreshowchannelscomplete') {
          cleanup();
          resolve(Array.from(collected));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(Array.from(collected));
      }, 1500);
      const cleanup = () => {
        clearTimeout(timer);
        try {
          manager.removeListener('managerevent', onEvent);
        } catch {
          /* ignore */
        }
      };
      try {
        manager.on('managerevent', onEvent);
        this.amiClient.sendAction({ Action: 'CoreShowChannels' }).catch(() => {
          cleanup();
          resolve(null);
        });
      } catch {
        cleanup();
        resolve(null);
      }
    });
  }

  isAmiConnected(): boolean {
    return this.amiConnected;
  }

  getActiveCalls(): ActiveCall[] {
    return Array.from(this.activeCalls.values());
  }

  getActiveCall(linkedId: string): ActiveCall | undefined {
    return this.activeCalls.get(linkedId);
  }

  getAgentStates(): AgentState[] {
    return Array.from(this.agents.values());
  }

  getAgentState(userId: string): AgentState | undefined {
    return this.agents.get(userId);
  }

  getQueueSnapshots(): QueueSnapshot[] {
    const queueMap = new Map<string, QueueSnapshot>();

    for (const call of this.activeCalls.values()) {
      if (!call.queueId) continue;
      let qs = queueMap.get(call.queueId);
      if (!qs) {
        qs = {
          queueId: call.queueId,
          queueName: call.queueName ?? call.queueId,
          activeCalls: 0,
          waitingCallers: 0,
          longestWaitSec: null,
          availableAgents: 0,
        };
        queueMap.set(call.queueId, qs);
      }
      qs.activeCalls++;
      if (call.state === 'QUEUED' || call.state === 'RINGING') {
        qs.waitingCallers++;
        const waitSec = (Date.now() - call.startedAt.getTime()) / 1000;
        if (qs.longestWaitSec === null || waitSec > qs.longestWaitSec) {
          qs.longestWaitSec = Math.round(waitSec);
        }
      }
    }

    for (const agent of this.agents.values()) {
      if (agent.presence === 'IDLE') {
        for (const qs of queueMap.values()) {
          qs.availableAgents++;
        }
      }
    }

    return Array.from(queueMap.values());
  }

  handleAmiEvent(raw: RawAmiEvent): void {
    const eventName = (raw.event ?? '').toLowerCase();

    switch (eventName) {
      case 'newchannel':
        this.onNewChannel(raw);
        break;
      case 'queuecallerjoin':
        this.onQueueJoin(raw);
        break;
      case 'agentconnect':
        this.onAgentConnect(raw);
        break;
      case 'bridgeenter':
      case 'dialend':
        this.onAnswer(raw);
        break;
      case 'musiconholdstart':
        this.onHold(raw, true);
        break;
      case 'musiconholdstop':
        this.onHold(raw, false);
        break;
      case 'hangup':
        this.onHangup(raw);
        break;
      case 'queuememberpause':
        this.onQueueMemberPause(raw);
        break;
    }
  }

  private onNewChannel(raw: RawAmiEvent): void {
    if (!raw.linkedid || !raw.uniqueid) return;
    if (raw.uniqueid !== raw.linkedid) return;

    this.activeCalls.set(raw.linkedid, {
      linkedId: raw.linkedid,
      callerNumber: raw.calleridnum ?? 'unknown',
      callerName: raw.calleridname ?? null,
      queueId: null,
      queueName: null,
      assignedUserId: null,
      assignedExtension: null,
      state: 'RINGING',
      startedAt: new Date(),
      answeredAt: null,
    });
  }

  private onQueueJoin(raw: RawAmiEvent): void {
    const call = this.activeCalls.get(raw.linkedid ?? '');
    if (!call) return;
    call.state = 'QUEUED';
    call.queueName = raw.queue ?? null;
  }

  private onAgentConnect(raw: RawAmiEvent): void {
    const call = this.activeCalls.get(raw.linkedid ?? '');
    if (!call) return;

    const ext =
      extractExtensionFromChannel(raw.destchannel) ??
      extractExtensionFromChannel(raw.member ?? raw.interface);
    const userId = ext ? this.extensionToUser.get(ext) ?? null : null;

    call.state = 'CONNECTED';
    call.assignedExtension = ext;
    call.assignedUserId = userId;
    call.answeredAt = new Date();

    if (userId) {
      const agent = this.agents.get(userId);
      if (agent) {
        agent.presence = 'ON_CALL';
        agent.currentLinkedId = call.linkedId;
        agent.callStartedAt = new Date();
      }
    }
  }

  private onAnswer(raw: RawAmiEvent): void {
    const call = this.activeCalls.get(raw.linkedid ?? '');
    if (!call) return;

    if (
      call.state === 'RINGING' ||
      call.state === 'QUEUED'
    ) {
      call.state = 'CONNECTED';
      call.answeredAt = call.answeredAt ?? new Date();

      // For direct calls (non-queue), assignedUserId isn't set by onAgentConnect.
      // Extract it from the channel field of bridgeenter/dialend events.
      if (!call.assignedUserId) {
        const ext =
          extractExtensionFromChannel(raw.destchannel) ??
          extractExtensionFromChannel(raw.channel);
        const userId = ext ? this.extensionToUser.get(ext) ?? null : null;
        if (userId) {
          call.assignedExtension = ext;
          call.assignedUserId = userId;
          const agent = this.agents.get(userId);
          if (agent) {
            agent.presence = 'ON_CALL';
            agent.currentLinkedId = call.linkedId;
            agent.callStartedAt = new Date();
          }
        }
      }
    }
  }

  private onHold(raw: RawAmiEvent, isStart: boolean): void {
    const call = this.activeCalls.get(raw.linkedid ?? '');
    if (!call) return;
    call.state = isStart ? 'ON_HOLD' : 'CONNECTED';
  }

  private onHangup(raw: RawAmiEvent): void {
    if (!raw.linkedid || raw.uniqueid !== raw.linkedid) return;
    const call = this.activeCalls.get(raw.linkedid);
    this.activeCalls.delete(raw.linkedid);

    if (call?.assignedUserId) {
      const agent = this.agents.get(call.assignedUserId);
      if (agent) {
        agent.presence = 'IDLE';
        agent.currentLinkedId = null;
        agent.callStartedAt = null;
        agent.callsHandledToday++;
      }
    }
  }

  private onQueueMemberPause(raw: RawAmiEvent): void {
    const ext = extractExtensionFromChannel(raw.interface ?? raw.member);
    if (!ext) return;
    const userId = this.extensionToUser.get(ext);
    if (!userId) return;

    const agent = this.agents.get(userId);
    if (!agent) return;

    const paused = raw.paused === '1';
    if (paused) {
      agent.presence = 'PAUSED';
      agent.pausedReason = raw.pausedreason ?? null;
    } else if (agent.presence === 'PAUSED') {
      agent.presence = 'IDLE';
      agent.pausedReason = null;
    }
  }

  private async hydrateFromDb(): Promise<void> {
    try {
      const extensions = await this.prisma.telephonyExtension.findMany({
        where: { isActive: true },
        select: { crmUserId: true, extension: true, displayName: true },
      });

      for (const ext of extensions) {
        this.extensionToUser.set(ext.extension, ext.crmUserId);
        this.agents.set(ext.crmUserId, {
          userId: ext.crmUserId,
          displayName: ext.displayName,
          extension: ext.extension,
          presence: 'OFFLINE',
          currentLinkedId: null,
          callStartedAt: null,
          callsHandledToday: 0,
          pausedReason: null,
        });
      }

      const activeSessions = await this.prisma.callSession.findMany({
        where: {
          endAt: null,
          startAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        include: { queue: { select: { id: true, name: true } } },
      });

      for (const session of activeSessions) {
        this.activeCalls.set(session.linkedId, {
          linkedId: session.linkedId,
          callerNumber: session.callerNumber,
          callerName: null,
          queueId: session.queueId,
          queueName: session.queue?.name ?? null,
          assignedUserId: session.assignedUserId,
          assignedExtension: session.assignedExtension,
          state: session.answerAt ? 'CONNECTED' : 'QUEUED',
          startedAt: session.startAt,
          answeredAt: session.answerAt,
        });
      }

      this.logger.log(
        `Hydrated state: ${extensions.length} agents, ${activeSessions.length} active calls`,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to hydrate state from DB: ${err.message}`);
    }
  }

  refreshExtensionMap(
    extensions: Array<{ extension: string; crmUserId: string; displayName: string }>,
  ): void {
    this.extensionToUser.clear();
    for (const ext of extensions) {
      this.extensionToUser.set(ext.extension, ext.crmUserId);
      if (!this.agents.has(ext.crmUserId)) {
        this.agents.set(ext.crmUserId, {
          userId: ext.crmUserId,
          displayName: ext.displayName,
          extension: ext.extension,
          presence: 'OFFLINE',
          currentLinkedId: null,
          callStartedAt: null,
          callsHandledToday: 0,
          pausedReason: null,
        });
      }
    }
  }
}
