import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { CoreSyncService } from "./core-sync.service";
import { PrismaService } from "../prisma/prisma.service";

describe("CoreSyncService", () => {
  let service: CoreSyncService;
  let prisma: {
    building: { upsert: jest.Mock; update: jest.Mock };
    client: { upsert: jest.Mock; update: jest.Mock };
    asset: { upsert: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      building: { upsert: jest.fn(), update: jest.fn() },
      client: { upsert: jest.fn(), update: jest.fn() },
      asset: { upsert: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [CoreSyncService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CoreSyncService);
  });

  describe("process", () => {
    it("should upsert building when event is building.upsert with valid payload", async () => {
      const row = { id: "b1", coreId: 5 };
      prisma.building.upsert.mockResolvedValue(row);
      const result = await service.process("building.upsert" as any, {
        coreId: 5,
        name: "Tower",
      });
      expect(result).toEqual(row);
      expect(prisma.building.upsert).toHaveBeenCalled();
    });

    it("should throw BadRequestException when building.upsert payload missing coreId", async () => {
      await expect(
        service.process("building.upsert" as any, { name: "Tower" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when building.upsert name is empty", async () => {
      await expect(
        service.process("building.upsert" as any, { coreId: 1, name: "   " }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
