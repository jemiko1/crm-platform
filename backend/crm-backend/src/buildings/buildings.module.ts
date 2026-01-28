import { Module } from "@nestjs/common";
import { BuildingsService } from "./buildings.service";
import { BuildingsController } from "./buildings.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { IdGeneratorModule } from "../common/id-generator/id-generator.module";

@Module({
  imports: [PrismaModule, IdGeneratorModule],
  controllers: [BuildingsController],
  providers: [BuildingsService],
  exports: [BuildingsService],
})
export class BuildingsModule {}
