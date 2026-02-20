import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';

import { WebChatAdapter } from './adapters/web-chat.adapter';
import { ViberAdapter } from './adapters/viber.adapter';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { AdapterRegistryService } from './adapters/adapter-registry.service';

import { ClientChatsCoreService } from './services/clientchats-core.service';
import { ClientChatsMatchingService } from './services/clientchats-matching.service';
import { ClientChatsObservabilityService } from './services/clientchats-observability.service';

import { ClientChatsPublicController } from './controllers/clientchats-public.controller';
import { ClientChatsAgentController } from './controllers/clientchats-agent.controller';
import { ClientChatsAdminController } from './controllers/clientchats-admin.controller';

import { ConversationTokenGuard } from './guards/conversation-token.guard';
import { ViberWebhookGuard, FacebookWebhookGuard } from './guards/webhook-signature.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
    }),
  ],
  controllers: [
    ClientChatsPublicController,
    ClientChatsAgentController,
    ClientChatsAdminController,
  ],
  providers: [
    WebChatAdapter,
    ViberAdapter,
    FacebookAdapter,
    AdapterRegistryService,
    ClientChatsCoreService,
    ClientChatsMatchingService,
    ClientChatsObservabilityService,
    ConversationTokenGuard,
    ViberWebhookGuard,
    FacebookWebhookGuard,
  ],
  exports: [
    ClientChatsCoreService,
    ClientChatsMatchingService,
    ClientChatsObservabilityService,
    AdapterRegistryService,
  ],
})
export class ClientChatsModule {}
