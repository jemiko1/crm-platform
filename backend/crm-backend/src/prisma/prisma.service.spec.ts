import { PrismaService } from "./prisma.service";

/**
 * PrismaService extends PrismaClient and opens a real pg Pool in its constructor.
 * We only assert API shape here to avoid requiring DATABASE_URL and a live DB in unit tests.
 */
describe("PrismaService", () => {
  it("should define onModuleInit lifecycle hook", () => {
    expect(typeof PrismaService.prototype.onModuleInit).toBe("function");
  });

  it("should define onModuleDestroy lifecycle hook", () => {
    expect(typeof PrismaService.prototype.onModuleDestroy).toBe("function");
  });
});
