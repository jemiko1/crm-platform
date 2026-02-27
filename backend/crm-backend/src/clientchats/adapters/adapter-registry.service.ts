import { Injectable, Logger } from '@nestjs/common';
import { ClientChatChannelType } from '@prisma/client';
import { ChannelAdapter } from '../interfaces/channel-adapter.interface';
import { WebChatAdapter } from './web-chat.adapter';
import { ViberAdapter } from './viber.adapter';
import { FacebookAdapter } from './facebook.adapter';
import { TelegramAdapter } from './telegram.adapter';
import { WhatsAppAdapter } from './whatsapp.adapter';

@Injectable()
export class AdapterRegistryService {
  private readonly logger = new Logger(AdapterRegistryService.name);
  private readonly adapters = new Map<ClientChatChannelType, ChannelAdapter>();

  constructor(
    private readonly webChat: WebChatAdapter,
    private readonly viber: ViberAdapter,
    private readonly facebook: FacebookAdapter,
    private readonly telegram: TelegramAdapter,
    private readonly whatsapp: WhatsAppAdapter,
  ) {
    this.register(webChat);
    this.register(viber);
    this.register(facebook);
    this.register(telegram);
    this.register(whatsapp);
  }

  private register(adapter: ChannelAdapter) {
    this.adapters.set(adapter.channelType, adapter);
    this.logger.log(`Registered channel adapter: ${adapter.channelType}`);
  }

  get(type: ClientChatChannelType): ChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  getOrThrow(type: ClientChatChannelType): ChannelAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`No adapter registered for channel type: ${type}`);
    }
    return adapter;
  }

  listChannelTypes(): ClientChatChannelType[] {
    return Array.from(this.adapters.keys());
  }
}
