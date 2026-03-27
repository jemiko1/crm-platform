import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { TelephonyCallbackService } from "./telephony-callback.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("TelephonyCallbackService", () => {
  let service: TelephonyCallbackService;
  let prisma: {
    callbackRequest: { findUnique: jest.Mock; update: jest.Mock };
    missedCall: { update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      callbackRequest: { findUnique: jest.fn(), update: jest.fn() },
      missedCall: { update: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelephonyCallbackService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TelephonyCallbackService);
  });

  describe("handleCallback", () => {
    it("should throw NotFoundException when callback id missing", async () => {
      prisma.callbackRequest.findUnique.mockResolvedValue(null);
      await expect(service.handleCallback("x", "completed")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
