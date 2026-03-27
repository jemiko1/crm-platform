import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { RecordingAccessService } from "./recording-access.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("RecordingAccessService", () => {
  let service: RecordingAccessService;
  let prisma: { recording: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { recording: { findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecordingAccessService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RecordingAccessService);
  });

  describe("getRecordingById", () => {
    it("should throw NotFoundException when recording missing", async () => {
      prisma.recording.findUnique.mockResolvedValue(null);
      await expect(service.getRecordingById("bad")).rejects.toThrow(NotFoundException);
    });
  });
});
