import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AmiClientService } from './ami-client.service';
import { TelephonyIngestionService } from '../services/telephony-ingestion.service';
import { IngestEventItemDto } from '../dto/ingest-event.dto';
import type { RawAmiEvent } from './ami.types';
import { extractExtensionFromChannel } from './ami.types';

@Injectable()
export class AmiEventMapperService implements OnModuleInit {
  private readonly logger = new Logger(AmiEventMapperService.name);
  private processedCount = 0;

  constructor(
    private readonly amiClient: AmiClientService,
    private readonly ingestionService: TelephonyIngestionService,
  ) {}

  onModuleInit() {
    this.amiClient.on('ami:event', (evt: RawAmiEvent) => {
      this.handleRawEvent(evt).catch((err) =>
        this.logger.error(`Failed to handle AMI event: ${err.message}`),
      );
    });
    this.logger.log('AMI event mapper initialized');
  }

  private async handleRawEvent(raw: RawAmiEvent): Promise<void> {
    const mapped = this.mapEvent(raw);
    if (!mapped || mapped.length === 0) return;

    const dtos = mapped.map((m) => {
      const dto = new IngestEventItemDto();
      dto.eventType = m.eventType as any;
      dto.timestamp = m.timestamp;
      dto.idempotencyKey = m.idempotencyKey;
      dto.payload = m.payload;
      dto.linkedId = m.linkedId;
      dto.uniqueId = m.uniqueId;
      return dto;
    });

    const result = await this.ingestionService.ingestBatch(dtos);
    this.processedCount += result.processed;

    if (result.errors.length > 0) {
      this.logger.warn(
        `AMI batch had ${result.errors.length} errors: ${result.errors[0].error}`,
      );
    }
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  mapEvent(raw: RawAmiEvent): MappedEvent[] | null {
    const eventName = (raw.event ?? '').toLowerCase();

    switch (eventName) {
      case 'newchannel':
        return this.mapNewChannel(raw);
      case 'dialend':
        return this.mapDialEnd(raw);
      case 'bridgeenter':
        return null;
      case 'hangup':
        return this.mapHangup(raw);
      case 'queuecallerjoin':
        return this.mapQueueCallerJoin(raw);
      case 'queuecallerleave':
        return this.mapQueueCallerLeave(raw);
      case 'agentconnect':
        return this.mapAgentConnect(raw);
      case 'blindtransfer':
      case 'attendedtransfer':
        return this.mapTransfer(raw);
      case 'musiconholdstart':
        return this.mapMusicOnHold(raw, true);
      case 'musiconholdstop':
        return this.mapMusicOnHold(raw, false);
      default:
        return null;
    }
  }

  private mapNewChannel(raw: RawAmiEvent): MappedEvent[] | null {
    if (!raw.linkedid || !raw.uniqueid) return null;
    if (raw.uniqueid !== raw.linkedid) return null;

    return [
      {
        eventType: 'call_start',
        timestamp: new Date().toISOString(),
        idempotencyKey: `ami:newchannel:${raw.uniqueid}`,
        linkedId: raw.linkedid,
        uniqueId: raw.uniqueid,
        payload: this.buildPayload(raw),
      },
    ];
  }

  private mapDialEnd(raw: RawAmiEvent): MappedEvent[] | null {
    if (!raw.linkedid) return null;

    const status = (raw.dialstatus ?? '').toUpperCase();
    if (status === 'ANSWER') {
      return [
        {
          eventType: 'call_answer',
          timestamp: new Date().toISOString(),
          idempotencyKey: `ami:dialend:${raw.uniqueid ?? raw.linkedid}:answer`,
          linkedId: raw.linkedid,
          uniqueId: raw.uniqueid,
          payload: this.buildPayload(raw),
        },
      ];
    }
    return null;
  }

  private mapHangup(raw: RawAmiEvent): MappedEvent[] | null {
    if (!raw.linkedid) return null;
    if (raw.uniqueid !== raw.linkedid) return null;

    return [
      {
        eventType: 'call_end',
        timestamp: new Date().toISOString(),
        idempotencyKey: `ami:hangup:${raw.uniqueid}`,
        linkedId: raw.linkedid,
        uniqueId: raw.uniqueid,
        payload: {
          ...this.buildPayload(raw),
          cause: raw.cause,
          causeTxt: raw['cause-txt'],
        },
      },
    ];
  }

  private mapQueueCallerJoin(raw: RawAmiEvent): MappedEvent[] | null {
    if (!raw.linkedid || !raw.queue) return null;

    return [
      {
        eventType: 'queue_enter',
        timestamp: new Date().toISOString(),
        idempotencyKey: `ami:queuejoin:${raw.uniqueid ?? raw.linkedid}:${raw.queue}`,
        linkedId: raw.linkedid,
        uniqueId: raw.uniqueid,
        payload: {
          ...this.buildPayload(raw),
          queue: raw.queue,
          position: raw.position ? parseInt(raw.position, 10) : undefined,
        },
      },
    ];
  }

  private mapQueueCallerLeave(raw: RawAmiEvent): MappedEvent[] | null {
    if (!raw.linkedid || !raw.queue) return null;

    return [
      {
        eventType: 'queue_leave',
        timestamp: new Date().toISOString(),
        idempotencyKey: `ami:queueleave:${raw.uniqueid ?? raw.linkedid}:${raw.queue}`,
        linkedId: raw.linkedid,
        uniqueId: raw.uniqueid,
        payload: {
          ...this.buildPayload(raw),
          queue: raw.queue,
        },
      },
    ];
  }

  private mapAgentConnect(raw: RawAmiEvent): MappedEvent[] | null {
    if (!raw.linkedid) return null;

    const ext =
      extractExtensionFromChannel(raw.destchannel) ??
      extractExtensionFromChannel(raw.member ?? raw.interface);

    return [
      {
        eventType: 'agent_connect',
        timestamp: new Date().toISOString(),
        idempotencyKey: `ami:agentconnect:${raw.uniqueid ?? raw.linkedid}:${ext ?? ''}`,
        linkedId: raw.linkedid,
        uniqueId: raw.uniqueid,
        payload: {
          ...this.buildPayload(raw),
          extension: ext ?? undefined,
          queue: raw.queue,
          holdTime: raw.holdtime ? parseInt(raw.holdtime, 10) : undefined,
          ringTime: raw.ringtime ? parseInt(raw.ringtime, 10) : undefined,
        },
      },
    ];
  }

  private mapTransfer(raw: RawAmiEvent): MappedEvent[] | null {
    if (!raw.linkedid) return null;

    const ext = extractExtensionFromChannel(
      raw.transfertargetchannel ?? raw.destchannel,
    );

    return [
      {
        eventType: 'transfer',
        timestamp: new Date().toISOString(),
        idempotencyKey: `ami:transfer:${raw.uniqueid ?? raw.linkedid}:${Date.now()}`,
        linkedId: raw.linkedid,
        uniqueId: raw.uniqueid,
        payload: {
          ...this.buildPayload(raw),
          extension: ext ?? undefined,
          transferType: raw.event?.toLowerCase().includes('blind')
            ? 'blind'
            : 'attended',
        },
      },
    ];
  }

  private mapMusicOnHold(
    raw: RawAmiEvent,
    isStart: boolean,
  ): MappedEvent[] | null {
    if (!raw.linkedid) return null;

    const eventType = isStart ? 'hold_start' : 'hold_end';
    return [
      {
        eventType,
        timestamp: new Date().toISOString(),
        idempotencyKey: `ami:moh:${raw.uniqueid ?? raw.linkedid}:${eventType}:${Date.now()}`,
        linkedId: raw.linkedid,
        uniqueId: raw.uniqueid,
        payload: this.buildPayload(raw),
      },
    ];
  }

  private buildPayload(raw: RawAmiEvent): Record<string, unknown> {
    return {
      uniqueId: raw.uniqueid,
      linkedId: raw.linkedid,
      channel: raw.channel,
      callerIdNum: raw.calleridnum,
      callerIdName: raw.calleridname,
      connectedLineNum: raw.connectedlinenum,
      context: raw.context,
      extension: raw.exten,
      source: 'asterisk-ami',
    };
  }
}

interface MappedEvent {
  eventType: string;
  timestamp: string;
  idempotencyKey: string;
  linkedId?: string;
  uniqueId?: string;
  payload: Record<string, unknown>;
}
