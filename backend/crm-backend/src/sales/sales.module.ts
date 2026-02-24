import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';

// Leads
import { LeadsController } from './leads/leads.controller';
import { LeadsService } from './leads/leads.service';
import { LeadActivityService } from './leads/lead-activity.service';

// Services
import { SalesServicesController } from './services/sales-services.controller';
import { SalesServicesService } from './services/sales-services.service';

// Plans
import { SalesPlansController } from './plans/sales-plans.controller';
import { SalesPlansService } from './plans/sales-plans.service';

// Config
import { SalesConfigController } from './config/sales-config.controller';
import { SalesConfigService } from './config/sales-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    LeadsController,
    SalesServicesController,
    SalesPlansController,
    SalesConfigController,
  ],
  providers: [
    LeadsService,
    LeadActivityService,
    SalesServicesService,
    SalesPlansService,
    SalesConfigService,
  ],
  exports: [
    LeadsService,
    LeadActivityService,
    SalesServicesService,
    SalesPlansService,
    SalesConfigService,
  ],
})
export class SalesModule {}
