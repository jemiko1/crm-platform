import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CallReportsService } from './call-reports.service';
import { CallReportsController } from './call-reports.controller';
import { DataScopeService } from '../common/utils/data-scope';

@Module({
  imports: [PrismaModule],
  controllers: [CallReportsController],
  providers: [CallReportsService, DataScopeService],
  exports: [CallReportsService, DataScopeService],
})
export class CallReportsModule {}
