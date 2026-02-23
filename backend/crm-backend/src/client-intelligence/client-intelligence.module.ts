import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneResolverModule } from '../common/phone-resolver/phone-resolver.module';
import { ClientIntelligenceController } from './client-intelligence.controller';
import { INTELLIGENCE_PROVIDER } from './interfaces/intelligence-provider.interface';
import { RuleBasedProvider } from './providers/rule-based.provider';
import { ActivityTimelineService } from './services/activity-timeline.service';
import { ClientMetricsService } from './services/client-metrics.service';
import { IntelligenceService } from './services/intelligence.service';

@Module({
  imports: [PrismaModule, PhoneResolverModule],
  controllers: [ClientIntelligenceController],
  providers: [
    ActivityTimelineService,
    ClientMetricsService,
    IntelligenceService,
    {
      provide: INTELLIGENCE_PROVIDER,
      useClass: RuleBasedProvider,
    },
  ],
  exports: [IntelligenceService, ActivityTimelineService],
})
export class ClientIntelligenceModule {}
