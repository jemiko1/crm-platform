import { CrmEvent } from "./event-mapper";
import { createLogger } from "./logger";

const log = createLogger("Buffer");

const MAX_QUEUE_LIMIT = 5000;

export class EventBuffer {
  private queue: CrmEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    private readonly maxSize: number,
    private readonly flushIntervalMs: number,
    private readonly onFlush: (events: CrmEvent[]) => Promise<void>,
    private readonly maxQueueSize: number = MAX_QUEUE_LIMIT,
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

    if (this.queue.length > this.maxQueueSize) {
      const evicted = this.queue.length - this.maxQueueSize;
      this.queue = this.queue.slice(evicted);
      log.warn(`Queue overflow: evicted ${evicted} oldest event(s) to stay within ${this.maxQueueSize} limit`);
    }

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
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    const batch = this.queue.splice(0);
    log.info(`Flushing ${batch.length} event(s) to CRM`);

    try {
      await this.onFlush(batch);
    } catch (err: any) {
      log.error(`Flush failed, re-queuing ${batch.length} event(s): ${err.message}`);
      this.queue.unshift(...batch);
    } finally {
      this.flushing = false;
    }
  }
}
