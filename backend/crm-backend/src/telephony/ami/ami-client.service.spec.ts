import { AmiClientService } from "./ami-client.service";

describe("AmiClientService", () => {
  const prevEnabled = process.env.AMI_ENABLED;

  afterEach(() => {
    process.env.AMI_ENABLED = prevEnabled;
  });

  it("should expose connected false before connect", () => {
    process.env.AMI_ENABLED = "false";
    const svc = new AmiClientService();
    expect(svc.connected).toBe(false);
  });

  it("should not throw onModuleInit when AMI disabled", () => {
    process.env.AMI_ENABLED = "false";
    const svc = new AmiClientService();
    expect(() => svc.onModuleInit()).not.toThrow();
  });
});
