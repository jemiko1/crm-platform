import { Test, TestingModule } from "@nestjs/testing";
import { AsteriskSyncService } from "./asterisk-sync.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AmiClientService } from "../ami/ami-client.service";
import { TelephonyStateManager } from "../realtime/telephony-state.manager";

describe("AsteriskSyncService", () => {
  const prevAmi = process.env.AMI_ENABLED;

  afterEach(() => {
    process.env.AMI_ENABLED = prevAmi;
  });

  it("syncAll should return early when AMI disabled", async () => {
    process.env.AMI_ENABLED = "false";
    const prisma = { telephonyQueue: { findMany: jest.fn() } };
    const ami = { connected: false, on: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsteriskSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmiClientService, useValue: ami },
        { provide: TelephonyStateManager, useValue: {} },
      ],
    }).compile();
    const service = module.get(AsteriskSyncService);
    await service.syncAll();
    expect(prisma.telephonyQueue.findMany).not.toHaveBeenCalled();
  });

  // April 2026: isAfterHoursQueue must be sticky — set on CREATE based on
  // the AFTER_HOURS_QUEUES env var (bootstrap default), but NEVER
  // overwritten on UPDATE. This lets admins toggle the flag in the DB
  // (or via a future admin UI) without the next sync cycle reverting
  // their change. Before the fix, queue 40's isAfterHoursQueue=true had
  // to be set via env var or it would be reset to false every 5 min.
  describe("syncQueues — isAfterHoursQueue stickiness", () => {
    async function makeService(env: { AFTER_HOURS_QUEUES?: string } = {}) {
      process.env.AMI_ENABLED = "true";
      if (env.AFTER_HOURS_QUEUES !== undefined) {
        process.env.AFTER_HOURS_QUEUES = env.AFTER_HOURS_QUEUES;
      } else {
        delete process.env.AFTER_HOURS_QUEUES;
      }
      const prisma = {
        telephonyQueue: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const ami = { connected: true, on: jest.fn() };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AsteriskSyncService,
          { provide: PrismaService, useValue: prisma },
          { provide: AmiClientService, useValue: ami },
          { provide: TelephonyStateManager, useValue: {} },
        ],
      }).compile();
      const service = module.get<AsteriskSyncService>(AsteriskSyncService);
      return { service, prisma };
    }

    it("writes isAfterHoursQueue=true in CREATE path only when queue name is in env list", async () => {
      const { service, prisma } = await makeService({
        AFTER_HOURS_QUEUES: "40",
      });
      // Override the private CLI fetcher to return a known queue set.
      (service as any).fetchQueuesViaCli = jest
        .fn()
        .mockResolvedValue([
          { name: "30", strategy: "rrmemory" },
          { name: "40", strategy: "rrmemory" },
        ]);

      await service.syncQueues();

      // Two upsert calls — one per queue.
      expect(prisma.telephonyQueue.upsert).toHaveBeenCalledTimes(2);

      const [call30, call40] = prisma.telephonyQueue.upsert.mock.calls;
      // Queue 30: create has isAfterHoursQueue=false (not in env list).
      expect(call30[0].create.isAfterHoursQueue).toBe(false);
      // Queue 40: create has isAfterHoursQueue=true (in env list).
      expect(call40[0].create.isAfterHoursQueue).toBe(true);
    });

    it("NEVER writes isAfterHoursQueue in UPDATE path (stickiness)", async () => {
      const { service, prisma } = await makeService({
        AFTER_HOURS_QUEUES: "40",
      });
      (service as any).fetchQueuesViaCli = jest
        .fn()
        .mockResolvedValue([
          { name: "30", strategy: "rrmemory" },
          { name: "40", strategy: "rrmemory" },
        ]);

      await service.syncQueues();

      for (const call of prisma.telephonyQueue.upsert.mock.calls) {
        // The update branch must NOT include isAfterHoursQueue — the DB
        // value is authoritative after creation.
        expect(Object.keys(call[0].update)).not.toContain(
          "isAfterHoursQueue",
        );
      }
    });

    it("queue never previously marked can be promoted via env and new sync tick (without clobbering DB-manual changes on existing rows)", async () => {
      // Env list widened to include 40. Sync runs. Upsert's CREATE uses the
      // env value, but UPDATE path omits the field — so manually-set DB
      // values on other queues (e.g. admin toggled 30 via admin UI) survive.
      const { service, prisma } = await makeService({
        AFTER_HOURS_QUEUES: "nowork,40",
      });
      (service as any).fetchQueuesViaCli = jest
        .fn()
        .mockResolvedValue([
          { name: "30", strategy: "rrmemory" },
          { name: "40", strategy: "rrmemory" },
          { name: "nowork", strategy: "rrmemory" },
        ]);

      await service.syncQueues();

      for (const call of prisma.telephonyQueue.upsert.mock.calls) {
        expect(Object.keys(call[0].update)).not.toContain(
          "isAfterHoursQueue",
        );
      }
    });
  });
});
