import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { IncidentsService } from "./incidents.service";

@Module({
  imports: [PrismaModule],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
