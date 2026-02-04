import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";

import { IdGeneratorModule } from "./common/id-generator/id-generator.module";
import { AuditModule } from "./audit/audit.module";

import { BuildingsModule } from "./buildings/buildings.module";
import { ClientsModule } from "./clients/clients.module";
import { AssetsModule } from "./assets/assets.module";
import { IncidentsModule } from "./incidents/incidents.module";
import { WorkOrdersModule } from "./work-orders/work-orders.module";
import { InventoryModule } from "./inventory/inventory.module";
import { EmployeesModule } from "./employees/employees.module";
import { DepartmentsModule } from "./departments/departments.module";
import { RolesModule } from "./roles/roles.module";
import { PermissionsModule } from "./permissions/permissions.module";

// NEW: Position-based RBAC
import { PositionsModule } from "./positions/positions.module";
import { RoleGroupsModule } from "./role-groups/role-groups.module";

// System Lists Management
import { SystemListsModule } from "./system-lists/system-lists.module";

// Workflow Configuration
import { WorkflowModule } from "./workflow/workflow.module";

// Sales CRM
import { SalesModule } from "./sales/sales.module";

import { V1Module } from "./v1/v1.module";

@Module({
  imports: [
    // Infra
    PrismaModule,
    AuthModule,

    // Core building blocks
    IdGeneratorModule,
    AuditModule,

    // Domain modules
    BuildingsModule,
    ClientsModule,
    AssetsModule,
    IncidentsModule,
    WorkOrdersModule,
    InventoryModule,
    EmployeesModule,
    DepartmentsModule,
    RolesModule,
    PermissionsModule,

    // NEW: Position-based RBAC
    PositionsModule,
    RoleGroupsModule,

    // System Lists Management
    SystemListsModule,

    // Workflow Configuration
    WorkflowModule,

    // Sales CRM
    SalesModule,

    // API controllers (v1)
    V1Module,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
