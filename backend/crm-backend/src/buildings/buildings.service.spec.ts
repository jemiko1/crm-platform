import { Test, TestingModule } from "@nestjs/testing";
import { BuildingsService } from "./buildings.service";
import { PrismaService } from "../prisma/prisma.service";
import { IdGeneratorService } from "../common/id-generator/id-generator.service";

describe("BuildingsService – getStatistics", () => {
  let service: BuildingsService;
  let prisma: { building: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { building: { findMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuildingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: IdGeneratorService, useValue: {} },
      ],
    }).compile();

    service = module.get(BuildingsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns zeros when there are no buildings", async () => {
    prisma.building.findMany.mockResolvedValue([]);

    const result = await service.getStatistics();

    expect(result).toEqual({
      totalBuildingsCount: 0,
      currentMonthCount: 0,
      currentMonthPercentageChange: 0,
      averagePercentageChange: 0,
      monthlyBreakdown: {},
    });
  });

  it("calculates correctly with buildings only in the current month", async () => {
    jest.useFakeTimers({ now: new Date(2026, 1, 15) }); // Feb 2026

    prisma.building.findMany.mockResolvedValue([
      { createdAt: new Date(2026, 1, 1) },
      { createdAt: new Date(2026, 1, 10) },
      { createdAt: new Date(2026, 1, 14) },
    ]);

    const result = await service.getStatistics();

    expect(result.totalBuildingsCount).toBe(3);
    expect(result.currentMonthCount).toBe(3);
    // No buildings last month → 100% increase
    expect(result.currentMonthPercentageChange).toBe(100);
    expect(result.monthlyBreakdown[2026][2]).toBe(3);
  });

  it("calculates month-over-month percentage change", async () => {
    jest.useFakeTimers({ now: new Date(2026, 1, 15) }); // Feb 2026

    prisma.building.findMany.mockResolvedValue([
      // January: 2 buildings
      { createdAt: new Date(2026, 0, 5) },
      { createdAt: new Date(2026, 0, 20) },
      // February: 4 buildings
      { createdAt: new Date(2026, 1, 1) },
      { createdAt: new Date(2026, 1, 5) },
      { createdAt: new Date(2026, 1, 10) },
      { createdAt: new Date(2026, 1, 14) },
    ]);

    const result = await service.getStatistics();

    expect(result.totalBuildingsCount).toBe(6);
    expect(result.currentMonthCount).toBe(4);
    // (4 - 2) / 2 * 100 = 100%
    expect(result.currentMonthPercentageChange).toBe(100);
  });

  it("handles year boundary (January current, December last)", async () => {
    jest.useFakeTimers({ now: new Date(2026, 0, 15) }); // Jan 2026

    prisma.building.findMany.mockResolvedValue([
      // December 2025: 5 buildings
      { createdAt: new Date(2025, 11, 1) },
      { createdAt: new Date(2025, 11, 5) },
      { createdAt: new Date(2025, 11, 10) },
      { createdAt: new Date(2025, 11, 15) },
      { createdAt: new Date(2025, 11, 20) },
      // January 2026: 3 buildings
      { createdAt: new Date(2026, 0, 1) },
      { createdAt: new Date(2026, 0, 5) },
      { createdAt: new Date(2026, 0, 10) },
    ]);

    const result = await service.getStatistics();

    expect(result.currentMonthCount).toBe(3);
    // (3 - 5) / 5 * 100 = -40%
    expect(result.currentMonthPercentageChange).toBe(-40);
    expect(result.monthlyBreakdown[2025][12]).toBe(5);
    expect(result.monthlyBreakdown[2026][1]).toBe(3);
  });

  it("calculates average percentage change across all months", async () => {
    jest.useFakeTimers({ now: new Date(2026, 2, 15) }); // Mar 2026

    prisma.building.findMany.mockResolvedValue([
      // Jan: 2, Feb: 4, Mar: 6 → avg = 4
      { createdAt: new Date(2026, 0, 1) },
      { createdAt: new Date(2026, 0, 10) },
      { createdAt: new Date(2026, 1, 1) },
      { createdAt: new Date(2026, 1, 5) },
      { createdAt: new Date(2026, 1, 10) },
      { createdAt: new Date(2026, 1, 15) },
      { createdAt: new Date(2026, 2, 1) },
      { createdAt: new Date(2026, 2, 5) },
      { createdAt: new Date(2026, 2, 10) },
      { createdAt: new Date(2026, 2, 12) },
      { createdAt: new Date(2026, 2, 13) },
      { createdAt: new Date(2026, 2, 14) },
    ]);

    const result = await service.getStatistics();

    expect(result.currentMonthCount).toBe(6);
    // avg = (2+4+6)/3 = 4; change = (6-4)/4*100 = 50%
    expect(result.averagePercentageChange).toBe(50);
  });
});
