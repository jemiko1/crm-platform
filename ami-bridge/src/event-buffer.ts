import { CrmEvent } from "./event-mapper";
import { createLogger } from "./logger";

const log = createLogger("Buffer");

export class EventBuffer {
  private queue: CrmEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly maxSize: number,
    private readonly flushIntervalMs: number,
    private readonly onFlush: (events: CrmEvent[]) => Promise<void>,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.flushIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  push(events: CrmEvent[]): void {
    this.queue.push(...events);
    log.debug(`Buffered ${events.length} event(s), total=${this.queue.length}`);

    if (this.queue.length >= this.maxSize) {
      this.flush();
    }
  }

  async flushRemaining(): Promise<void> {
    if (this.queue.length > 0) {
      await this.flush();
    }
  }

  get size(): number {
    return this.queue.length;
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);
    log.info(`Flushing ${batch.length} event(s) to CRM`);

    try {
      await this.onFlush(batch);
    } catch (err: any) {
      log.error(`Flush failed, re-queuing ${batch.length} event(s): ${err.message}`);
      this.queue.unshift(...batch);
    }
  }
}
