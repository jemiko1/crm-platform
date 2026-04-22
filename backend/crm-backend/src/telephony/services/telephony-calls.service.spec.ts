import { Test, TestingModule } from "@nestjs/testing";
import { TelephonyCallsService } from "./telephony-calls.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PhoneResolverService } from "../../common/phone-resolver/phone-resolver.service";
import { IntelligenceService } from "../../client-intelligence/services/intelligence.service";
import { DataScopeService } from "../../common/utils/data-scope";
import { RecordingAccessService } from "../recording/recording-access.service";

describe("TelephonyCallsService", () => {
  let service: TelephonyCallsService;
  let prisma: {
    callSession: { findMany: jest.Mock; count: jest.Mock };
    telephonyExtension: { findMany: jest.Mock; findUnique: jest.Mock };
    client: { findMany: jest.Mock; findFirst: jest.Mock };
    lead: { findFirst: jest.Mock };
    workOrder: { findMany: jest.Mock };
    incident: { findMany: jest.Mock };
  };
  let phoneResolver: {
    normalize: jest.Mock;
    localDigits: jest.Mock;
    buildCallSessionFilter: jest.Mock;
  };

  const realLocalDigits = (phone: string): string => {
    const digits = (phone ?? "").replace(/[^\d]/g, "");
    return digits.length >= 9 ? digits.slice(-9) : digits;
  };

  beforeEach(async () => {
    prisma = {
      callSession: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      telephonyExtension: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      client: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      lead: { findFirst: jest.fn().mockResolvedValue(null) },
      workOrder: { findMany: jest.fn().mockResolvedValue([]) },
      incident: { findMany: jest.fn().mockResolvedValue([]) },
    };
    phoneResolver = {
      normalize: jest.fn(),
      localDigits: jest.fn().mockImplementation(realLocalDigits),
      buildCallSessionFilter: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyCallsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhoneResolverService, useValue: phoneResolver },
        { provide: IntelligenceService, useValue: { getProfile: jest.fn() } },
        {
          provide: RecordingAccessService,
          useValue: {
            isCachedLocally: jest.fn().mockReturnValue(false),
          },
        },
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

  describe("lookupPhone (short-digit guard)", () => {
    it("returns employee and skips client lookup when input is a 3-digit extension that exists", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: "ext-1",
        extension: "214",
        displayName: "Agent 214",
        user: { email: "agent214@test.com" },
      });

      const result = await service.lookupPhone("214");

      expect(result.employee).toEqual({
        id: "ext-1",
        extension: "214",
        displayName: "Agent 214",
        email: "agent214@test.com",
      });
      expect(result.client).toBeUndefined();
      expect(prisma.client.findFirst).not.toHaveBeenCalled();
    });

    it("returns unknown (no client) when a 3-digit input does not match any extension", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
      // Even if the DB would match a client with "214" in phone, we must NOT query.
      prisma.client.findFirst.mockResolvedValue({
        id: "bad-match",
        firstName: "Wrong",
        lastName: "Client",
        primaryPhone: "995555321214",
        secondaryPhone: null,
        coreId: null,
        idNumber: null,
        paymentId: null,
        clientBuildings: [],
      });

      const result = await service.lookupPhone("214");

      expect(result.employee).toBeUndefined();
      expect(result.client).toBeUndefined();
      expect(prisma.client.findFirst).not.toHaveBeenCalled();
    });

    it("finds client by last-9-digits substring when input has country code prefix", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
      prisma.client.findFirst.mockResolvedValue({
        id: "c-1",
        firstName: "John",
        lastName: "Doe",
        primaryPhone: "0555123456",
        secondaryPhone: null,
        coreId: null,
        idNumber: null,
        paymentId: null,
        clientBuildings: [],
      });

      const result = await service.lookupPhone("995555123456");

      expect(result.client).toBeDefined();
      expect(result.client?.id).toBe("c-1");
      // Verify the `contains` query used the normalized (9-digit) form
      const callArg = prisma.client.findFirst.mock.calls[0][0];
      const orClause = callArg.where.OR;
      expect(orClause[0].primaryPhone.contains).toBe("555123456");
      expect(orClause[1].secondaryPhone.contains).toBe("555123456");
    });
  });

  describe("getExtensionHistory (normalized substring match)", () => {
    it("resolves client stored in local format (0555...) for CDR number with 995 prefix", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        crmUserId: "user-1",
      });
      prisma.callSession.findMany.mockResolvedValue([
        {
          id: "s-1",
          direction: "IN",
          callerNumber: "995555123456",
          calleeNumber: "100",
          assignedExtension: "100",
          startAt: new Date("2026-04-20T10:00:00Z"),
          answerAt: null,
          endAt: null,
          disposition: "ANSWERED",
          callMetrics: { talkSeconds: 30 },
        },
      ]);

      // Client stored in local "0555..." form — exact-match against
      // CDR "995555123456" would MISS, but substring "555123456" MUST hit.
      prisma.client.findMany.mockImplementation((args: any) => {
        const firstClause = args?.where?.OR?.[0];
        const contains = firstClause?.primaryPhone?.contains;
        // Simulate Prisma OR-of-contains matching this client by its primary phone.
        if (typeof contains === "string" && "0555123456".includes(contains)) {
          return Promise.resolve([
            {
              firstName: "Jane",
              lastName: "Client",
              primaryPhone: "0555123456",
              secondaryPhone: null,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getExtensionHistory("100");

      expect(result).toHaveLength(1);
      expect(result[0].remoteName).toBe("Jane Client");
      expect(prisma.client.findMany).toHaveBeenCalled();
    });
  });
});
