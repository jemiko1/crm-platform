import request from "supertest";
import {
  createTestApp,
  closeTestApp,
  resetDatabase,
  getAuthCookies,
  TestContext,
} from "./helpers/test-utils";

describe("Buildings (e2e)", () => {
  let ctx: TestContext;
  let cookies: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    cookies = await getAuthCookies(ctx, {
      email: "admin@crm.local",
      password: "Admin123!",
    });
  });

  async function seedBuilding(
    coreId: number,
    name: string,
    opts: { city?: string; createdAt?: Date } = {},
  ) {
    return ctx.prisma.building.create({
      data: {
        coreId,
        name,
        city: opts.city ?? null,
        createdAt: opts.createdAt ?? new Date(),
      },
    });
  }

  describe("GET /buildings", () => {
    it("returns 401 without authentication", async () => {
      await request(ctx.app.getHttpServer())
        .get("/buildings")
        .expect(401);
    });

    it("returns an empty array when no buildings exist", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/buildings")
        .set("Cookie", cookies)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it("returns buildings with counts", async () => {
      await seedBuilding(1, "HQ Tower", { city: "Tbilisi" });
      await seedBuilding(2, "Branch Office");

      const res = await request(ctx.app.getHttpServer())
        .get("/buildings")
        .set("Cookie", cookies)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty("coreId", 1);
      expect(res.body[0]).toHaveProperty("name", "HQ Tower");
      expect(res.body[0]).toHaveProperty("clientCount");
      expect(res.body[0]).toHaveProperty("workOrderCount");
      expect(res.body[0]).toHaveProperty("products");
    });
  });

  describe("GET /buildings/:coreId", () => {
    it("returns building by coreId", async () => {
      await seedBuilding(10, "Test Building", { city: "Batumi" });

      const res = await request(ctx.app.getHttpServer())
        .get("/buildings/10")
        .set("Cookie", cookies)
        .expect(200);

      expect(res.body.coreId).toBe(10);
      expect(res.body.name).toBe("Test Building");
    });

    it("returns 404 for non-existent coreId", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/buildings/99999")
        .set("Cookie", cookies)
        .expect(404);

      expect(res.body.statusCode).toBe(404);
    });

    it("returns 400 for non-numeric coreId", async () => {
      await request(ctx.app.getHttpServer())
        .get("/buildings/abc")
        .set("Cookie", cookies)
        .expect(400);
    });
  });

  describe("GET /buildings/statistics/summary", () => {
    it("returns zero-value stats with no buildings", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/buildings/statistics/summary")
        .set("Cookie", cookies)
        .expect(200);

      expect(res.body.totalBuildingsCount).toBe(0);
      expect(res.body.currentMonthCount).toBeDefined();
      expect(res.body.monthlyBreakdown).toBeDefined();
    });

    it("returns correct totals with seeded buildings", async () => {
      await seedBuilding(1, "A");
      await seedBuilding(2, "B");
      await seedBuilding(3, "C");

      const res = await request(ctx.app.getHttpServer())
        .get("/buildings/statistics/summary")
        .set("Cookie", cookies)
        .expect(200);

      expect(res.body.totalBuildingsCount).toBe(3);
      expect(typeof res.body.currentMonthPercentageChange).toBe("number");
      expect(typeof res.body.averagePercentageChange).toBe("number");
    });
  });
});
