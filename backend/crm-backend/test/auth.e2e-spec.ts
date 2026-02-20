import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp, resetDatabase, createTestUser } from "./helpers/test-utils";

describe("Auth (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe("POST /auth/login", () => {
    it("returns user and sets httpOnly cookie on valid credentials", async () => {
      await createTestUser(prisma, {
        email: "admin@crm.local",
        password: "Admin123!",
      });

      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "admin@crm.local", password: "Admin123!" })
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe("admin@crm.local");

      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies;
      expect(cookieStr).toContain("access_token");
      expect(cookieStr).toContain("HttpOnly");
    });

    it("returns 401 for non-existent user", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "nobody@crm.local", password: "any" })
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it("returns 401 for wrong password", async () => {
      await createTestUser(prisma, {
        email: "admin@crm.local",
        password: "Admin123!",
      });

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "admin@crm.local", password: "WrongPassword" })
        .expect(401);
    });

    it("returns 401 for inactive (dismissed) user", async () => {
      await createTestUser(prisma, {
        email: "dismissed@crm.local",
        password: "Admin123!",
        isActive: false,
      });

      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "dismissed@crm.local", password: "Admin123!" })
        .expect(401);

      expect(res.body.message).toContain("dismissed");
    });

    it("returns 400 for missing fields (validation pipe)", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({})
        .expect(400);
    });
  });

  describe("GET /auth/me", () => {
    it("returns 401 without authentication", async () => {
      await request(app.getHttpServer()).get("/auth/me").expect(401);
    });

    it("returns user info with valid cookie", async () => {
      await createTestUser(prisma, {
        email: "admin@crm.local",
        password: "Admin123!",
      });

      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "admin@crm.local", password: "Admin123!" });

      const cookies = loginRes.headers["set-cookie"];

      const res = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", cookies)
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe("admin@crm.local");
    });
  });

  describe("POST /auth/logout", () => {
    it("clears auth cookie", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/logout")
        .expect(201);

      expect(res.body).toEqual({ ok: true });

      const cookies = res.headers["set-cookie"];
      const cookieStr = Array.isArray(cookies) ? cookies.join("; ") : cookies;
      expect(cookieStr).toContain("access_token=;");
    });
  });
});
