import { CrmEvent } from "./event-mapper";
import { createLogger } from "./logger";

const log = createLogger("CRM");

export interface CrmPosterOptions {
  baseUrl: string;
  ingestSecret: string;
  timeoutMs: number;
  retryAttempts: number;
  retryBaseMs: number;
}

export interface IngestResponse {
  processed: number;
  skipped: number;
  errors: Array<{ idempotencyKey: string; error: string }>;
}

export class CrmPoster {
  private readonly url: string;
  private totalPosted = 0;
  private totalErrors = 0;
  private lastSuccessAt: Date | null = null;

  constructor(private readonly opts: CrmPosterOptions) {
    this.url = `${opts.baseUrl}/v1/telephony/events`;
    log.info(`CRM ingest endpoint: ${this.url}`);
  }

  async post(events: CrmEvent[]): Promise<void> {
    if (events.length === 0) return;

    const body = JSON.stringify({ events });
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.opts.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs);

        const resp = await fetch(this.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telephony-secret": this.opts.ingestSecret,
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
        }

        const result = (await resp.json()) as IngestResponse;

        this.totalPosted += result.processed;
        this.totalErrors += result.errors.length;
        this.lastSuccessAt = new Date();

        log.info(
          `POST OK: processed=${result.processed}, skipped=${result.skipped}, errors=${result.errors.length}`,
        );

        if (result.errors.length > 0) {
          for (const e of result.errors) {
            log.warn(`  Event error: ${e.idempotencyKey} -> ${e.error}`);
          }
        }

        return;
      } catch (err: any) {
        lastError = err;
        const isLast = attempt === this.opts.retryAttempts;
        const delay = this.opts.retryBaseMs * Math.pow(2, attempt - 1);

        if (isLast) {
          log.error(`POST failed after ${attempt} attempts: ${err.message}`);
        } else {
          log.warn(`POST attempt ${attempt} failed: ${err.message}, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("POST failed");
  }

  getStats(): { totalPosted: number; totalErrors: number; lastSuccessAt: Date | null; minutesSinceSuccess: number | null } {
    const minutesSinceSuccess = this.lastSuccessAt
      ? Math.round((Date.now() - this.lastSuccessAt.getTime()) / 60_000)
      : null;
    return { totalPosted: this.totalPosted, totalErrors: this.totalErrors, lastSuccessAt: this.lastSuccessAt, minutesSinceSuccess };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
