import "dotenv/config";
import { createLogger, setLogLevel, LogLevel } from "./logger";

const log = createLogger("Config");

function required(key: string): string {
  const val = process.env[key]?.trim();
  if (!val) {
    log.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export const config = {
  mysql: {
    host: required("CORE_MYSQL_HOST"),
    port: optionalInt("CORE_MYSQL_PORT", 3306),
    user: required("CORE_MYSQL_USER"),
    password: required("CORE_MYSQL_PASSWORD"),
    database: required("CORE_MYSQL_DATABASE"),
  },
  crm: {
    webhookUrl: required("CRM_WEBHOOK_URL"),
    webhookSecret: required("CRM_WEBHOOK_SECRET"),
    timeoutMs: optionalInt("CRM_TIMEOUT_MS", 30000),
    retryAttempts: optionalInt("CRM_RETRY_ATTEMPTS", 3),
    retryBaseMs: optionalInt("CRM_RETRY_BASE_MS", 1000),
  },
  polling: {
    intervalMinutes: optionalInt("POLL_INTERVAL_MINUTES", 5),
    countCheckIntervalMinutes: optionalInt("COUNT_CHECK_INTERVAL_MINUTES", 60),
    nightlyRepairHour: optionalInt("NIGHTLY_REPAIR_HOUR", 3),
  },
  bulk: {
    batchSize: optionalInt("BULK_BATCH_SIZE", 50),
    batchPauseMs: optionalInt("BULK_BATCH_PAUSE_MS", 2000),
  },
  logLevel: optional("LOG_LEVEL", "INFO"),
} as const;

const levelMap: Record<string, LogLevel> = {
  DEBUG: LogLevel.DEBUG,
  INFO: LogLevel.INFO,
  WARN: LogLevel.WARN,
  ERROR: LogLevel.ERROR,
};
setLogLevel(levelMap[config.logLevel.toUpperCase()] ?? LogLevel.INFO);

log.info("Configuration loaded", {
  mysqlHost: config.mysql.host,
  mysqlPort: config.mysql.port,
  mysqlUser: config.mysql.user,
  mysqlDatabase: config.mysql.database,
  crmWebhookUrl: config.crm.webhookUrl,
  pollIntervalMin: config.polling.intervalMinutes,
  countCheckIntervalMin: config.polling.countCheckIntervalMinutes,
});
