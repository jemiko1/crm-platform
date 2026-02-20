import { Test, TestingModule } from "@nestjs/testing";
import { IdGeneratorService } from "./id-generator.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("IdGeneratorService", () => {
  let service: IdGeneratorService;
  let mockUpsert: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockTransaction: jest.Mock;

  beforeEach(async () => {
    mockUpsert = jest.fn();
    mockUpdate = jest.fn();

    mockTransaction = jest.fn(async (cb) =>
      cb({ externalIdCounter: { upsert: mockUpsert, update: mockUpdate } }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdGeneratorService,
        { provide: PrismaService, useValue: { $transaction: mockTransaction } },
      ],
    }).compile();

    service = module.get(IdGeneratorService);
  });

  it("returns 1 for a new entity counter", async () => {
    mockUpsert.mockResolvedValue({ entity: "building", nextId: 1 });
    mockUpdate.mockResolvedValue({});

    const id = await service.next("building");

    expect(id).toBe(1);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { entity: "building" },
      create: { entity: "building", nextId: 1 },
      update: {},
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { entity: "building" },
      data: { nextId: { increment: 1 } },
    });
  });

  it("returns the existing counter value and increments", async () => {
    mockUpsert.mockResolvedValue({ entity: "client", nextId: 42 });
    mockUpdate.mockResolvedValue({});

    const id = await service.next("client");

    expect(id).toBe(42);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { entity: "client" },
      data: { nextId: { increment: 1 } },
    });
  });

  it("executes inside a Prisma transaction", async () => {
    mockUpsert.mockResolvedValue({ entity: "asset", nextId: 7 });
    mockUpdate.mockResolvedValue({});

    await service.next("asset");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function));
  });
});
