import { AmiEvent } from "./ami-client";
import { createLogger } from "./logger";

const log = createLogger("Mapper");

export interface CrmEvent {
  eventType: string;
  timestamp: string;
  idempotencyKey: string;
  linkedId: string;
  uniqueId?: string;
  payload: Record<string, unknown>;
}

/**
 * Tracks in-flight call state so we can:
 * - Filter duplicate Newchannel events (only first channel per linkedId)
 * - Detect recordings via VarSet/MixMonitor events
 * - Emit recording_ready on call_end if a recording was captured
 */
interface CallState {
  linkedId: string;
  answered: boolean;
  recordingFile: string | null;
  recordingStarted: boolean;
  createdAt: number;
}

const AMI_EVENTS_OF_INTEREST = new Set([
  "Newchannel",
  "Hangup",
  "QueueCallerJoin",
  "QueueCallerLeave",
  "AgentConnect",
  "BlindTransfer",
  "AttendedTransfer",
  "MusicOnHoldStart",
  "MusicOnHoldStop",
  "VarSet",
  "MixMonitor",
  "Cdr",
]);

export class EventMapper {
  private calls = new Map<string, CallState>();

  map(evt: AmiEvent): CrmEvent[] {
    if (!AMI_EVENTS_OF_INTEREST.has(evt.Event)) return [];

    const linkedId = evt.Linkedid;
    if (!linkedId) return [];

    switch (evt.Event) {
      case "Newchannel":
        return this.onNewchannel(evt, linkedId);
      case "Hangup":
        return this.onHangup(evt, linkedId);
      case "QueueCallerJoin":
        return this.onQueueCallerJoin(evt, linkedId);
      case "QueueCallerLeave":
        return this.onQueueCallerLeave(evt, linkedId);
      case "AgentConnect":
        return this.onAgentConnect(evt, linkedId);
      case "BlindTransfer":
      case "AttendedTransfer":
        return this.onTransfer(evt, linkedId);
      case "MusicOnHoldStart":
        return this.onHold(evt, linkedId, "hold_start");
      case "MusicOnHoldStop":
        return this.onHold(evt, linkedId, "hold_end");
      case "VarSet":
        return this.onVarSet(evt, linkedId);
      case "MixMonitor":
        return this.onMixMonitor(evt, linkedId);
      case "Cdr":
        return this.onCdr(evt, linkedId);
      default:
        return [];
    }
  }

  getActiveCallCount(): number {
    return this.calls.size;
  }

  purgeStale(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let purged = 0;
    for (const [linkedId, state] of this.calls) {
      if (state.createdAt < cutoff) {
        this.calls.delete(linkedId);
        purged++;
      }
    }
    return purged;
  }

  // ── Event Handlers ──────────────────────────────────────

  private onNewchannel(evt: AmiEvent, linkedId: string): CrmEvent[] {
    if (evt.Uniqueid !== linkedId) return [];
    if (this.calls.has(linkedId)) return [];

    this.calls.set(linkedId, {
      linkedId,
      answered: false,
      recordingFile: null,
      recordingStarted: false,
      createdAt: Date.now(),
    });

    log.debug(`call_start: ${linkedId}, caller=${evt.CallerIDNum}`);

    return [
      {
        eventType: "call_start",
        timestamp: new Date().toISOString(),
        idempotencyKey: `${linkedId}-call_start`,
        linkedId,
        uniqueId: evt.Uniqueid,
        payload: {
          uniqueId: evt.Uniqueid,
          linkedId,
          channel: evt.Channel,
          callerIdNum: evt.CallerIDNum || "unknown",
          callerIdName: evt.CallerIDName || null,
          connectedLineNum: evt.ConnectedLineNum || null,
          context: evt.Context || null,
          extension: evt.Exten || null,
        },
      },
    ];
  }

  private onHangup(evt: AmiEvent, linkedId: string): CrmEvent[] {
    if (evt.Uniqueid !== linkedId) return [];

    const events: CrmEvent[] = [
      {
        eventType: "call_end",
        timestamp: new Date().toISOString(),
        idempotencyKey: `${linkedId}-call_end`,
        linkedId,
        uniqueId: evt.Uniqueid,
        payload: {
          uniqueId: evt.Uniqueid,
          linkedId,
          channel: evt.Channel,
          cause: evt.Cause || null,
          causeTxt: evt["Cause-txt"] || null,
        },
      },
    ];

    const state = this.calls.get(linkedId);
    if (state?.recordingFile) {
      log.debug(`recording_ready: ${linkedId}, file=${state.recordingFile}`);
      events.push({
        eventType: "recording_ready",
        timestamp: new Date().toISOString(),
        idempotencyKey: `${linkedId}-recording_ready`,
        linkedId,
        payload: {
          linkedId,
          recordingFile: state.recordingFile,
          recordingDuration: null,
        },
      });
    }

    this.calls.delete(linkedId);
    log.debug(`call_end: ${linkedId}, cause=${evt.Cause} ${evt["Cause-txt"]}`);

    return events;
  }

  private onQueueCallerJoin(evt: AmiEvent, linkedId: string): CrmEvent[] {
    return [
      {
        eventType: "queue_enter",
        timestamp: new Date().toISOString(),
        idempotencyKey: `${linkedId}-queue_enter-${evt.Uniqueid}`,
        linkedId,
        payload: {
          uniqueId: evt.Uniqueid,
          linkedId,
          queue: evt.Queue || null,
          position: evt.Position ? parseInt(evt.Position, 10) : null,
        },
      },
    ];
  }

  private onQueueCallerLeave(evt: AmiEvent, linkedId: string): CrmEvent[] {
    return [
      {
        eventType: "queue_leave",
        timestamp: new Date().toISOString(),
        idempotencyKey: `${linkedId}-queue_leave-${evt.Uniqueid}`,
        linkedId,
        payload: {
          uniqueId: evt.Uniqueid,
          linkedId,
          queue: evt.Queue || null,
          position: evt.Position ? parseInt(evt.Position, 10) : null,
        },
      },
    ];
  }

  private onAgentConnect(evt: AmiEvent, linkedId: string): CrmEvent[] {
    const extension = this.extractExtension(evt.Interface || evt.MemberName || "");

    const state = this.calls.get(linkedId);
    if (state) state.answered = true;

    const events: CrmEvent[] = [
      {
        eventType: "agent_connect",
        timestamp: new Date().toISOString(),
        idempotencyKey: `${linkedId}-agent_connect-${extension || evt.Uniqueid}`,
        linkedId,
        payload: {
          uniqueId: evt.Uniqueid,
          linkedId,
          extension,
          queue: evt.Queue || null,
          holdTime: evt.HoldTime ? parseInt(evt.HoldTime, 10) : null,
        },
      },
      {
        eventType: "call_answer",
        timestamp: new Date().toISOString(),
        idempotencyKey: `${linkedId}-call_answer`,
        linkedId,
        payload: {
          uniqueId: evt.Uniqueid,
          linkedId,
          channel: evt.Interface || null,
        },
      },
    ];

    log.debug(`agent_connect + call_answer: ${linkedId}, ext=${extension}`);
    return events;
  }

  private onTransfer(evt: AmiEvent, linkedId: string): CrmEvent[] {
    const extension =
      this.extractExtension(evt.TransferTargetChannel || "") ||
      evt.TransferExten ||
      evt.Extension ||
      null;

    log.debug(`transfer: ${linkedId}, target=${extension}`);

    return [
      {
        eventType: "transfer",
        timestamp: new Date().toISOString(),
        idempotencyKey: this.buildTransferIdempotencyKey(evt, linkedId),
        linkedId,
        payload: {
          uniqueId: evt.Uniqueid,
          linkedId,
          extension,
        },
      },
    ];
  }

  private onHold(evt: AmiEvent, linkedId: string, type: "hold_start" | "hold_end"): CrmEvent[] {
    const state = this.calls.get(linkedId);
    if (!state?.answered) return [];

    return [
      {
        eventType: type,
        timestamp: new Date().toISOString(),
        idempotencyKey: this.buildHoldIdempotencyKey(evt, type),
        linkedId,
        payload: {
          uniqueId: evt.Uniqueid,
          linkedId,
        },
      },
    ];
  }

  // ── Idempotency key builders ────────────────────────────
  // These used to embed Date.now(), which meant every bridge restart and
  // every retry produced a fresh key and the backend's CallEvent.idempotencyKey
  // uniqueness guard missed them. With multiple concurrent crm_ami sessions
  // on the PBX (observed: 3 stacked), this inflated transfer counts and
  // hold seconds by Nx. The key must now be deterministic: stable across
  // bridge restarts for the same underlying AMI event, distinct for
  // genuinely different events.
  //
  // See audit/phase1-telephony-stats.md check #6 (finding P1-8).

  /**
   * Transfer key: `transfer:${linkedid}:${originalUniqueid}:${targetChannel}`
   *
   * - linkedid identifies the call.
   * - evt.Uniqueid identifies the originating channel (stable across restart).
   * - TransferTargetChannel (or TransferExten/Extension fallback) identifies
   *   which leg was transferred — distinguishes multiple sequential transfers
   *   on the same call.
   */
  generateTransferIdempotencyKey(evt: AmiEvent, linkedId: string): string {
    return this.buildTransferIdempotencyKey(evt, linkedId);
  }

  /**
   * Hold key: `hold:${eventType}:${channelUniqueid}:${ts}`
   *
   * - eventType distinguishes hold_start from hold_end.
   * - channelUniqueid (evt.Uniqueid) identifies the channel under hold.
   * - ts is the AMI event's event-carried Timestamp (NOT wall-clock). If the
   *   bridge replays the same AMI event the timestamp is identical, so the
   *   dedup guard hits. If timestamp is unavailable (Asterisk manager.conf
   *   without `timestampevents=yes`) we fall back to the Linkedid so the key
   *   is still deterministic — in that case the channel + event-type combo is
   *   the content address.
   */
  generateHoldIdempotencyKey(
    evt: AmiEvent,
    type: "hold_start" | "hold_end",
  ): string {
    return this.buildHoldIdempotencyKey(evt, type);
  }

  private buildTransferIdempotencyKey(
    evt: AmiEvent,
    linkedId: string,
  ): string {
    const originalUniqueid = evt.Uniqueid || "unknown";
    const targetChannel =
      evt.TransferTargetChannel ||
      evt.TransferExten ||
      evt.Extension ||
      "unknown";
    return `transfer:${linkedId}:${originalUniqueid}:${targetChannel}`;
  }

  private buildHoldIdempotencyKey(
    evt: AmiEvent,
    type: "hold_start" | "hold_end",
  ): string {
    const channelUniqueid = evt.Uniqueid || "unknown";
    const ts = evt.Timestamp || evt.Linkedid || "0";
    return `hold:${type}:${channelUniqueid}:${ts}`;
  }

  private onVarSet(evt: AmiEvent, linkedId: string): CrmEvent[] {
    const varName = evt.Variable;
    if (varName !== "CALLFILENAME" && varName !== "MIXMONITOR_FILENAME") return [];

    const state = this.calls.get(linkedId);
    if (state && evt.Value) {
      state.recordingFile = evt.Value;
      log.debug(`Recording path captured: ${linkedId} -> ${evt.Value}`);
    }
    return [];
  }

  private onMixMonitor(evt: AmiEvent, linkedId: string): CrmEvent[] {
    const state = this.calls.get(linkedId);
    if (state) {
      state.recordingStarted = true;
      if (!state.recordingFile && evt.File) {
        state.recordingFile = evt.File;
      }
    }
    return [];
  }

  private onCdr(evt: AmiEvent, linkedId: string): CrmEvent[] {
    if (!evt.RecordingFile && !evt.LastData?.includes("MixMonitor")) return [];

    const state = this.calls.get(linkedId);
    if (state && evt.RecordingFile && !state.recordingFile) {
      state.recordingFile = evt.RecordingFile;
    }
    return [];
  }

  // ── Helpers ─────────────────────────────────────────────

  private extractExtension(channel: string): string | null {
    // PJSIP/101-00000001 → 101
    // SIP/101-00000001 → 101
    // Local/101@... → 101
    const match = channel.match(/(?:PJSIP|SIP|IAX2)\/(\d+)/i);
    if (match) return match[1];

    const localMatch = channel.match(/Local\/(\d+)@/i);
    if (localMatch) return localMatch[1];

    return null;
  }
}
