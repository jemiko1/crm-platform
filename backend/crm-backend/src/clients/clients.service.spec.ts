import { Test, TestingModule } from "@nestjs/testing";
import { ClientsService } from "./clients.service";
import { PrismaService } from "../prisma/prisma.service";
import { IdGeneratorService } from "../common/id-generator/id-generator.service";

describe("ClientsService", () => {
  let service: ClientsService;
  let prisma: {
    client: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let ids: { next: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    ids = { next: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: prisma },
        { provide: IdGeneratorService, useValue: ids },
      ],
    }).compile();
    service = module.get(ClientsService);
  });

  describe("createManual", () => {
    it("should create client with building links when given valid input", async () => {
      ids.next.mockResolvedValue(42);
      const row = { coreId: 42, firstName: "A", lastName: "B" };
      prisma.client.create.mockResolvedValue(row);
      const res = await service.createManual(["b1"], { firstName: "A", lastName: "B" });
      expect(res).toEqual(row);
      expect(prisma.client.create).toHaveBeenCalled();
    });
  });

  describe("findByCoreId", () => {
    it("should return null when client is not found", async () => {
      prisma.client.findFirst.mockResolvedValue(null);
      await expect(service.findByCoreId(999)).resolves.toBeNull();
    });
  });
});
