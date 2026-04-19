import { Test, TestingModule } from "@nestjs/testing";
import { HttpException, HttpStatus } from "@nestjs/common";
import { LoginThrottleService } from "./login-throttle.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * In-memory fake for the Prisma `loginAttempt` delegate. Keeps rows in an
 * array and implements the subset of the API the throttle service calls:
 * findMany({ where, orderBy, select }), create({ data }), deleteMany({
 * where }).
 */
type Row = {
  id: string;
  email: string;
  ip: string;
  success: boolean;
  userAgent: string | null;
  attemptedAt: Date;
};

class FakeLoginAttemptTable {
  rows: Row[] = [];
  private nextId = 1;

  reset() {
    this.rows = [];
    this.nextId = 1;
  }

  async create({ data }: { data: Omit<Row, "id" | "attemptedAt"> & { attemptedAt?: Date } }) {
    const row: Row = {
      id: `row-${this.nextId++}`,
      email: data.email,
      ip: data.ip,
      success: data.success,
      userAgent: data.userAgent ?? null,
      attemptedAt: data.attemptedAt ?? new Date(),
    };
    this.rows.push(row);
    return row;
  }

  async findMany({
    where,
    orderBy,
  }: {
    where: {
      email?: string;
      ip?: string;
      success?: boolean;
      attemptedAt?: { gte?: Date; lt?: Date };
    };
    orderBy?: { attemptedAt: "asc" | "desc" };
    select?: unknown;
  }) {
    let out = this.rows.filter((r) => {
      if (where.email !== undefined && r.email !== where.email) return false;
      if (where.ip !== undefined && r.ip !== where.ip) return false;
      if (where.success !== undefined && r.success !== where.success) return false;
      if (where.attemptedAt?.gte && r.attemptedAt < where.attemptedAt.gte) return false;
      if (where.attemptedAt?.lt && r.attemptedAt >= where.attemptedAt.lt) return false;
      return true;
    });
    if (orderBy?.attemptedAt === "asc") {
      out = [...out].sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime());
    } else if (orderBy?.attemptedAt === "desc") {
      out = [...out].sort((a, b) => b.attemptedAt.getTime() - a.attemptedAt.getTime());
    }
    return out;
  }

  async deleteMany({ where }: { where: { attemptedAt?: { lt?: Date } } }) {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (r) => !(where.attemptedAt?.lt && r.attemptedAt < where.attemptedAt.lt),
    );
    return { count: before - this.rows.length };
  }
}

describe("LoginThrottleService", () => {
  let fakeTable: FakeLoginAttemptTable;
  let prismaMock: Pick<PrismaService, "loginAttempt">;

  const buildService = async (): Promise<LoginThrottleService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginThrottleService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    return module.get(LoginThrottleService);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    fakeTable = new FakeLoginAttemptTable();
    prismaMock = { loginAttempt: fakeTable as unknown as PrismaService["loginAttempt"] };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("per-email throttle", () => {
    it("trips on the 6th failure after 5 within 5 minutes", async () => {
      const service = await buildService();
      const email = "user@example.com";
      const ip = "10.0.0.1";

      for (let i = 0; i < 5; i++) {
        await service.recordFailure(email, ip);
        // Small time advance so ordering is stable.
        jest.setSystemTime(new Date(Date.now() + 1_000));
      }

      // 6th attempt: must be blocked before the password check.
      await expect(service.assertNotLocked(email, ip)).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });

      try {
        await service.assertNotLocked(email, ip);
        fail("expected assertNotLocked to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const e = err as HttpException;
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const body = e.getResponse() as {
          reason: string;
          retryAfterSeconds: number;
        };
        expect(body.reason).toBe("email");
        expect(body.retryAfterSeconds).toBeGreaterThan(0);
      }
    });

    it("does not lock when failures are spread across two different emails", async () => {
      const service = await buildService();
      const ip = "10.0.0.1";

      // 3 failures on A, 3 on B — neither should trip the email rule.
      for (let i = 0; i < 3; i++) await service.recordFailure("a@example.com", ip);
      for (let i = 0; i < 3; i++) await service.recordFailure("b@example.com", ip);

      await expect(service.assertNotLocked("a@example.com", ip)).resolves.toBeUndefined();
      await expect(service.assertNotLocked("b@example.com", ip)).resolves.toBeUndefined();
    });

    it("unlocks once the email window has elapsed", async () => {
      const service = await buildService();
      const email = "expire@example.com";
      const ip = "10.0.0.1";

      for (let i = 0; i < 5; i++) await service.recordFailure(email, ip);

      // Still locked immediately after.
      await expect(service.assertNotLocked(email, ip)).rejects.toBeInstanceOf(HttpException);

      // Advance past the 5-minute window.
      jest.setSystemTime(new Date(Date.now() + 6 * 60_000));

      await expect(service.assertNotLocked(email, ip)).resolves.toBeUndefined();
    });
  });

  describe("per-IP throttle (spray detection)", () => {
    it("trips on the 11th failure from one IP across 10 different emails within 60s", async () => {
      const service = await buildService();
      const ip = "198.51.100.42";

      for (let i = 0; i < 10; i++) {
        await service.recordFailure(`victim${i}@example.com`, ip);
        jest.setSystemTime(new Date(Date.now() + 1_000));
      }

      try {
        await service.assertNotLocked("victim11@example.com", ip);
        fail("expected assertNotLocked to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const e = err as HttpException;
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const body = e.getResponse() as { reason: string };
        expect(body.reason).toBe("ip");
      }
    });

    it("different IPs are tracked independently", async () => {
      const service = await buildService();
      const ipA = "203.0.113.10";
      const ipB = "203.0.113.20";

      // 6 failures from IP A against email A — trips the email rule for A
      // from IP A, but email B from IP B is unaffected.
      for (let i = 0; i < 6; i++) await service.recordFailure("a@example.com", ipA);
      for (let i = 0; i < 6; i++) await service.recordFailure("b@example.com", ipB);

      await expect(service.assertNotLocked("a@example.com", ipA)).rejects.toBeInstanceOf(
        HttpException,
      );
      await expect(service.assertNotLocked("b@example.com", ipB)).rejects.toBeInstanceOf(
        HttpException,
      );
      // Cross-check: email A from a completely fresh IP is not locked by
      // the per-IP rule — only by the per-email rule.
      await expect(
        service.assertNotLocked("a@example.com", "203.0.113.99"),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      // But email C from a fresh IP is fully unlocked.
      await expect(
        service.assertNotLocked("c@example.com", "203.0.113.99"),
      ).resolves.toBeUndefined();
    });
  });

  describe("persistence across restart", () => {
    it("new service instance still sees lockout because attempts live in the DB", async () => {
      const first = await buildService();
      const email = "persist@example.com";
      const ip = "10.0.0.5";

      for (let i = 0; i < 5; i++) await first.recordFailure(email, ip);

      // Simulate a backend restart by constructing a brand-new service
      // sharing the same Prisma mock (i.e. the same underlying table).
      const second = await buildService();

      await expect(second.assertNotLocked(email, ip)).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe("recordSuccess", () => {
    it("inserts a success row and does not clear prior failures", async () => {
      const service = await buildService();
      const email = "both@example.com";
      const ip = "10.0.0.9";

      for (let i = 0; i < 5; i++) await service.recordFailure(email, ip);
      await service.recordSuccess(email, ip);

      // Still locked: the 5 failures still live in the DB within the window.
      await expect(service.assertNotLocked(email, ip)).rejects.toBeInstanceOf(HttpException);

      // The success is logged.
      const successRows = fakeTable.rows.filter((r) => r.success);
      expect(successRows).toHaveLength(1);
      expect(successRows[0].email).toBe("both@example.com");
    });
  });

  describe("pruneOldAttempts", () => {
    it("deletes only rows older than 30 days", async () => {
      const service = await buildService();

      // Recent row.
      await service.recordFailure("recent@example.com", "10.0.0.1");
      // Old row: inject directly with an ancient timestamp.
      await fakeTable.create({
        data: {
          email: "old@example.com",
          ip: "10.0.0.1",
          success: false,
          userAgent: null,
          attemptedAt: new Date(Date.now() - 31 * 24 * 60 * 60_000),
        },
      });

      expect(fakeTable.rows).toHaveLength(2);
      await service.pruneOldAttempts();
      expect(fakeTable.rows).toHaveLength(1);
      expect(fakeTable.rows[0].email).toBe("recent@example.com");
    });
  });
});
