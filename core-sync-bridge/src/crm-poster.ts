import { randomUUID } from "crypto";
import { config } from "./config";
import { createLogger } from "./logger";

const log = createLogger("CRM");

export interface WebhookPayload {
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
}

let totalPosted = 0;
let totalErrors = 0;
let lastSuccessAt: Date | null = null;

/**
 * Post a single webhook event to CRM.
 * Retries with exponential backoff on failure.
 */
export async function postWebhook(
  eventType: string,
  payload: Record<string, any>,
): Promise<void> {
  const body: WebhookPayload = {
    eventId: randomUUID(),
    eventType,
    payload,
  };

  const jsonBody = JSON.stringify(body);
  let lastError: Error | null = null;

  for (
    let attempt = 1;
    attempt <= config.crm.retryAttempts;
    attempt++
  ) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.crm.timeoutMs,
      );

      const resp = await fetch(config.crm.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-core-secret": config.crm.webhookSecret,
        },
        body: jsonBody,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }

      totalPosted++;
      lastSuccessAt = new Date();

      log.debug(
        `POST OK: ${eventType} coreId=${payload.coreId ?? "?"}`,
      );
      return;
    } catch (err: any) {
      lastError = err;
      const isLast = attempt === config.crm.retryAttempts;
      const delay = config.crm.retryBaseMs * Math.pow(2, attempt - 1);

      if (isLast) {
        totalErrors++;
        log.error(
          `POST failed after ${attempt} attempts: ${eventType} coreId=${payload.coreId ?? "?"}: ${err.message}`,
        );
      } else {
        log.warn(
          `POST attempt ${attempt} failed: ${err.message}, retrying in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error("POST failed");
}

/**
 * Post multiple webhook events, continuing on individual failures.
 * Returns count of successful and failed posts.
 */
export async function postBatch(
  events: Array<{ eventType: string; payload: Record<string, any> }>,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;

  for (const evt of events) {
    try {
      await postWebhook(evt.eventType, evt.payload);
      ok++;
    } catch {
      failed++;
    }
  }

  return { ok, failed };
}

export function getStats(): {
  totalPosted: number;
  totalErrors: number;
  lastSuccessAt: Date | null;
  minutesSinceSuccess: number | null;
} {
  const minutesSinceSuccess = lastSuccessAt
    ? Math.round((Date.now() - lastSuccessAt.getTime()) / 60_000)
    : null;
  return {
    totalPosted,
    totalErrors,
    lastSuccessAt,
    minutesSinceSuccess,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
