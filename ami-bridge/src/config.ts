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
  ami: {
    host: required("AMI_HOST"),
    port: optionalInt("AMI_PORT", 5038),
    username: required("AMI_USER"),
    secret: required("AMI_SECRET"),
    reconnectBaseMs: optionalInt("AMI_RECONNECT_BASE_MS", 2000),
    reconnectMaxMs: optionalInt("AMI_RECONNECT_MAX_MS", 60000),
    pingIntervalMs: optionalInt("AMI_PING_INTERVAL_MS", 30000),
  },
  crm: {
    baseUrl: required("CRM_BASE_URL"),
    ingestSecret: required("TELEPHONY_INGEST_SECRET"),
    timeoutMs: optionalInt("CRM_TIMEOUT_MS", 15000),
    retryAttempts: optionalInt("CRM_RETRY_ATTEMPTS", 3),
    retryBaseMs: optionalInt("CRM_RETRY_BASE_MS", 1000),
  },
  buffer: {
    maxSize: optionalInt("BUFFER_MAX_SIZE", 20),
    flushIntervalMs: optionalInt("BUFFER_FLUSH_INTERVAL_MS", 3000),
  },
  healthPort: optionalInt("HEALTH_PORT", 3100),
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
  amiHost: config.ami.host,
  amiPort: config.ami.port,
  amiUser: config.ami.username,
  crmBaseUrl: config.crm.baseUrl,
  bufferMaxSize: config.buffer.maxSize,
  bufferFlushMs: config.buffer.flushIntervalMs,
});
