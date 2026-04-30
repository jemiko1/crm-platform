import { Test } from "@nestjs/testing";
import { DataScopeService } from "./data-scope";
import { PrismaService } from "../../prisma/prisma.service";

const mockDept = (id: string, parentId: string | null = null) => ({
  id,
  parentId,
  isActive: true,
});

function buildPrisma(overrides: {
  employee?: any;
  departments?: any[];
} = {}) {
  const departments = overrides.departments ?? [];
  return {
    employee: {
      findUnique: jest.fn().mockResolvedValue(overrides.employee ?? null),
    },
    department: {
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        const parentId = where?.parentId;
        return Promise.resolve(
          departments.filter(
            (d) => d.parentId === parentId && d.isActive,
          ),
        );
      }),
    },
  };
}

describe("DataScopeService", () => {
  let svc: DataScopeService;
  let prisma: ReturnType<typeof buildPrisma>;

  async function build(employeeOverride?: any, departments?: any[]) {
    prisma = buildPrisma({ employee: employeeOverride, departments });
    const module = await Test.createTestingModule({
      providers: [
        DataScopeService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = module.get(DataScopeService);
  }

  describe("superAdmin bypass", () => {
    it("returns all scope with level 999 for superAdmin regardless of DB state", async () => {
      await build();
      const result = await svc.resolve("any-user", "call_logs", true);
      expect(result.scope).toBe("all");
      expect(result.userLevel).toBe(999);
      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("no employee / no position fallback", () => {
    it("returns own scope with userLevel 0 when employee not found", async () => {
      await build(null);
      const result = await svc.resolve("ghost-user", "call_logs");
      expect(result.scope).toBe("own");
      expect(result.userLevel).toBe(0);
    });
  });

  describe("null position level — the silent-empty-tree bug", () => {
    /**
     * Regression guard for the bug reported in April 2026:
     * A manager with a null position.level caused userLevel to default to 0.
     * The Prisma filter `position: { level: { lte: 0 } }` then matched zero
     * employees, returning an empty call-log list even though department_tree
     * scope was correctly resolved.
     *
     * The fix: `level ?? 999` so a null level means "unrestricted within tree".
     * 999 is above every real position level (max in seed: 100).
     */
    it("defaults userLevel to 999 when position.level is null", async () => {
      await build({
        departmentId: "dept-1",
        position: {
          level: null, // ← the bug trigger
          roleGroup: {
            permissions: [
              { permission: { resource: "call_logs", action: "department_tree" } },
              { permission: { resource: "call_logs", action: "own" } },
            ],
          },
        },
      }, []);

      const result = await svc.resolve("mgr-user", "call_logs");
      expect(result.scope).toBe("department_tree");
      expect(result.userLevel).toBe(999); // NOT 0
    });

    it("preserves the actual level when position.level is set", async () => {
      await build({
        departmentId: "dept-1",
        position: {
          level: 60,
          roleGroup: {
            permissions: [
              { permission: { resource: "call_logs", action: "department_tree" } },
            ],
          },
        },
      }, []);

      const result = await svc.resolve("mgr-user", "call_logs");
      expect(result.userLevel).toBe(60);
    });
  });

  describe("scope priority", () => {
    it("resolves all over department_tree when user has both", async () => {
      await build({
        departmentId: "dept-1",
        position: {
          level: 80,
          roleGroup: {
            permissions: [
              { permission: { resource: "call_logs", action: "all" } },
              { permission: { resource: "call_logs", action: "department_tree" } },
              { permission: { resource: "call_logs", action: "own" } },
            ],
          },
        },
      });

      const result = await svc.resolve("mgr-user", "call_logs");
      expect(result.scope).toBe("all");
    });

    it("resolves department_tree when user has that but not all", async () => {
      await build({
        departmentId: "dept-root",
        position: {
          level: 80,
          roleGroup: {
            permissions: [
              { permission: { resource: "call_logs", action: "department_tree" } },
              { permission: { resource: "call_logs", action: "own" } },
            ],
          },
        },
      }, [
        mockDept("dept-root"),
        mockDept("dept-child", "dept-root"),
      ]);

      const result = await svc.resolve("mgr-user", "call_logs");
      expect(result.scope).toBe("department_tree");
      expect(result.departmentIds).toContain("dept-root");
      expect(result.departmentIds).toContain("dept-child");
    });

    it("falls back to own when user only has call_logs.own", async () => {
      await build({
        departmentId: "dept-1",
        position: {
          level: 40,
          roleGroup: {
            permissions: [
              { permission: { resource: "call_logs", action: "own" } },
            ],
          },
        },
      });

      const result = await svc.resolve("op-user", "call_logs");
      expect(result.scope).toBe("own");
    });
  });

  describe("collectDescendantDepartments", () => {
    it("collects root + all nested children recursively", async () => {
      await build({
        departmentId: "root",
        position: {
          level: 80,
          roleGroup: {
            permissions: [
              { permission: { resource: "call_logs", action: "department_tree" } },
            ],
          },
        },
      }, [
        mockDept("root"),
        mockDept("child-A", "root"),
        mockDept("child-B", "root"),
        mockDept("grandchild", "child-A"),
      ]);

      const result = await svc.resolve("mgr", "call_logs");
      expect(result.departmentIds.sort()).toEqual(
        ["child-A", "child-B", "grandchild", "root"].sort(),
      );
    });

    it("returns only root when no children exist", async () => {
      await build({
        departmentId: "lone-dept",
        position: {
          level: 80,
          roleGroup: {
            permissions: [
              { permission: { resource: "call_logs", action: "department_tree" } },
            ],
          },
        },
      }, []);

      const result = await svc.resolve("mgr", "call_logs");
      expect(result.departmentIds).toEqual(["lone-dept"]);
    });
  });
});
