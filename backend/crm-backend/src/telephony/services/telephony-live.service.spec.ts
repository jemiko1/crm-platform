import { Test, TestingModule } from "@nestjs/testing";
import { TelephonyLiveService } from "./telephony-live.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TelephonyStateManager } from "../realtime/telephony-state.manager";

describe("TelephonyLiveService", () => {
  let service: TelephonyLiveService;
  let prisma: {
    telephonyQueue: { findMany: jest.Mock };
    callSession: { count: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    telephonyExtension: { findMany: jest.Mock };
  };
  let stateManager: { isAmiConnected: jest.Mock };

  beforeEach(async () => {
    prisma = {
      telephonyQueue: { findMany: jest.fn().mockResolvedValue([]) },
      callSession: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      telephonyExtension: { findMany: jest.fn().mockResolvedValue([]) },
    };
    stateManager = { isAmiConnected: jest.fn().mockReturnValue(false) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyLiveService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelephonyStateManager, useValue: stateManager },
      ],
    }).compile();
    service = module.get(TelephonyLiveService);
  });

  describe("getQueueLiveState", () => {
    it("should use DB fallback when AMI state is not connected", async () => {
      const res = await service.getQueueLiveState();
      expect(res).toEqual([]);
      expect(stateManager.isAmiConnected).toHaveBeenCalled();
    });
  });

  describe("getAgentLiveState (pool model)", () => {
    it("excludes pool rows (crmUserId=null) from the live roster", async () => {
      // Regression guard for the pool-model migration: a pool extension row
      // (crmUserId=null) must never appear as an agent in live state,
      // otherwise managers see phantom "offline" agents for every spare
      // extension sitting in FreePBX.
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { crmUserId: "user-1", displayName: "Alice" },
      ]);
      // The service calls prisma a second time inside attachSipPresence; stub
      // it to return an empty presence array so that call resolves cleanly.
      prisma.telephonyExtension.findMany
        .mockResolvedValueOnce([{ crmUserId: "user-1", displayName: "Alice" }])
        .mockResolvedValueOnce([]);
      prisma.callSession.findFirst.mockResolvedValue(null);
      prisma.callSession.count.mockResolvedValue(0);

      const res = await service.getAgentLiveState();

      expect(res).toHaveLength(1);
      expect(res[0].userId).toBe("user-1");
      // Critically: the WHERE clause must filter out null crmUserId rows,
      // otherwise the map below crashes (userId: null) or leaks pool data.
      const findManyCall = prisma.telephonyExtension.findMany.mock.calls[0][0];
      expect(findManyCall.where).toMatchObject({
        crmUserId: { not: null },
      });
    });
  });
});
