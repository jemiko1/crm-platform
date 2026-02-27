import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneResolverModule } from '../common/phone-resolver/phone-resolver.module';

import { WebChatAdapter } from './adapters/web-chat.adapter';
import { ViberAdapter } from './adapters/viber.adapter';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { AdapterRegistryService } from './adapters/adapter-registry.service';

import { ClientChatsCoreService } from './services/clientchats-core.service';
import { ClientChatsMatchingService } from './services/clientchats-matching.service';
import { ClientChatsObservabilityService } from './services/clientchats-observability.service';
import { TelegramWebhookService } from './services/telegram-webhook.service';
import { TelegramPollingService } from './services/telegram-polling.service';
import { ViberWebhookService } from './services/viber-webhook.service';
import { FacebookWebhookService } from './services/facebook-webhook.service';
import { WhatsAppWebhookService } from './services/whatsapp-webhook.service';

import { ClientChatsPublicController } from './controllers/clientchats-public.controller';
import { ClientChatsAgentController } from './controllers/clientchats-agent.controller';
import { ClientChatsAdminController } from './controllers/clientchats-admin.controller';

import { ConversationTokenGuard } from './guards/conversation-token.guard';
import {
  ViberWebhookGuard,
  FacebookWebhookGuard,
  TelegramWebhookGuard,
} from './guards/webhook-signature.guard';

@Module({
  imports: [
    PrismaModule,
    PhoneResolverModule,
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
    TelegramAdapter,
    WhatsAppAdapter,
    AdapterRegistryService,
    ClientChatsCoreService,
    ClientChatsMatchingService,
    ClientChatsObservabilityService,
    TelegramWebhookService,
    TelegramPollingService,
    ViberWebhookService,
    FacebookWebhookService,
    WhatsAppWebhookService,
    ConversationTokenGuard,
    ViberWebhookGuard,
    FacebookWebhookGuard,
    TelegramWebhookGuard,
    WhatsAppWebhookGuard,
  ],
  exports: [
    ClientChatsCoreService,
    ClientChatsMatchingService,
    ClientChatsObservabilityService,
    AdapterRegistryService,
  ],
})
export class ClientChatsModule {}
