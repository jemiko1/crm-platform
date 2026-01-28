import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { BuildingsModule } from "../buildings/buildings.module";
import { ClientsModule } from "../clients/clients.module";
import { AssetsModule } from "../assets/assets.module";
import { AdminManualController } from "./admin-manual.controller";
import { PublicController } from "./public.controller";
import { IdGeneratorModule } from "../common/id-generator/id-generator.module";
import { IncidentsModule } from "../incidents/incidents.module";
import { IncidentsController } from "./incidents.controller";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { WorkOrdersController } from "./work-orders.controller";

// Position-based RBAC
import { PositionsModule } from "../positions/positions.module";
import { PositionsController } from "../positions/positions.controller";
import { RoleGroupsModule } from "../role-groups/role-groups.module";
import { RoleGroupsController } from "../role-groups/role-groups.controller";

// Employees & Departments
import { EmployeesModule } from "../employees/employees.module";
import { EmployeesController } from "../employees/employees.controller";
import { DepartmentsModule } from "../departments/departments.module";
import { DepartmentsController } from "../departments/departments.controller";
import { PermissionsModule } from "../permissions/permissions.module";
import { PermissionsController } from "../permissions/permissions.controller";

// Workflow Configuration
import { WorkflowModule } from "../workflow/workflow.module";
import { WorkflowController } from "./workflow.controller";

@Module({
  imports: [
    AuditModule,
    IdGeneratorModule,
    BuildingsModule,
    ClientsModule,
    AssetsModule,
    IncidentsModule,
    WorkOrdersModule,
    PositionsModule,
    RoleGroupsModule,
    EmployeesModule,
    DepartmentsModule,
    PermissionsModule,
    WorkflowModule,
  ],
  controllers: [
    AdminManualController,
    PublicController,
    IncidentsController,
    WorkOrdersController,
    WorkflowController,
    // PositionsController and RoleGroupsController are registered via PositionsModule and RoleGroupsModule imports
    // EmployeesController, DepartmentsController, PermissionsController are registered via their module imports
  ],
})
export class V1Module {}
