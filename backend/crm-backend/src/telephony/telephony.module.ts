import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneResolverModule } from '../common/phone-resolver/phone-resolver.module';
import { TelephonyIngestionController } from './controllers/telephony-ingestion.controller';
import { TelephonyStatsController } from './controllers/telephony-stats.controller';
import { TelephonyCallsController } from './controllers/telephony-calls.controller';
import { TelephonyQualityController } from './controllers/telephony-quality.controller';
import { TelephonyLiveController } from './controllers/telephony-live.controller';
import { TelephonyIngestionService } from './services/telephony-ingestion.service';
import { TelephonyStatsService } from './services/telephony-stats.service';
import { TelephonyCallsService } from './services/telephony-calls.service';
import { TelephonyQualityService } from './services/telephony-quality.service';
import { TelephonyLiveService } from './services/telephony-live.service';
import { TelephonyCallbackService } from './services/telephony-callback.service';
import { TelephonyWorktimeService } from './services/telephony-worktime.service';

@Module({
  imports: [PrismaModule, PhoneResolverModule],
  controllers: [
    TelephonyIngestionController,
    TelephonyStatsController,
    TelephonyCallsController,
    TelephonyQualityController,
    TelephonyLiveController,
  ],
  providers: [
    TelephonyIngestionService,
    TelephonyStatsService,
    TelephonyCallsService,
    TelephonyQualityService,
    TelephonyLiveService,
    TelephonyCallbackService,
    TelephonyWorktimeService,
  ],
  exports: [
    TelephonyIngestionService,
    TelephonyStatsService,
    TelephonyCallsService,
    TelephonyQualityService,
    TelephonyLiveService,
    TelephonyCallbackService,
    TelephonyWorktimeService,
  ],
})
export class TelephonyModule {}
