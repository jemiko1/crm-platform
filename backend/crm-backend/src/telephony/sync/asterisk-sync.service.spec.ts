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

  // April 2026: when an extension is deleted from FreePBX (admin removes it
  // via GUI, Bulk Handler, or fwconsole), the next syncExtensions tick must
  // hard-delete the corresponding CRM row. Hard-delete is safe because every
  // history table stores the extension as a string snapshot, not as a FK.
  // Two safety guards: (1) cleanup never runs if AMI fetch failed (handled
  // by the existing early return), and (2) sanity threshold — refuse to
  // delete more than 50% of current rows in one tick to catch sync bugs.
  describe("syncExtensions — cleanup of stale CRM rows", () => {
    async function makeService() {
      process.env.AMI_ENABLED = "true";
      const prisma = {
        telephonyExtension: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        user: { findFirst: jest.fn() },
      };
      const ami = { connected: true, on: jest.fn() };
      const stateManager = { refreshExtensionMap: jest.fn() };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AsteriskSyncService,
          { provide: PrismaService, useValue: prisma },
          { provide: AmiClientService, useValue: ami },
          { provide: TelephonyStateManager, useValue: stateManager },
        ],
      }).compile();
      const service = module.get<AsteriskSyncService>(AsteriskSyncService);
      return { service, prisma };
    }

    it("hard-deletes CRM rows whose extension is no longer in FreePBX", async () => {
      const { service, prisma } = await makeService();
      // FreePBX returns 200, 201, 202 (admin deleted 203 only — typical case).
      (service as any).fetchEndpointsViaCli = jest
        .fn()
        .mockResolvedValue([
          { extension: "200", status: "Avail" },
          { extension: "201", status: "Avail" },
          { extension: "202", status: "Avail" },
        ]);
      prisma.telephonyExtension.findUnique.mockImplementation(
        ({ where }: any) =>
          ["200", "201", "202"].includes(where.extension)
            ? Promise.resolve({
                id: `id-${where.extension}`,
                extension: where.extension,
                sipPassword: "x",
                crmUserId: null,
                displayName: where.extension,
                sipServer: null,
              })
            : Promise.resolve(null),
      );
      // CRM still has 203 from before it was deleted in FreePBX.
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { id: "id-200", extension: "200" },
        { id: "id-201", extension: "201" },
        { id: "id-202", extension: "202" },
        { id: "id-203", extension: "203" },
      ]);

      await service.syncExtensions();

      expect(prisma.telephonyExtension.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["id-203"] } },
      });
    });

    it("never deletes anything when FreePBX query fails (early return)", async () => {
      const { service, prisma } = await makeService();
      (service as any).fetchEndpointsViaCli = jest
        .fn()
        .mockRejectedValue(new Error("AMI not connected"));

      await service.syncExtensions();

      expect(prisma.telephonyExtension.findMany).not.toHaveBeenCalled();
      expect(prisma.telephonyExtension.deleteMany).not.toHaveBeenCalled();
    });

    it("hard-deletes ALL stale rows even when most of the table goes (mass-delete is trusted)", async () => {
      // Admin's normal workflow includes wiping all FreePBX extensions
      // and recreating them in bulk. Cleanup must NOT block that — there
      // is no mass-delete threshold. We trust what FreePBX reports.
      const { service, prisma } = await makeService();
      // FreePBX returns just 1 endpoint — admin deleted 4 of 5 (80%).
      (service as any).fetchEndpointsViaCli = jest
        .fn()
        .mockResolvedValue([{ extension: "200", status: "Avail" }]);
      prisma.telephonyExtension.findUnique.mockImplementation(
        ({ where }: any) =>
          where.extension === "200"
            ? Promise.resolve({
                id: "id-200",
                extension: "200",
                sipPassword: "x",
                crmUserId: null,
                displayName: "200",
                sipServer: null,
              })
            : Promise.resolve(null),
      );
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { id: "id-200", extension: "200" },
        { id: "id-201", extension: "201" },
        { id: "id-202", extension: "202" },
        { id: "id-203", extension: "203" },
        { id: "id-204", extension: "204" },
      ]);

      await service.syncExtensions();

      expect(prisma.telephonyExtension.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["id-201", "id-202", "id-203", "id-204"] } },
      });
    });

    it("does not run cleanup when there's nothing stale", async () => {
      const { service, prisma } = await makeService();
      (service as any).fetchEndpointsViaCli = jest
        .fn()
        .mockResolvedValue([
          { extension: "200", status: "Avail" },
          { extension: "201", status: "Avail" },
        ]);
      prisma.telephonyExtension.findUnique.mockImplementation(
        ({ where }: any) =>
          Promise.resolve({
            id: `id-${where.extension}`,
            extension: where.extension,
            sipPassword: "x",
            crmUserId: null,
            displayName: where.extension,
            sipServer: null,
          }),
      );
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { id: "id-200", extension: "200" },
        { id: "id-201", extension: "201" },
      ]);

      await service.syncExtensions();

      expect(prisma.telephonyExtension.deleteMany).not.toHaveBeenCalled();
    });
  });
});
