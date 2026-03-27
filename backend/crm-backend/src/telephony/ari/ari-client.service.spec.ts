import { AriClientService } from "./ari-client.service";

describe("AriClientService", () => {
  const prev = process.env.ARI_ENABLED;

  afterEach(() => {
    process.env.ARI_ENABLED = prev;
  });

  it("should report disabled when ARI_ENABLED is not true", () => {
    process.env.ARI_ENABLED = "false";
    const svc = new AriClientService();
    expect(svc.enabled).toBe(false);
  });

  it("should log skip onModuleInit when disabled", () => {
    process.env.ARI_ENABLED = "false";
    const svc = new AriClientService();
    expect(() => svc.onModuleInit()).not.toThrow();
  });
});
