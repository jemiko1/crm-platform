import { Module } from "@nestjs/common";
import { AssetsService } from "./assets.service";
import { IdGeneratorModule } from "../common/id-generator/id-generator.module";

@Module({
  imports: [IdGeneratorModule],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
