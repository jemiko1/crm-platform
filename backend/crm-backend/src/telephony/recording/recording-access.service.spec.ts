import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { RecordingAccessService } from "./recording-access.service";
import { PrismaService } from "../../prisma/prisma.service";
import { resolve } from "path";

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

  describe("resolveFilePath", () => {
    // Build a service instance with a known basePath for deterministic assertions
    const basePath = process.platform === "win32" ? "C:\\recordings" : "/tmp/recordings";
    let svc: RecordingAccessService;
    beforeEach(() => {
      process.env.RECORDING_BASE_PATH = basePath;
      svc = new RecordingAccessService(prisma as any);
    });

    it("returns null for empty filePath", () => {
      expect(svc.resolveFilePath(null)).toBeNull();
      expect(svc.resolveFilePath("")).toBeNull();
    });

    it("strips Asterisk Linux prefix and remaps onto basePath", () => {
      const result = svc.resolveFilePath("/var/spool/asterisk/monitor/2026/04/17/recording.wav");
      expect(result).toBe(resolve(basePath, "2026/04/17/recording.wav"));
    });

    it("handles relative paths relative to basePath", () => {
      const result = svc.resolveFilePath("2026/04/17/recording.wav");
      expect(result).toBe(resolve(basePath, "2026/04/17/recording.wav"));
    });

    it("blocks path traversal attempts", () => {
      // ../../../etc/passwd from an Asterisk-prefixed path → would still resolve
      // under basePath because we slice after the prefix. But a raw relative
      // path with ../ traversal that escapes basePath must be blocked.
      const result = svc.resolveFilePath("../../../etc/passwd");
      expect(result).toBeNull();
    });
  });
});
