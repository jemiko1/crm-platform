import { Test, TestingModule } from "@nestjs/testing";
import { TelephonyIngestionService } from "./telephony-ingestion.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TelephonyCallbackService } from "./telephony-callback.service";
import { MissedCallsService } from "./missed-calls.service";

describe("TelephonyIngestionService", () => {
  let service: TelephonyIngestionService;
  let prisma: { callSession: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { callSession: { findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyIngestionService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelephonyCallbackService, useValue: { handleNonAnsweredCall: jest.fn() } },
        { provide: MissedCallsService, useValue: { autoResolveByPhone: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();
    service = module.get(TelephonyIngestionService);
  });

  describe("ingestBatch", () => {
    it("should return zeros for empty batch", async () => {
      const res = await service.ingestBatch([]);
      expect(res.processed).toBe(0);
      expect(res.skipped).toBe(0);
      expect(res.errors).toEqual([]);
    });
  });
});
