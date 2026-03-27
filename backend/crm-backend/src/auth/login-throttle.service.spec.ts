import { Test, TestingModule } from "@nestjs/testing";
import { LoginThrottleService } from "./login-throttle.service";

describe("LoginThrottleService", () => {
  let service: LoginThrottleService;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoginThrottleService],
    }).compile();
    service = module.get(LoginThrottleService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("recordFailure", () => {
    it("should return remaining attempts when given valid email", () => {
      expect(service.recordFailure("User@Example.com")).toBe(4);
      expect(service.recordFailure("user@example.com")).toBe(3);
    });

    it("should lock account and return zero remaining after max failures", () => {
      for (let i = 0; i < 4; i++) {
        service.recordFailure("lock@test.com");
      }
      expect(service.recordFailure("lock@test.com")).toBe(0);
      const locked = service.getLockedSeconds("lock@test.com");
      expect(locked).not.toBeNull();
      expect(locked!).toBeGreaterThan(0);
    });
  });

  describe("getLockedSeconds", () => {
    it("should return null when email is not locked", () => {
      expect(service.getLockedSeconds("fresh@test.com")).toBeNull();
    });
  });

  describe("recordSuccess", () => {
    it("should clear lock state for the email", () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailure("clear@test.com");
      }
      expect(service.getLockedSeconds("clear@test.com")).not.toBeNull();
      service.recordSuccess("Clear@Test.com");
      expect(service.getLockedSeconds("clear@test.com")).toBeNull();
    });
  });
});
