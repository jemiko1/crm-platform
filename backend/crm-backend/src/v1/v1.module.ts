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
import { RoleGroupsModule } from "../role-groups/role-groups.module";

// Employees & Departments
import { EmployeesModule } from "../employees/employees.module";
import { DepartmentsModule } from "../departments/departments.module";
import { PermissionsModule } from "../permissions/permissions.module";

// Workflow Configuration
import { WorkflowModule } from "../workflow/workflow.module";
import { WorkflowController } from "./workflow.controller";

// Notifications (Email / SMS)
import { NotificationsModule } from "../notifications/notifications.module";
import { NotificationsController } from "./notifications.controller";

// Telephony / Call Center
import { TelephonyModule } from "../telephony/telephony.module";

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
    NotificationsModule,
    TelephonyModule,
  ],
  controllers: [
    AdminManualController,
    PublicController,
    IncidentsController,
    WorkOrdersController,
    WorkflowController,
    NotificationsController,
    // PositionsController and RoleGroupsController are registered via PositionsModule and RoleGroupsModule imports
    // EmployeesController, DepartmentsController, PermissionsController are registered via their module imports
  ],
})
export class V1Module {}
