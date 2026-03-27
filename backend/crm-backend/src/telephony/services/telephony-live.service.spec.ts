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
});
