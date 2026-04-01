import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createLogger } from "./logger";

const log = createLogger("Checkpoint");

const CHECKPOINT_FILE = join(__dirname, "..", "checkpoint.json");

export interface CheckpointData {
  building: string; // ISO-8601 timestamp
  client: string;
  asset: string;
  contact: string;
  gateDevice: string;
  lastCountCheck: string;
  countMismatches: Array<{
    entity: string;
    coreCount: number;
    crmCount: number;
    detectedAt: string;
  }>;
}

const DEFAULT: CheckpointData = {
  building: "2000-01-01T00:00:00Z",
  client: "2000-01-01T00:00:00Z",
  asset: "2000-01-01T00:00:00Z",
  contact: "2000-01-01T00:00:00Z",
  gateDevice: "2000-01-01T00:00:00Z",
  lastCountCheck: "2000-01-01T00:00:00Z",
  countMismatches: [],
};

let cached: CheckpointData | null = null;

export function load(): CheckpointData {
  if (cached) return cached;

  if (existsSync(CHECKPOINT_FILE)) {
    try {
      const raw = readFileSync(CHECKPOINT_FILE, "utf-8");
      const data: CheckpointData = { ...DEFAULT, ...JSON.parse(raw) };
      cached = data;
      log.info("Checkpoint loaded", data);
      return data;
    } catch (err: any) {
      log.warn(`Failed to load checkpoint file, using defaults: ${err.message}`);
    }
  }

  cached = { ...DEFAULT };
  return cached;
}

export function save(data: Partial<CheckpointData>): void {
  cached = { ...load(), ...data };
  try {
    writeFileSync(CHECKPOINT_FILE, JSON.stringify(cached, null, 2));
  } catch (err: any) {
    log.error(`Failed to save checkpoint: ${err.message}`);
  }
}

export function getLastPollTime(entity: keyof Omit<CheckpointData, "lastCountCheck" | "countMismatches">): Date {
  const cp = load();
  return new Date(cp[entity]);
}

export function updatePollTime(entity: keyof Omit<CheckpointData, "lastCountCheck" | "countMismatches">, time: Date): void {
  save({ [entity]: time.toISOString() });
}
