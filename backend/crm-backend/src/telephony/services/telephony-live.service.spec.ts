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
  let stateManager: {
    isAmiConnected: jest.Mock;
    getAgentStates: jest.Mock;
  };

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
    stateManager = {
      isAmiConnected: jest.fn().mockReturnValue(false),
      getAgentStates: jest.fn().mockReturnValue([]),
    };
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

  describe("getAgentLiveState — qualifying-agents filter (Bug 2)", () => {
    it("filters the live roster to users with CALL_CENTER role + queue 30 membership", async () => {
      // Bug 2 — even if the in-memory map (or DB fallback) returns several
      // users, only those whose Position has RoleGroup CALL_CENTER AND a
      // PositionQueueRule for queue "30" should appear in the response.
      stateManager.isAmiConnected.mockReturnValue(true);
      stateManager.getAgentStates.mockReturnValue([
        {
          userId: "operator-1",
          displayName: "Operator One",
          presence: "OFFLINE",
          callStartedAt: null,
          callsHandledToday: 0,
          pausedReason: null,
        },
        {
          userId: "manager-1",
          displayName: "Manager One",
          presence: "OFFLINE",
          callStartedAt: null,
          callsHandledToday: 0,
          pausedReason: null,
        },
        {
          userId: "it-1",
          displayName: "IT One",
          presence: "OFFLINE",
          callStartedAt: null,
          callsHandledToday: 0,
          pausedReason: null,
        },
      ]);
      // First findMany: qualifying-agents query (returns operator-1 only).
      // Second findMany: SIP presence enrichment.
      prisma.telephonyExtension.findMany
        .mockResolvedValueOnce([{ crmUserId: "operator-1" }])
        .mockResolvedValueOnce([
          {
            crmUserId: "operator-1",
            sipRegistered: false,
            sipLastSeenAt: null,
          },
        ]);

      const res = await service.getAgentLiveState();

      expect(res).toHaveLength(1);
      expect(res[0].userId).toBe("operator-1");
      // The qualifying-userIds query must walk the user → employee →
      // position → roleGroup chain and check PositionQueueRule for queue
      // "30". Without this, supervisors/IT show up in the agents grid.
      const qualifyingCall = prisma.telephonyExtension.findMany.mock.calls[0][0];
      expect(qualifyingCall.where.user.employee.position.roleGroup.code).toBe(
        "CALL_CENTER",
      );
      expect(
        qualifyingCall.where.user.employee.position.queueRules.some.queue.name,
      ).toBe("30");
    });

    it("excludes pool extensions (crmUserId=null) from the qualifying set", async () => {
      // Regression guard for the pool-model migration: pool rows must
      // never appear as agents on the live page. The where clause shape
      // is the explicit guarantee.
      stateManager.isAmiConnected.mockReturnValue(true);
      stateManager.getAgentStates.mockReturnValue([]);
      prisma.telephonyExtension.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getAgentLiveState();

      const qualifyingCall =
        prisma.telephonyExtension.findMany.mock.calls[0][0];
      expect(qualifyingCall.where).toMatchObject({
        crmUserId: { not: null },
        isActive: true,
      });
    });
  });

  describe("getAgentLiveState — SIP-presence override (Bug 1 + Bug 3)", () => {
    function setupSingleQualifyingAgent(
      presence: { sipRegistered: boolean; sipLastSeenAt: Date | null } = {
        sipRegistered: false,
        sipLastSeenAt: null,
      },
    ) {
      stateManager.isAmiConnected.mockReturnValue(true);
      stateManager.getAgentStates.mockReturnValue([
        {
          userId: "operator-1",
          displayName: "Operator One",
          presence: "OFFLINE",
          callStartedAt: null,
          callsHandledToday: 0,
          pausedReason: null,
        },
      ]);
      prisma.telephonyExtension.findMany
        .mockResolvedValueOnce([{ crmUserId: "operator-1" }])
        .mockResolvedValueOnce([
          {
            crmUserId: "operator-1",
            sipRegistered: presence.sipRegistered,
            sipLastSeenAt: presence.sipLastSeenAt,
          },
        ]);
    }

    it("promotes OFFLINE to IDLE when softphone heartbeat is fresh (Bug 1)", async () => {
      // Freshly-registered softphone — in-memory map still says OFFLINE
      // (no AgentConnect yet), but the heartbeat says SIP is alive.
      // Without this override the operator stays "Offline" until first call.
      setupSingleQualifyingAgent({
        sipRegistered: true,
        sipLastSeenAt: new Date(),
      });

      const res = await service.getAgentLiveState();

      expect(res[0].currentState).toBe("IDLE");
      expect(res[0].sipRegistered).toBe(true);
    });

    it("forces OFFLINE when heartbeat is stale even if state map says IDLE (Bug 3)", async () => {
      // Bela was just on a call so the in-memory map flipped her to IDLE on
      // hangup. Then her softphone unregistered (e.g. user switched to
      // sofo). Stale heartbeat must override the lingering IDLE.
      stateManager.isAmiConnected.mockReturnValue(true);
      stateManager.getAgentStates.mockReturnValue([
        {
          userId: "operator-1",
          displayName: "Bela",
          presence: "IDLE",
          callStartedAt: null,
          callsHandledToday: 1,
          pausedReason: null,
        },
      ]);
      const stale = new Date(Date.now() - 5 * 60_000); // 5 min old
      prisma.telephonyExtension.findMany
        .mockResolvedValueOnce([{ crmUserId: "operator-1" }])
        .mockResolvedValueOnce([
          {
            crmUserId: "operator-1",
            sipRegistered: false,
            sipLastSeenAt: stale,
          },
        ]);

      const res = await service.getAgentLiveState();

      expect(res[0].currentState).toBe("OFFLINE");
    });

    it("keeps ON_CALL even when sipRegistered=true (call activity wins over default IDLE)", async () => {
      stateManager.isAmiConnected.mockReturnValue(true);
      stateManager.getAgentStates.mockReturnValue([
        {
          userId: "operator-1",
          displayName: "Operator One",
          presence: "ON_CALL",
          callStartedAt: new Date(Date.now() - 30_000),
          callsHandledToday: 0,
          pausedReason: null,
        },
      ]);
      prisma.telephonyExtension.findMany
        .mockResolvedValueOnce([{ crmUserId: "operator-1" }])
        .mockResolvedValueOnce([
          {
            crmUserId: "operator-1",
            sipRegistered: true,
            sipLastSeenAt: new Date(),
          },
        ]);

      const res = await service.getAgentLiveState();

      expect(res[0].currentState).toBe("ON_CALL");
    });

    it("treats null sipLastSeenAt as offline (never-heartbeated extension)", async () => {
      setupSingleQualifyingAgent({
        sipRegistered: false,
        sipLastSeenAt: null,
      });

      const res = await service.getAgentLiveState();

      expect(res[0].currentState).toBe("OFFLINE");
    });

    it("treats sipRegistered=true with null sipLastSeenAt as offline (orphan row)", async () => {
      // Edge case: the row claims registered but has no heartbeat
      // timestamp. Can only happen if the column was populated
      // out-of-band (manual SQL, broken migration). The freshness check
      // must require a non-null timestamp, otherwise we'd promote a stale
      // operator to IDLE indefinitely.
      setupSingleQualifyingAgent({
        sipRegistered: true,
        sipLastSeenAt: null,
      });

      const res = await service.getAgentLiveState();

      expect(res[0].currentState).toBe("OFFLINE");
    });
  });
});
