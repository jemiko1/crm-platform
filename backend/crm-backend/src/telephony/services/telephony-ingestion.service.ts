import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CallDirection, CallDisposition, CallLegType, Prisma } from '@prisma/client';
import {
  IngestResult,
  TelephonyEventType,
  AsteriskEventPayload,
} from '../types/telephony.types';
import { IngestEventItemDto } from '../dto/ingest-event.dto';
import { TelephonyCallbackService } from './telephony-callback.service';

@Injectable()
export class TelephonyIngestionService {
  private readonly logger = new Logger(TelephonyIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly callbackService: TelephonyCallbackService,
  ) {}

  async ingestBatch(events: IngestEventItemDto[]): Promise<IngestResult> {
    let processed = 0;
    let skipped = 0;
    const errors: IngestResult['errors'] = [];

    for (const event of events) {
      try {
        const wasProcessed = await this.processEvent(event);
        if (wasProcessed) {
          processed++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to process event ${event.idempotencyKey}: ${err.message}`,
        );
        errors.push({ idempotencyKey: event.idempotencyKey, error: err.message });
      }
    }

    return { processed, skipped, errors };
  }

  private async processEvent(event: IngestEventItemDto): Promise<boolean> {
    const existing = await this.prisma.callEvent.findUnique({
      where: { idempotencyKey: event.idempotencyKey },
    });
    if (existing) {
      return false;
    }

    const linkedId = event.linkedId ?? (event.payload as any).linkedId;
    const session = linkedId
      ? await this.prisma.callSession.findUnique({ where: { linkedId } })
      : null;

    await this.prisma.callEvent.create({
      data: {
        callSessionId: session?.id ?? null,
        eventType: event.eventType,
        ts: new Date(event.timestamp),
        payload: event.payload as Prisma.InputJsonValue,
        source: (event.payload as any).source ?? 'asterisk',
        idempotencyKey: event.idempotencyKey,
      },
    });

    await this.dispatch(event.eventType as TelephonyEventType, event, session);
    return true;
  }

  private async dispatch(
    eventType: TelephonyEventType,
    event: IngestEventItemDto,
    existingSession: { id: string } | null,
  ): Promise<void> {
    const payload = event.payload as AsteriskEventPayload;

    switch (eventType) {
      case 'call_start':
        await this.handleCallStart(event, payload);
        break;
      case 'call_answer':
        await this.handleCallAnswer(event, payload, existingSession);
        break;
      case 'call_end':
        await this.handleCallEnd(event, payload, existingSession);
        break;
      case 'queue_enter':
        await this.handleQueueEnter(payload, existingSession);
        break;
      case 'queue_leave':
        await this.handleQueueLeave(payload, existingSession);
        break;
      case 'agent_connect':
        await this.handleAgentConnect(event, payload, existingSession);
        break;
      case 'transfer':
        await this.handleTransfer(event, payload, existingSession);
        break;
      case 'hold_start':
      case 'hold_end':
        await this.handleHold(eventType, event, existingSession);
        break;
      case 'recording_ready':
        await this.handleRecordingReady(payload, existingSession);
        break;
      case 'wrapup_start':
      case 'wrapup_end':
        await this.handleWrapup(eventType, event, existingSession);
        break;
    }
  }

  private async handleCallStart(
    event: IngestEventItemDto,
    payload: AsteriskEventPayload,
  ): Promise<void> {
    const linkedId = event.linkedId ?? payload.linkedId;
    if (!linkedId) {
      this.logger.warn(`call_start without linkedId, key=${event.idempotencyKey}`);
      return;
    }

    const direction = this.inferDirection(payload);

    await this.prisma.callSession.upsert({
      where: { linkedId },
      create: {
        linkedId,
        uniqueId: event.uniqueId ?? payload.uniqueId ?? null,
        direction,
        did: payload.context ?? null,
        callerNumber: payload.callerIdNum ?? 'unknown',
        calleeNumber: payload.connectedLineNum ?? null,
        startAt: new Date(event.timestamp),
      },
      update: {
        uniqueId: event.uniqueId ?? payload.uniqueId ?? undefined,
      },
    });

    // Also create a customer leg
    const session = await this.prisma.callSession.findUnique({ where: { linkedId } });
    if (session) {
      await this.prisma.callLeg.create({
        data: {
          callSessionId: session.id,
          type: CallLegType.CUSTOMER,
          startAt: new Date(event.timestamp),
        },
      });

      // Backfill callSessionId on the event we just created
      await this.prisma.callEvent.updateMany({
        where: { idempotencyKey: event.idempotencyKey, callSessionId: null },
        data: { callSessionId: session.id },
      });
    }
  }

  private async handleCallAnswer(
    event: IngestEventItemDto,
    payload: AsteriskEventPayload,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    await this.prisma.callSession.update({
      where: { id: existingSession.id },
      data: { answerAt: new Date(event.timestamp) },
    });

    // Update customer leg answer time
    const customerLeg = await this.prisma.callLeg.findFirst({
      where: { callSessionId: existingSession.id, type: CallLegType.CUSTOMER },
    });
    if (customerLeg) {
      await this.prisma.callLeg.update({
        where: { id: customerLeg.id },
        data: { answerAt: new Date(event.timestamp) },
      });
    }
  }

  private async handleCallEnd(
    event: IngestEventItemDto,
    payload: AsteriskEventPayload,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    const endAt = new Date(event.timestamp);
    const disposition = this.inferDisposition(payload);

    const session = await this.prisma.callSession.update({
      where: { id: existingSession.id },
      data: {
        endAt,
        disposition,
        hangupCause: payload.causeTxt ?? payload.cause ?? null,
      },
    });

    // Close all open legs
    await this.prisma.callLeg.updateMany({
      where: { callSessionId: existingSession.id, endAt: null },
      data: { endAt, disposition },
    });

    await this.computeMetrics(session.id);

    if (disposition && disposition !== CallDisposition.ANSWERED) {
      await this.callbackService.handleNonAnsweredCall(session.id);
    }
  }

  private async handleQueueEnter(
    payload: AsteriskEventPayload,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession || !payload.queue) return;

    const queue = await this.prisma.telephonyQueue.findUnique({
      where: { name: payload.queue },
    });

    if (queue) {
      await this.prisma.callSession.update({
        where: { id: existingSession.id },
        data: { queueId: queue.id },
      });
    }
  }

  private async handleQueueLeave(
    _payload: AsteriskEventPayload,
    _existingSession: { id: string } | null,
  ): Promise<void> {
    // Queue leave is informational; metrics computed on call_end
  }

  private async handleAgentConnect(
    event: IngestEventItemDto,
    payload: AsteriskEventPayload,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    const ext = payload.extension;
    let userId: string | null = null;

    if (ext) {
      const telExt = await this.prisma.telephonyExtension.findUnique({
        where: { extension: ext },
      });
      userId = telExt?.crmUserId ?? null;
    }

    await this.prisma.callSession.update({
      where: { id: existingSession.id },
      data: {
        assignedUserId: userId,
        assignedExtension: ext ?? null,
      },
    });

    await this.prisma.callLeg.create({
      data: {
        callSessionId: existingSession.id,
        type: CallLegType.AGENT,
        userId,
        extension: ext ?? null,
        startAt: new Date(event.timestamp),
      },
    });
  }

  private async handleTransfer(
    event: IngestEventItemDto,
    payload: AsteriskEventPayload,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    // Close previous agent leg
    await this.prisma.callLeg.updateMany({
      where: {
        callSessionId: existingSession.id,
        type: CallLegType.AGENT,
        endAt: null,
      },
      data: { endAt: new Date(event.timestamp) },
    });

    const ext = payload.extension;
    let userId: string | null = null;

    if (ext) {
      const telExt = await this.prisma.telephonyExtension.findUnique({
        where: { extension: ext },
      });
      userId = telExt?.crmUserId ?? null;
    }

    await this.prisma.callLeg.create({
      data: {
        callSessionId: existingSession.id,
        type: CallLegType.TRANSFER,
        userId,
        extension: ext ?? null,
        startAt: new Date(event.timestamp),
      },
    });

    // Increment transfer count in metrics
    await this.prisma.callMetrics.upsert({
      where: { callSessionId: existingSession.id },
      create: {
        callSessionId: existingSession.id,
        transfersCount: 1,
      },
      update: {
        transfersCount: { increment: 1 },
      },
    });

    // Update assigned user to the transfer target
    await this.prisma.callSession.update({
      where: { id: existingSession.id },
      data: {
        assignedUserId: userId,
        assignedExtension: ext ?? null,
      },
    });
  }

  private async handleHold(
    eventType: TelephonyEventType,
    event: IngestEventItemDto,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    if (eventType === 'hold_end') {
      const holdStartEvent = await this.prisma.callEvent.findFirst({
        where: {
          callSessionId: existingSession.id,
          eventType: 'hold_start',
        },
        orderBy: { ts: 'desc' },
      });

      if (holdStartEvent) {
        const holdDuration =
          (new Date(event.timestamp).getTime() - holdStartEvent.ts.getTime()) / 1000;

        await this.prisma.callMetrics.upsert({
          where: { callSessionId: existingSession.id },
          create: {
            callSessionId: existingSession.id,
            holdSeconds: holdDuration,
          },
          update: {
            holdSeconds: { increment: holdDuration },
          },
        });
      }
    }
  }

  private async handleRecordingReady(
    payload: AsteriskEventPayload,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    await this.prisma.recording.create({
      data: {
        callSessionId: existingSession.id,
        provider: 'asterisk',
        filePath: payload.recordingFile ?? null,
        durationSeconds: payload.recordingDuration
          ? Math.round(payload.recordingDuration)
          : null,
        availableAt: new Date(),
      },
    });

    await this.prisma.callSession.update({
      where: { id: existingSession.id },
      data: { recordingStatus: 'AVAILABLE' },
    });

    // Auto-create quality review for answered calls
    const session = await this.prisma.callSession.findUnique({
      where: { id: existingSession.id },
    });
    if (
      session?.disposition === CallDisposition.ANSWERED &&
      payload.recordingDuration &&
      payload.recordingDuration > 30
    ) {
      const existingReview = await this.prisma.qualityReview.findUnique({
        where: { callSessionId: existingSession.id },
      });
      if (!existingReview) {
        await this.prisma.qualityReview.create({
          data: { callSessionId: existingSession.id },
        });
      }
    }
  }

  private async handleWrapup(
    eventType: TelephonyEventType,
    event: IngestEventItemDto,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    if (eventType === 'wrapup_end') {
      const wrapupStartEvent = await this.prisma.callEvent.findFirst({
        where: {
          callSessionId: existingSession.id,
          eventType: 'wrapup_start',
        },
        orderBy: { ts: 'desc' },
      });

      if (wrapupStartEvent) {
        const wrapupDuration =
          (new Date(event.timestamp).getTime() - wrapupStartEvent.ts.getTime()) / 1000;

        await this.prisma.callMetrics.upsert({
          where: { callSessionId: existingSession.id },
          create: {
            callSessionId: existingSession.id,
            wrapupSeconds: wrapupDuration,
          },
          update: {
            wrapupSeconds: { increment: wrapupDuration },
          },
        });
      }
    }
  }

  private async computeMetrics(sessionId: string): Promise<void> {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { callLegs: true, queue: true },
    });
    if (!session || !session.endAt) return;

    const startMs = session.startAt.getTime();
    const answerMs = session.answerAt?.getTime();
    const endMs = session.endAt.getTime();

    const waitSeconds = answerMs ? (answerMs - startMs) / 1000 : 0;
    const talkSeconds = answerMs ? (endMs - answerMs) / 1000 : 0;
    const ringSeconds = waitSeconds;

    const agentLeg = session.callLegs.find((l) => l.type === CallLegType.AGENT);
    const firstResponseSeconds = agentLeg
      ? (agentLeg.startAt.getTime() - startMs) / 1000
      : null;

    const abandonsAfterSeconds =
      session.disposition === CallDisposition.ABANDONED
        ? (endMs - startMs) / 1000
        : null;

    const slaThreshold = 20; // industry standard: 80/20 rule
    const isSlaMet = answerMs ? waitSeconds <= slaThreshold : false;

    await this.prisma.callMetrics.upsert({
      where: { callSessionId: sessionId },
      create: {
        callSessionId: sessionId,
        waitSeconds,
        ringSeconds,
        talkSeconds,
        firstResponseSeconds,
        abandonsAfterSeconds,
        isSlaMet,
        slaThresholdSeconds: slaThreshold,
      },
      update: {
        waitSeconds,
        ringSeconds,
        talkSeconds,
        firstResponseSeconds,
        abandonsAfterSeconds,
        isSlaMet,
        slaThresholdSeconds: slaThreshold,
      },
    });
  }

  private inferDirection(payload: AsteriskEventPayload): CallDirection {
    if (payload.context?.includes('outbound') || payload.context?.includes('from-internal')) {
      return CallDirection.OUT;
    }
    return CallDirection.IN;
  }

  private inferDisposition(payload: AsteriskEventPayload): CallDisposition {
    const cause = payload.causeTxt?.toUpperCase() ?? payload.cause?.toUpperCase() ?? '';

    if (cause.includes('NORMAL_CLEARING') || cause.includes('ANSWERED') || cause === '16') {
      return CallDisposition.ANSWERED;
    }
    if (cause.includes('NO_ANSWER') || cause === '19') {
      return CallDisposition.NOANSWER;
    }
    if (cause.includes('USER_BUSY') || cause === '17') {
      return CallDisposition.BUSY;
    }
    if (cause.includes('ORIGINATOR_CANCEL') || cause === '487') {
      return CallDisposition.ABANDONED;
    }
    if (cause.includes('FAILURE') || cause.includes('CONGESTION')) {
      return CallDisposition.FAILED;
    }
    return CallDisposition.MISSED;
  }
}
