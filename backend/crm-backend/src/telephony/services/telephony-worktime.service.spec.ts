import { Test, TestingModule } from "@nestjs/testing";
import { TelephonyWorktimeService } from "./telephony-worktime.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("TelephonyWorktimeService", () => {
  let service: TelephonyWorktimeService;
  let prisma: { telephonyQueue: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { telephonyQueue: { findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelephonyWorktimeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TelephonyWorktimeService);
  });

  describe("isWithinWorktime", () => {
    it("should return true when queue has no worktime config", async () => {
      prisma.telephonyQueue.findUnique.mockResolvedValue({ id: "q1", worktimeConfig: null });
      await expect(service.isWithinWorktime("q1", new Date())).resolves.toBe(true);
    });
  });
});
