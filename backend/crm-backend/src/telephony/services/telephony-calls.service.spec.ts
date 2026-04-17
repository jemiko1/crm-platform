import { Test, TestingModule } from "@nestjs/testing";
import { TelephonyCallsService } from "./telephony-calls.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PhoneResolverService } from "../../common/phone-resolver/phone-resolver.service";
import { IntelligenceService } from "../../client-intelligence/services/intelligence.service";
import { DataScopeService } from "../../common/utils/data-scope";

describe("TelephonyCallsService", () => {
  let service: TelephonyCallsService;
  let prisma: {
    callSession: { findMany: jest.Mock; count: jest.Mock };
    telephonyExtension: { findMany: jest.Mock };
    client: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      callSession: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      telephonyExtension: { findMany: jest.fn().mockResolvedValue([]) },
      client: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyCallsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PhoneResolverService,
          useValue: {
            normalize: jest.fn(),
            localDigits: jest.fn(),
            buildCallSessionFilter: jest.fn(),
          },
        },
        { provide: IntelligenceService, useValue: { getProfile: jest.fn() } },
        {
          provide: DataScopeService,
          useValue: {
            // Default: superadmin-equivalent scope so existing tests aren't filtered
            resolve: jest.fn().mockResolvedValue({
              scope: "all",
              userId: "test-user",
              userLevel: 999,
              departmentId: null,
              departmentIds: [],
            }),
          },
        },
      ],
    }).compile();
    service = module.get(TelephonyCallsService);
  });

  describe("findAll", () => {
    it("should return paginated empty result with meta", async () => {
      const res = await service.findAll(
        {
          from: new Date().toISOString(),
          to: new Date().toISOString(),
        } as any,
        "test-user",
        true,
      );
      expect(res.data).toEqual([]);
      expect(res.meta.total).toBe(0);
      expect(res.meta.totalPages).toBe(0);
      expect(res.meta.page).toBe(1);
      expect(res.meta.pageSize).toBe(25);
    });

    it("should flatten call session data", async () => {
      const mockSession = {
        id: "s1",
        linkedId: "link1",
        direction: "IN",
        callerNumber: "555-1234",
        calleeNumber: "100",
        assignedUserId: "u1",
        assignedExtension: "100",
        startAt: new Date("2026-01-01T10:00:00Z"),
        answerAt: new Date("2026-01-01T10:00:05Z"),
        endAt: new Date("2026-01-01T10:05:00Z"),
        disposition: "ANSWERED",
        callMetrics: {
          talkSeconds: 295,
          holdSeconds: 0,
          waitSeconds: 5,
          wrapupSeconds: 0,
        },
        queue: { id: "q1", name: "Support" },
        assignedUser: {
          id: "u1",
          email: "agent@test.com",
          employee: { firstName: "John", lastName: "Doe" },
        },
        recordings: [{ id: "r1", durationSeconds: 295 }],
        qualityReview: { id: "qr1", status: "DONE", score: 85 },
      };

      prisma.callSession.findMany.mockResolvedValue([mockSession]);
      prisma.callSession.count.mockResolvedValue(1);
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { crmUserId: "u1", displayName: "Agent Smith" },
      ]);

      const res = await service.findAll(
        {
          from: "2026-01-01",
          to: "2026-01-02",
        } as any,
        "test-user",
        true,
      );

      expect(res.data).toHaveLength(1);
      const call = res.data[0];
      expect(call.queueName).toBe("Support");
      expect(call.agentName).toBe("Agent Smith");
      expect(call.talkTimeSec).toBe(295);
      expect(call.waitTimeSec).toBe(5);
      expect(call.durationSec).toBe(295);
      expect(call.recordingUrl).toContain("/v1/telephony/recordings/r1/audio");
      expect(call.qualityScore).toBe(85);
      expect(call.direction).toBe("IN");
      expect(res.meta.total).toBe(1);
      expect(res.meta.totalPages).toBe(1);
    });
  });
});
