import { Module } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { IdGeneratorModule } from "../common/id-generator/id-generator.module";

@Module({
  imports: [IdGeneratorModule],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
