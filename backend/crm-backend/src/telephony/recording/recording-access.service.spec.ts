import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { RecordingAccessService } from "./recording-access.service";
import { PrismaService } from "../../prisma/prisma.service";
import { DataScopeService } from "../../common/utils/data-scope";
import { resolve } from "path";

describe("RecordingAccessService", () => {
  let service: RecordingAccessService;
  let prisma: {
    recording: { findUnique: jest.Mock };
    employee: { findUnique: jest.Mock };
  };
  let dataScope: { resolve: jest.Mock };

  beforeEach(async () => {
    prisma = {
      recording: { findUnique: jest.fn() },
      employee: { findUnique: jest.fn() },
    };
    dataScope = { resolve: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordingAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: DataScopeService, useValue: dataScope },
      ],
    }).compile();
    service = module.get(RecordingAccessService);
  });

  // Build a canonical recording fixture for scope tests. Keep callSession
  // fields consistent with the Prisma select in getRecordingById.
  const makeRecording = (overrides: {
    assignedUserId?: string | null;
    departmentId?: string | null;
    level?: number | null;
  } = {}) => ({
    id: "rec-1",
    url: null,
    filePath: "/var/spool/asterisk/monitor/rec.wav",
    callSession: {
      id: "sess-1",
      linkedId: "lnk-1",
      callerNumber: "555-0000",
      startAt: new Date(),
      disposition: "ANSWERED",
      assignedUserId: overrides.assignedUserId ?? "owner-user",
      assignedUser: {
        id: overrides.assignedUserId ?? "owner-user",
        employee: {
          departmentId: overrides.departmentId ?? "dept-A",
          position: { level: overrides.level ?? 2 },
        },
      },
    },
  });

  describe("getRecordingById", () => {
    it("should throw NotFoundException when recording missing", async () => {
      // Missing rows must short-circuit before the scope check so we don't
      // reveal to an attacker whether an id exists via timing or error type.
      prisma.recording.findUnique.mockResolvedValue(null);
      await expect(
        service.getRecordingById("bad", "user-X", false),
      ).rejects.toThrow(NotFoundException);
    });

    it("operator A (scope=own) fetching B's recording is Forbidden", async () => {
      prisma.recording.findUnique.mockResolvedValue(
        makeRecording({ assignedUserId: "operator-B" }),
      );
      dataScope.resolve.mockResolvedValue({
        scope: "own",
        userId: "operator-A",
        userLevel: 2,
        departmentId: "dept-A",
        departmentIds: [],
      });
      // userHasRecordingPermission must say yes so we're testing scope not auth.
      prisma.employee.findUnique.mockResolvedValue({
        position: {
          roleGroup: {
            permissions: [
              { permission: { resource: "call_recordings", action: "own" } },
            ],
          },
        },
      });

      await expect(
        service.getRecordingById("rec-1", "operator-A", false),
      ).rejects.toThrow(ForbiddenException);
    });

    it("operator A (scope=own) fetching their own recording is ok", async () => {
      prisma.recording.findUnique.mockResolvedValue(
        makeRecording({ assignedUserId: "operator-A" }),
      );
      dataScope.resolve.mockResolvedValue({
        scope: "own",
        userId: "operator-A",
        userLevel: 2,
        departmentId: "dept-A",
        departmentIds: [],
      });
      prisma.employee.findUnique.mockResolvedValue({
        position: {
          roleGroup: {
            permissions: [
              { permission: { resource: "call_recordings", action: "own" } },
            ],
          },
        },
      });

      const res = await service.getRecordingById("rec-1", "operator-A", false);
      expect(res.id).toBe("rec-1");
    });

    it("manager (scope=department_tree) can fetch recording within subtree", async () => {
      prisma.recording.findUnique.mockResolvedValue(
        makeRecording({
          assignedUserId: "operator-B",
          departmentId: "dept-child",
          level: 1,
        }),
      );
      dataScope.resolve.mockResolvedValue({
        scope: "department_tree",
        userId: "manager-M",
        userLevel: 5,
        departmentId: "dept-parent",
        departmentIds: ["dept-parent", "dept-child"],
      });

      const res = await service.getRecordingById("rec-1", "manager-M", false);
      expect(res.id).toBe("rec-1");
    });

    it("manager (scope=department_tree) outside subtree is Forbidden", async () => {
      // Department tree check must reject recordings whose operator belongs
      // to a department NOT in the manager's subtree — e.g. CEO's calls or
      // a sibling department. This is the P1 finding: recordings leaking
      // across org boundaries.
      prisma.recording.findUnique.mockResolvedValue(
        makeRecording({
          assignedUserId: "operator-X",
          departmentId: "dept-other",
          level: 1,
        }),
      );
      dataScope.resolve.mockResolvedValue({
        scope: "department_tree",
        userId: "manager-M",
        userLevel: 5,
        departmentId: "dept-parent",
        departmentIds: ["dept-parent", "dept-child"],
      });

      await expect(
        service.getRecordingById("rec-1", "manager-M", false),
      ).rejects.toThrow(ForbiddenException);
    });

    it("manager (scope=department_tree) can't listen to someone ABOVE them in the chain", async () => {
      // Level gate: the assigned operator's position.level must be <=
      // the manager's level. A director (level=10) calling someone is not
      // listenable by a team-lead (level=5) even if both are in the same
      // department tree.
      prisma.recording.findUnique.mockResolvedValue(
        makeRecording({
          assignedUserId: "director-D",
          departmentId: "dept-parent",
          level: 10,
        }),
      );
      dataScope.resolve.mockResolvedValue({
        scope: "department_tree",
        userId: "manager-M",
        userLevel: 5,
        departmentId: "dept-parent",
        departmentIds: ["dept-parent", "dept-child"],
      });

      await expect(
        service.getRecordingById("rec-1", "manager-M", false),
      ).rejects.toThrow(ForbiddenException);
    });

    it("superadmin gets any recording", async () => {
      prisma.recording.findUnique.mockResolvedValue(
        makeRecording({ assignedUserId: "anyone" }),
      );
      dataScope.resolve.mockResolvedValue({
        scope: "all",
        userId: "superadmin",
        userLevel: 999,
        departmentId: null,
        departmentIds: [],
      });

      const res = await service.getRecordingById("rec-1", "superadmin", true);
      expect(res.id).toBe("rec-1");
    });

    it("user with NO call_recordings.* permission is Forbidden", async () => {
      // Menu-visibility permission without a scoped recording grant must not
      // open the door. DataScope returns 'own' by default for users with no
      // matching permission; userHasRecordingPermission is the second check.
      prisma.recording.findUnique.mockResolvedValue(makeRecording());
      dataScope.resolve.mockResolvedValue({
        scope: "own",
        userId: "bare-user",
        userLevel: 1,
        departmentId: "dept-A",
        departmentIds: [],
      });
      prisma.employee.findUnique.mockResolvedValue({
        position: {
          roleGroup: {
            permissions: [
              { permission: { resource: "call_center", action: "menu" } },
            ],
          },
        },
      });

      await expect(
        service.getRecordingById("rec-1", "bare-user", false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("resolveFilePath", () => {
    // Build a service instance with a known basePath for deterministic assertions
    const basePath = process.platform === "win32" ? "C:\\recordings" : "/tmp/recordings";
    let svc: RecordingAccessService;
    beforeEach(() => {
      process.env.RECORDING_BASE_PATH = basePath;
      svc = new RecordingAccessService(prisma as any, dataScope as any);
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
