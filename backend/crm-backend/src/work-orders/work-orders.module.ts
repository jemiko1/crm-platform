import { Module } from "@nestjs/common";
import { WorkOrdersService } from "./work-orders.service";
import { WorkOrdersNotificationsService } from "./work-orders-notifications.service";
import { WorkOrderActivityService } from "./work-order-activity.service";
import { PrismaModule } from "../prisma/prisma.module";
import { BuildingsModule } from "../buildings/buildings.module";
import { AssetsModule } from "../assets/assets.module";
import { InventoryModule } from "../inventory/inventory.module";
import { WorkflowModule } from "../workflow/workflow.module";

@Module({
  imports: [PrismaModule, BuildingsModule, AssetsModule, InventoryModule, WorkflowModule],
  providers: [WorkOrdersService, WorkOrdersNotificationsService, WorkOrderActivityService],
  exports: [WorkOrdersService, WorkOrdersNotificationsService, WorkOrderActivityService],
})
export class WorkOrdersModule {}
