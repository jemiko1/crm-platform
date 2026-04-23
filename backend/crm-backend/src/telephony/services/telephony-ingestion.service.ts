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
import { MissedCallsService } from './missed-calls.service';

@Injectable()
export class TelephonyIngestionService {
  private readonly logger = new Logger(TelephonyIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly callbackService: TelephonyCallbackService,
    private readonly missedCallsService: MissedCallsService,
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

    // B7 — detect internal ext-to-ext calls. FreePBX uses `from-internal`
    // for BOTH external outbound AND internal transfers; we flip the
    // `isInternal` flag when both endpoints match a known
    // TelephonyExtension so stats aggregations can exclude them.
    const isInternal = await this.detectInternalCall(payload);

    // Extract caller and callee numbers with fallbacks.
    //
    // Asterisk's AMI emits `connectedLineNum` as the literal string "<unknown>"
    // (not empty/null) when the call hasn't connected yet. For OUTBOUND calls
    // this is always the case at call_start — the dialed number lives in
    // `extension` (from AMI's Exten field) instead.
    //
    // Without this fallback, every outbound call's calleeNumber is literally
    // "<unknown>", breaking attempt counting, auto-resolve of missed calls,
    // and any other phone-number-based matching.
    const callerNumber = this.cleanNumber(payload.callerIdNum) ?? 'unknown';
    const calleeFromConnected = this.cleanNumber(payload.connectedLineNum);
    const calleeFromExten = this.cleanNumber(payload.extension);
    const calleeNumber =
      direction === CallDirection.OUT
        ? calleeFromExten ?? calleeFromConnected ?? null
        : calleeFromConnected ?? calleeFromExten ?? null;

    // B13 — wrap the multi-step session/leg/event mutation in a single
    // transaction. Pre-fix: a SIGKILL between upsert and callLeg.create
    // left orphan CallSessions with no CUSTOMER leg, silently dropping
    // every future attribution for that call (M5). Now all-or-nothing.
    // We also use the upsert's returned row instead of a second
    // findUnique — saves a round-trip and removes a race where a
    // concurrent duplicate event could interleave.
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.callSession.upsert({
        where: { linkedId },
        create: {
          linkedId,
          uniqueId: event.uniqueId ?? payload.uniqueId ?? null,
          direction,
          isInternal,
          did: payload.context ?? null,
          callerNumber,
          calleeNumber,
          startAt: new Date(event.timestamp),
        },
        update: {
          uniqueId: event.uniqueId ?? payload.uniqueId ?? undefined,
          // Backfill calleeNumber if the create-time value was unknown
          // but a later event has a real number (ConnectedLine update
          // on outbound answer).
          ...(calleeNumber ? { calleeNumber } : {}),
          // isInternal is first-write-wins via the create branch; the
          // update branch never flips it so a late ConnectedLine update
          // doesn't re-classify the session.
        },
      });

      // Create CUSTOMER leg only if one doesn't already exist. On AMI+CDR
      // duplicate `call_start`, two parallel transactions both upsert the
      // session safely (unique constraint), but without this guard they
      // would BOTH create a CUSTOMER leg, inflating touchedCount /
      // handledCount aggregates downstream (DB audit finding M3/M4).
      const existingCustomerLeg = await tx.callLeg.findFirst({
        where: { callSessionId: session.id, type: CallLegType.CUSTOMER },
        select: { id: true },
      });
      if (!existingCustomerLeg) {
        await tx.callLeg.create({
          data: {
            callSessionId: session.id,
            type: CallLegType.CUSTOMER,
            startAt: new Date(event.timestamp),
          },
        });
      }

      // Backfill callSessionId on the CallEvent row (inserted just
      // before this handler ran in dispatch()).
      await tx.callEvent.updateMany({
        where: { idempotencyKey: event.idempotencyKey, callSessionId: null },
        data: { callSessionId: session.id },
      });
    });
  }

  private async handleCallAnswer(
    event: IngestEventItemDto,
    payload: AsteriskEventPayload,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    const answerAt = new Date(event.timestamp);

    // M7 (STATS_STANDARDS.md): answerAt is a terminal first-write-wins field.
    // If CDR arrives after AMI with a slightly different timestamp, preserve
    // the original answer moment — Asterisk's own CDR treats it as immutable.
    const current = await this.prisma.callSession.findUnique({
      where: { id: existingSession.id },
      select: { answerAt: true },
    });

    if (!current?.answerAt) {
      await this.prisma.callSession.update({
        where: { id: existingSession.id },
        data: { answerAt },
      });
    }

    // Update customer leg answer time only if not already set (first-write-wins)
    const customerLeg = await this.prisma.callLeg.findFirst({
      where: { callSessionId: existingSession.id, type: CallLegType.CUSTOMER },
    });
    if (customerLeg && !customerLeg.answerAt) {
      await this.prisma.callLeg.update({
        where: { id: customerLeg.id },
        data: { answerAt },
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
    const fullSession = await this.prisma.callSession.findUnique({
      where: { id: existingSession.id },
      select: {
        answerAt: true,
        endAt: true,
        direction: true,
        finalizedAt: true,
        disposition: true,
        hangupCause: true,
      },
    });

    // M7 (STATS_STANDARDS.md): field-level merge.
    //
    // Terminal fields — disposition, endAt, hangupCause — freeze on the first
    // call_end that carries a concrete disposition. Subsequent replays
    // (typically CDR arriving after AMI or vice-versa) MUST NOT flip those
    // values — Asterisk's own CDR contract treats them as immutable after
    // finalization.
    //
    // Non-terminal fields (CallMetrics nulls, per-leg disconnect timestamps,
    // recording references) remain mergeable: later events may patch a null
    // into a concrete value, but never overwrite an existing one.
    //
    // The legacy guard `!fullSession?.endAt` tracks "this is the first end we
    // see". With finalizedAt we now have an explicit signal that disposition
    // has already been committed, which survives partial writes (e.g. endAt
    // set but disposition still null because of a mid-update crash).
    const isFirstEnd = !fullSession?.endAt;
    const isFinalized = !!fullSession?.finalizedAt;
    const direction = fullSession?.direction;
    const computedDisposition = this.inferDisposition(payload, !!fullSession?.answerAt);

    const updateData: Prisma.CallSessionUpdateInput = {};

    if (!isFinalized && computedDisposition) {
      // First concrete disposition: lock terminal fields and stamp finalizedAt.
      updateData.endAt = endAt;
      updateData.disposition = computedDisposition;
      updateData.hangupCause = payload.causeTxt ?? payload.cause ?? null;
      updateData.finalizedAt = new Date();
    } else {
      // Session is already finalized. Only patch non-terminal fields that are
      // still null. endAt may be patched if the first pass crashed before
      // setting it (isFinalized would also be false in that case, so if we
      // hit this branch endAt is already set). Today this branch is a no-op
      // for CallSession-level fields; non-terminal patching happens on the
      // CallMetrics upsert inside computeMetrics (which already null-guards).
    }

    // B13 — atomically commit the terminal-field update + leg closure +
    // metrics upsert. Previously these were three sequential writes with
    // no transaction boundary: a SIGKILL between steps left sessions
    // finalized with open legs, or finalized with null metrics, polluting
    // stats (M3) and the hydration-on-restart path (active-call rehydrate
    // sweeps `endAt: null` rows).
    const dispositionForLegs =
      fullSession?.disposition ?? computedDisposition ?? null;
    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.callSession.update({
          where: { id: existingSession.id },
          data: updateData,
        });
      }

      // Close any open legs on first end. On replay, legs that were closed
      // previously stay closed; legs still open (shouldn't happen post-
      // freeze, but harmless) are closed with the replayed endAt.
      await tx.callLeg.updateMany({
        where: { callSessionId: existingSession.id, endAt: null },
        data: { endAt, disposition: dispositionForLegs ?? undefined },
      });

      // computeMetrics is null-safe per-field (H5) — passes tx so the
      // metrics commit lands in the same transaction as the terminal
      // session update.
      await this.computeMetrics(existingSession.id, tx);
    });

    if (!isFirstEnd) {
      this.logger.debug(
        `Skipping side-effects for replayed call_end on session ${existingSession.id}`,
      );
      return;
    }

    // Read back the now-finalized session so downstream side-effects see the
    // committed disposition.
    const session = await this.prisma.callSession.findUnique({
      where: { id: existingSession.id },
    });
    if (!session) return;
    const disposition = session.disposition;

    if (disposition === CallDisposition.ANSWERED) {
      // Auto-resolve any pending missed calls for this caller/callee number.
      // Skip "<unknown>" sentinel values that Asterisk emits when caller ID
      // info isn't available — those match no real phone number and just
      // waste a query.
      try {
        const callerNumber =
          this.cleanNumber(session.callerNumber) ??
          this.cleanNumber(payload.callerIdNum);
        const calleeNumber =
          this.cleanNumber(session.calleeNumber) ??
          this.cleanNumber(payload.connectedLineNum) ??
          this.cleanNumber(payload.extension);
        if (callerNumber) {
          await this.missedCallsService.autoResolveByPhone(callerNumber, session.id);
        }
        if (calleeNumber && calleeNumber !== callerNumber) {
          await this.missedCallsService.autoResolveByPhone(calleeNumber, session.id);
        }
      } catch (err: any) {
        this.logger.error(`Auto-resolve missed calls failed for session ${session.id}: ${err.message}`);
      }
    } else if (disposition) {
      if (direction === CallDirection.IN) {
        // Inbound non-answered → create/update MissedCall record
        await this.callbackService.handleNonAnsweredCall(session.id);
      } else if (direction === CallDirection.OUT) {
        // Outbound non-answered → count it as an attempt against any pending
        // inbound MissedCall for the same phone number (if ring ≥ 10s).
        // Do NOT create a new MissedCall row (that was a pre-existing bug).
        try {
          await this.missedCallsService.recordOutboundAttempt(session.id);
        } catch (err: any) {
          this.logger.error(
            `recordOutboundAttempt failed for session ${session.id}: ${err.message}`,
          );
        }
      }
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

    const answerTime = new Date(event.timestamp);

    // M5 (STATS_STANDARDS.md): CallLeg is the source of truth for agent
    // attribution. CallSession.assignedUserId is retained for UI "currently on
    // call" display, but stats queries (handled / touched) read CallLeg.
    //
    // M7: answerAt on CallSession is first-write-wins — do not overwrite.
    const current = await this.prisma.callSession.findUnique({
      where: { id: existingSession.id },
      select: { answerAt: true },
    });
    const sessionUpdate: Prisma.CallSessionUncheckedUpdateInput = {
      assignedUserId: userId,
      assignedExtension: ext ?? null,
    };
    if (!current?.answerAt) {
      sessionUpdate.answerAt = answerTime;
    }

    await this.prisma.callSession.update({
      where: { id: existingSession.id },
      data: sessionUpdate,
    });

    // Update customer leg answer time if not already set
    const customerLeg = await this.prisma.callLeg.findFirst({
      where: { callSessionId: existingSession.id, type: CallLegType.CUSTOMER, answerAt: null },
    });
    if (customerLeg) {
      await this.prisma.callLeg.update({
        where: { id: customerLeg.id },
        data: { answerAt: answerTime },
      });
    }

    // Upsert the AGENT leg. An earlier event may have already created a leg
    // for this agent/extension pair (e.g. CDR replay after AMI); in that case
    // we patch answerAt rather than inserting a duplicate. Keyed on
    // (callSessionId, userId, extension) because two agents can bridge the
    // same session and should each get their own leg.
    const existingOpenLeg = await this.prisma.callLeg.findFirst({
      where: {
        callSessionId: existingSession.id,
        type: CallLegType.AGENT,
        userId,
        extension: ext ?? null,
        endAt: null,
      },
      orderBy: { startAt: 'desc' },
    });

    if (existingOpenLeg) {
      // Patch answerAt only if previously null (first-write-wins for terminal
      // per-leg fields).
      if (!existingOpenLeg.answerAt) {
        await this.prisma.callLeg.update({
          where: { id: existingOpenLeg.id },
          data: { answerAt: answerTime },
        });
      }
    } else {
      await this.prisma.callLeg.create({
        data: {
          callSessionId: existingSession.id,
          type: CallLegType.AGENT,
          userId,
          extension: ext ?? null,
          startAt: answerTime,
          answerAt: answerTime,
        },
      });
    }
  }

  private async handleTransfer(
    event: IngestEventItemDto,
    payload: AsteriskEventPayload,
    existingSession: { id: string } | null,
  ): Promise<void> {
    if (!existingSession) return;

    const transferTime = new Date(event.timestamp);

    // M5 (STATS_STANDARDS.md): transfer closes the prior open agent/transfer
    // leg but does NOT overwrite attribution history. Each agent who engaged
    // with the call keeps their own CallLeg row so `handled` (longest leg)
    // and `touched` (any engaged leg) aggregations can credit both.
    //
    // Close any open AGENT or TRANSFER legs — they're all "who was on this
    // call until now".
    await this.prisma.callLeg.updateMany({
      where: {
        callSessionId: existingSession.id,
        type: { in: [CallLegType.AGENT, CallLegType.TRANSFER] },
        endAt: null,
      },
      data: { endAt: transferTime },
    });

    const ext = payload.extension;
    let userId: string | null = null;

    if (ext) {
      const telExt = await this.prisma.telephonyExtension.findUnique({
        where: { extension: ext },
      });
      userId = telExt?.crmUserId ?? null;
    }

    // Upsert the transfer-target leg (idempotent on replay). The new leg
    // starts "answered" the moment the transfer completes — the target is
    // bridged in immediately.
    const existingOpenTransferLeg = await this.prisma.callLeg.findFirst({
      where: {
        callSessionId: existingSession.id,
        type: CallLegType.TRANSFER,
        userId,
        extension: ext ?? null,
        endAt: null,
      },
      orderBy: { startAt: 'desc' },
    });

    if (!existingOpenTransferLeg) {
      await this.prisma.callLeg.create({
        data: {
          callSessionId: existingSession.id,
          type: CallLegType.TRANSFER,
          userId,
          extension: ext ?? null,
          startAt: transferTime,
          answerAt: transferTime,
        },
      });
    }

    // Increment transfer count in metrics (M7: non-terminal, null-safe upsert
    // is fine — the count is monotonic).
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

    // Keep CallSession.assignedUserId synchronized with the latest connected
    // agent for backward compatibility with UI ("currently on call" display).
    // Stats aggregations now read CallLeg, so this pointer no longer affects
    // attribution math.
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

  /**
   * H4 — SLA threshold is configurable via env (default 20s "80/20 rule").
   * Parsed once at module load; a restart picks up a new value.
   */
  private readonly slaThresholdSeconds = (() => {
    const raw = process.env.TELEPHONY_SLA_THRESHOLD_SEC;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
  })();

  /**
   * computeMetrics — write CallMetrics for a finalized session.
   *
   * Accepts an optional Prisma transaction client (tx) so handleCallEnd
   * can commit session-terminal-fields + legs + metrics atomically.
   * Falls back to `this.prisma` for standalone callers (CDR backfill).
   *
   * H5 — the `update` branch is NULL-PRESERVING: on CDR replay after
   * AMI (or vice-versa), timestamps may differ by a few seconds. The
   * legacy implementation rewrote every field unconditionally, so the
   * second pass could silently shift wait/talk/ring by the skew.
   * M9 — durations are clamped at zero; clock skew between AMI and CDR
   * occasionally produces negative deltas (answerMs > endMs).
   */
  private async computeMetrics(
    sessionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    const session = await db.callSession.findUnique({
      where: { id: sessionId },
      include: { callLegs: true, queue: true, callMetrics: true },
    });
    if (!session || !session.endAt) return;

    const startMs = session.startAt.getTime();
    const answerMs = session.answerAt?.getTime();
    const endMs = session.endAt.getTime();

    // For answered calls: wait = time until answer. For unanswered: wait = total
    // call duration (how long caller waited before hanging up).
    const nonNeg = (n: number) => (n > 0 ? n : 0);
    const waitSeconds = nonNeg(
      answerMs ? (answerMs - startMs) / 1000 : (endMs - startMs) / 1000,
    );
    const talkSeconds = nonNeg(answerMs ? (endMs - answerMs) / 1000 : 0);
    const ringSeconds = waitSeconds;

    const agentLeg = session.callLegs.find((l) => l.type === CallLegType.AGENT);
    const firstResponseSeconds = agentLeg
      ? nonNeg((agentLeg.startAt.getTime() - startMs) / 1000)
      : null;

    const abandonsAfterSeconds =
      session.disposition === CallDisposition.ABANDONED
        ? nonNeg((endMs - startMs) / 1000)
        : null;

    const isSlaMet = answerMs ? waitSeconds <= this.slaThresholdSeconds : false;

    const existing = session.callMetrics;

    // Null-preserve on update: only write a field if the stored value is
    // null (for nullable fields) or zero-default (for numerics with a
    // natural non-computed zero). Never overwrite an existing concrete
    // value — matches the M7 merge rule.
    const updateData: Prisma.CallMetricsUpdateInput = {};
    if (existing) {
      if (existing.waitSeconds === 0 && waitSeconds > 0) updateData.waitSeconds = waitSeconds;
      if (existing.ringSeconds === 0 && ringSeconds > 0) updateData.ringSeconds = ringSeconds;
      if (existing.talkSeconds === 0 && talkSeconds > 0) updateData.talkSeconds = talkSeconds;
      if (existing.firstResponseSeconds === null && firstResponseSeconds !== null) {
        updateData.firstResponseSeconds = firstResponseSeconds;
      }
      if (existing.abandonsAfterSeconds === null && abandonsAfterSeconds !== null) {
        updateData.abandonsAfterSeconds = abandonsAfterSeconds;
      }
      if (existing.isSlaMet === null && answerMs) {
        updateData.isSlaMet = isSlaMet;
      }
      if (existing.slaThresholdSeconds === null) {
        updateData.slaThresholdSeconds = this.slaThresholdSeconds;
      }
    }

    if (existing && Object.keys(updateData).length === 0) {
      return; // nothing to merge
    }

    await db.callMetrics.upsert({
      where: { callSessionId: sessionId },
      create: {
        callSessionId: sessionId,
        waitSeconds,
        ringSeconds,
        talkSeconds,
        firstResponseSeconds,
        abandonsAfterSeconds,
        isSlaMet,
        slaThresholdSeconds: this.slaThresholdSeconds,
      },
      update: updateData,
    });
  }

  private inferDirection(payload: AsteriskEventPayload): CallDirection {
    if (payload.context?.includes('outbound') || payload.context?.includes('from-internal')) {
      return CallDirection.OUT;
    }
    return CallDirection.IN;
  }

  /**
   * B7 — True when BOTH legs of the call are internal extensions (transfers,
   * supervisor dials, ext-to-ext). We look up callerIdNum + connectedLineNum
   * (or extension for outbound) against TelephonyExtension; if both resolve
   * to known extensions, this is internal and stats should exclude it.
   *
   * Only relevant when direction === OUT (inbound external calls never have
   * a caller that matches an internal extension). Safe fast-path for IN.
   */
  private async detectInternalCall(payload: AsteriskEventPayload): Promise<boolean> {
    const direction = this.inferDirection(payload);
    if (direction !== CallDirection.OUT) return false;

    const caller = this.cleanNumber(payload.callerIdNum);
    const callee =
      this.cleanNumber(payload.extension) ??
      this.cleanNumber(payload.connectedLineNum);
    if (!caller || !callee) return false;

    // Extensions on our PBX are 3–4 digits. Anything longer is definitely
    // external — skip the DB round-trip.
    if (caller.length > 4 || callee.length > 4) return false;

    const matches = await this.prisma.telephonyExtension.findMany({
      where: { extension: { in: [caller, callee] }, isActive: true },
      select: { extension: true },
    });
    const found = new Set(matches.map((m) => m.extension));
    return found.has(caller) && found.has(callee);
  }

  /**
   * Normalize a phone number field from AMI events. Asterisk emits the
   * literal string "<unknown>" (not null/empty) when caller ID info is
   * missing. Strip those sentinels and return null for consistent matching.
   */
  private cleanNumber(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed === '<unknown>' || trimmed === 'unknown' || trimmed === 's') return null;
    return trimmed;
  }

  private inferDisposition(
    payload: AsteriskEventPayload,
    sessionAnswered = false,
  ): CallDisposition {
    if (sessionAnswered) {
      return CallDisposition.ANSWERED;
    }

    const causeTxt = (payload.causeTxt ?? '').toUpperCase().replace(/[\s-]+/g, '_');
    const causeCode = (payload.cause ?? '').trim();

    // CDR import sets causeTxt to the literal CDR disposition string "ANSWERED"
    if (causeTxt === 'ANSWERED') {
      return CallDisposition.ANSWERED;
    }
    if (causeTxt.includes('NO_ANSWER') || causeCode === '19') {
      return CallDisposition.NOANSWER;
    }
    if (causeTxt.includes('USER_BUSY') || causeCode === '17') {
      return CallDisposition.BUSY;
    }
    if (causeTxt.includes('ORIGINATOR_CANCEL') || causeCode === '487') {
      return CallDisposition.ABANDONED;
    }
    if (causeTxt.includes('FAILURE') || causeTxt.includes('CONGESTION')) {
      return CallDisposition.FAILED;
    }
    // NORMAL_CLEARING (cause 16) without answerAt = caller hung up or timed out
    if (causeTxt.includes('NORMAL_CLEARING') || causeCode === '16') {
      return CallDisposition.NOANSWER;
    }
    return CallDisposition.MISSED;
  }
}
