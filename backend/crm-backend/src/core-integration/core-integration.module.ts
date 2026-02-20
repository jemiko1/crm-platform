import { Module } from "@nestjs/common";
import { CoreIntegrationController } from "./core-integration.controller";
import { CoreSyncService } from "./core-sync.service";

@Module({
  controllers: [CoreIntegrationController],
  providers: [CoreSyncService],
  exports: [CoreSyncService],
})
export class CoreIntegrationModule {}
