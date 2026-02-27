import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ClientChatChannelType } from '@prisma/client';
import { ViberAdapter } from '../adapters/viber.adapter';
import { FacebookAdapter } from '../adapters/facebook.adapter';
import { TelegramAdapter } from '../adapters/telegram.adapter';
import { WhatsAppAdapter } from '../adapters/whatsapp.adapter';
import { ClientChatsCoreService } from '../services/clientchats-core.service';

@Injectable()
export class ViberWebhookGuard implements CanActivate {
  private readonly logger = new Logger(ViberWebhookGuard.name);

  constructor(
    private readonly viber: ViberAdapter,
    private readonly core: ClientChatsCoreService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const account = await this.core.getOrCreateDefaultAccount(
      ClientChatChannelType.VIBER,
    );
    const token = (account.metadata as Record<string, unknown>)
      ?.viberBotToken as string | undefined;
    if (!this.viber.verifyWebhook(req, token)) {
      this.logger.warn('Invalid Viber webhook signature');
      throw new ForbiddenException('Invalid Viber signature');
    }
    return true;
  }
}

@Injectable()
export class FacebookWebhookGuard implements CanActivate {
  private readonly logger = new Logger(FacebookWebhookGuard.name);

  constructor(
    private readonly facebook: FacebookAdapter,
    private readonly core: ClientChatsCoreService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const account = await this.core.getOrCreateDefaultAccount(
      ClientChatChannelType.FACEBOOK,
    );
    const meta = account.metadata as Record<string, unknown> | null;
    const overrides =
      meta?.fbAppSecret || meta?.fbVerifyToken
        ? {
            appSecret: meta?.fbAppSecret as string | undefined,
            verifyToken: meta?.fbVerifyToken as string | undefined,
          }
        : undefined;
    if (!this.facebook.verifyWebhook(req, overrides)) {
      this.logger.warn('Invalid Facebook webhook signature');
      throw new ForbiddenException('Invalid Facebook signature');
    }
    return true;
  }
}

@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  private readonly logger = new Logger(TelegramWebhookGuard.name);

  constructor(
    private readonly telegram: TelegramAdapter,
    private readonly core: ClientChatsCoreService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const account = await this.core.getOrCreateDefaultAccount(
      ClientChatChannelType.TELEGRAM,
    );
    const token = (account.metadata as Record<string, unknown>)
      ?.telegramBotToken as string | undefined;
    if (!this.telegram.verifyWebhook(req, token)) {
      this.logger.warn('Invalid Telegram webhook verification');
      throw new ForbiddenException('Invalid Telegram webhook');
    }
    return true;
  }
}

@Injectable()
export class WhatsAppWebhookGuard implements CanActivate {
  private readonly logger = new Logger(WhatsAppWebhookGuard.name);

  constructor(
    private readonly whatsapp: WhatsAppAdapter,
    private readonly core: ClientChatsCoreService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const account = await this.core.getOrCreateDefaultAccount(
      ClientChatChannelType.WHATSAPP,
    );
    const meta = account.metadata as Record<string, unknown> | null;
    const overrides =
      meta?.waAppSecret || meta?.waVerifyToken
        ? {
            appSecret: meta?.waAppSecret as string | undefined,
            verifyToken: meta?.waVerifyToken as string | undefined,
          }
        : undefined;
    if (!this.whatsapp.verifyWebhook(req, overrides)) {
      this.logger.warn('Invalid WhatsApp webhook verification');
      throw new ForbiddenException('Invalid WhatsApp webhook');
    }
    return true;
  }
}
