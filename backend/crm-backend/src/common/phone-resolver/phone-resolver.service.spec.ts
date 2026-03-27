import { Test, TestingModule } from "@nestjs/testing";
import { PhoneResolverService } from "./phone-resolver.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("PhoneResolverService", () => {
  let service: PhoneResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhoneResolverService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    service = module.get(PhoneResolverService);
  });

  describe("normalize", () => {
    it("should normalize 9-digit local Georgian number", () => {
      expect(service.normalize("555123456")).toBe("995555123456");
    });

    it("should normalize leading 0 local format", () => {
      expect(service.normalize("0555123456")).toBe("995555123456");
    });
  });

  describe("localDigits", () => {
    it("should return last 9 digits for long input", () => {
      expect(service.localDigits("995555123456")).toBe("555123456");
    });
  });
});
