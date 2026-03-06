import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneResolverModule } from '../common/phone-resolver/phone-resolver.module';
import { ClientIntelligenceModule } from '../client-intelligence/client-intelligence.module';
import { JwtModule } from '@nestjs/jwt';
import { TelephonyIngestionController } from './controllers/telephony-ingestion.controller';
import { TelephonyStatsController } from './controllers/telephony-stats.controller';
import { TelephonyCallsController } from './controllers/telephony-calls.controller';
import { TelephonyQualityController } from './controllers/telephony-quality.controller';
import { TelephonyLiveController } from './controllers/telephony-live.controller';
import { TelephonyActionsController } from './controllers/telephony-actions.controller';
import { TelephonyRecordingController } from './controllers/telephony-recording.controller';
import { TelephonyExtensionsController } from './controllers/telephony-extensions.controller';
import { TelephonyIngestionService } from './services/telephony-ingestion.service';
import { TelephonyStatsService } from './services/telephony-stats.service';
import { TelephonyCallsService } from './services/telephony-calls.service';
import { TelephonyQualityService } from './services/telephony-quality.service';
import { TelephonyLiveService } from './services/telephony-live.service';
import { TelephonyCallbackService } from './services/telephony-callback.service';
import { TelephonyWorktimeService } from './services/telephony-worktime.service';
import { AmiClientService } from './ami/ami-client.service';
import { AmiEventMapperService } from './ami/ami-event-mapper.service';
import { TelephonyStateManager } from './realtime/telephony-state.manager';
import { TelephonyGateway } from './realtime/telephony.gateway';
import { AriClientService } from './ari/ari-client.service';
import { AsteriskSyncService } from './sync/asterisk-sync.service';
import { CdrImportService } from './cdr/cdr-import.service';
import { RecordingAccessService } from './recording/recording-access.service';
import { QualityPipelineService } from './quality/quality-pipeline.service';

@Module({
  imports: [
    PrismaModule,
    PhoneResolverModule,
    ClientIntelligenceModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [
    TelephonyIngestionController,
    TelephonyStatsController,
    TelephonyCallsController,
    TelephonyQualityController,
    TelephonyLiveController,
    TelephonyActionsController,
    TelephonyRecordingController,
    TelephonyExtensionsController,
  ],
  providers: [
    TelephonyIngestionService,
    TelephonyStatsService,
    TelephonyCallsService,
    TelephonyQualityService,
    TelephonyLiveService,
    TelephonyCallbackService,
    TelephonyWorktimeService,
    AmiClientService,
    AmiEventMapperService,
    TelephonyStateManager,
    TelephonyGateway,
    AriClientService,
    AsteriskSyncService,
    CdrImportService,
    RecordingAccessService,
    QualityPipelineService,
  ],
  exports: [
    TelephonyIngestionService,
    TelephonyStatsService,
    TelephonyCallsService,
    TelephonyQualityService,
    TelephonyLiveService,
    TelephonyCallbackService,
    TelephonyWorktimeService,
    AmiClientService,
    TelephonyStateManager,
    AriClientService,
  ],
})
export class TelephonyModule {}
