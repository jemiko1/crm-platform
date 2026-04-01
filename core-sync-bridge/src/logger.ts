export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO ",
  [LogLevel.WARN]: "WARN ",
  [LogLevel.ERROR]: "ERROR",
};

let currentLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function ts(): string {
  return new Date().toISOString();
}

function emit(
  level: LogLevel,
  context: string,
  msg: string,
  data?: unknown,
): void {
  if (level < currentLevel) return;
  const prefix = `${ts()} [${LEVEL_LABELS[level]}] [${context}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${msg}`, data);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

export function createLogger(context: string) {
  return {
    debug: (msg: string, data?: unknown) =>
      emit(LogLevel.DEBUG, context, msg, data),
    info: (msg: string, data?: unknown) =>
      emit(LogLevel.INFO, context, msg, data),
    warn: (msg: string, data?: unknown) =>
      emit(LogLevel.WARN, context, msg, data),
    error: (msg: string, data?: unknown) =>
      emit(LogLevel.ERROR, context, msg, data),
  };
}
