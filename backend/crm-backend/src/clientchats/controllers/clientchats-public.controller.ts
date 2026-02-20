import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { ClientChatChannelType } from '@prisma/client';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { ClientChatsObservabilityService } from '../services/clientchats-observability.service';
import { WebChatAdapter } from '../adapters/web-chat.adapter';
import { ViberAdapter } from '../adapters/viber.adapter';
import { FacebookAdapter } from '../adapters/facebook.adapter';
import { ConversationTokenGuard } from '../guards/conversation-token.guard';
import { ViberWebhookGuard, FacebookWebhookGuard } from '../guards/webhook-signature.guard';
import { StartChatDto } from '../dto/start-chat.dto';
import { SendWidgetMessageDto } from '../dto/send-widget-message.dto';
import { ConversationTokenPayload } from '../guards/conversation-token.guard';
import { randomUUID } from 'crypto';

@Controller('public/clientchats')
export class ClientChatsPublicController {
  private readonly logger = new Logger(ClientChatsPublicController.name);

  constructor(
    private readonly core: ClientChatsCoreService,
    private readonly observability: ClientChatsObservabilityService,
    private readonly webChat: WebChatAdapter,
    private readonly viber: ViberAdapter,
    private readonly facebook: FacebookAdapter,
    private readonly jwt: JwtService,
  ) {}

  // ── Web Widget ─────────────────────────────────────────

  @Post('start')
  async startChat(@Body() dto: StartChatDto) {
    const visitorId = dto.visitorId || randomUUID();
    const account = await this.core.getOrCreateDefaultAccount(
      ClientChatChannelType.WEB,
    );

    const parsed = this.webChat.parseInbound({
      visitorId,
      text: '[Chat started]',
      messageId: `web_start_${visitorId}_${Date.now()}`,
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
    });

    if (!parsed) {
      return { error: 'Invalid start payload' };
    }

    await this.core.processInbound(
      ClientChatChannelType.WEB,
      account.id,
      parsed,
    );

    const conversation =
      await this.core['prisma'].clientChatConversation.findUnique({
        where: { externalConversationId: parsed.externalConversationId },
      });

    const tokenPayload: ConversationTokenPayload = {
      conversationId: conversation!.id,
      visitorId,
      channelAccountId: account.id,
    };

    const token = this.jwt.sign(tokenPayload, { expiresIn: '24h' });

    return { conversationId: conversation!.id, visitorId, token };
  }

  @Post('message')
  @UseGuards(ConversationTokenGuard)
  async sendWidgetMessage(
    @Body() dto: SendWidgetMessageDto,
    @Req() req: Request,
  ) {
    const tokenPayload = (req as any).conversationToken as ConversationTokenPayload;

    const parsed = this.webChat.parseInbound({
      visitorId: tokenPayload.visitorId,
      text: dto.text,
    });

    if (!parsed) {
      return { error: 'Invalid message' };
    }

    const message = await this.core.processInbound(
      ClientChatChannelType.WEB,
      tokenPayload.channelAccountId,
      parsed,
    );

    return { messageId: message.id };
  }

  // ── Viber Webhook ──────────────────────────────────────

  @Post('webhook/viber')
  @UseGuards(ViberWebhookGuard)
  @HttpCode(200)
  async viberWebhook(@Body() body: unknown) {
    try {
      const b = body as Record<string, unknown>;

      // Viber sends a 'webhook' event on registration — acknowledge it
      if (b.event === 'webhook') {
        return { status: 0, status_message: 'ok' };
      }

      const parsed = this.viber.parseInbound(body);
      if (!parsed) return { status: 0 };

      const account = await this.core.getOrCreateDefaultAccount(
        ClientChatChannelType.VIBER,
      );

      await this.core.processInbound(
        ClientChatChannelType.VIBER,
        account.id,
        parsed,
      );

      return { status: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Viber webhook error: ${msg}`);
      await this.observability.logWebhookFailure(
        ClientChatChannelType.VIBER,
        msg,
        { event: (body as any)?.event },
      );
      return { status: 0 };
    }
  }

  // ── Facebook Webhook ───────────────────────────────────

  @Get('webhook/facebook')
  facebookVerify(@Req() req: Request, @Res() res: Response) {
    const challenge = this.facebook.getVerificationChallenge(req);
    if (this.facebook.verifyWebhook(req) && challenge) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Verification failed');
  }

  @Post('webhook/facebook')
  @UseGuards(FacebookWebhookGuard)
  @HttpCode(200)
  async facebookWebhook(@Body() body: unknown) {
    try {
      const parsed = this.facebook.parseInbound(body);
      if (!parsed) return 'EVENT_RECEIVED';

      const account = await this.core.getOrCreateDefaultAccount(
        ClientChatChannelType.FACEBOOK,
      );

      await this.core.processInbound(
        ClientChatChannelType.FACEBOOK,
        account.id,
        parsed,
      );

      return 'EVENT_RECEIVED';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Facebook webhook error: ${msg}`);
      await this.observability.logWebhookFailure(
        ClientChatChannelType.FACEBOOK,
        msg,
        { object: (body as any)?.object },
      );
      return 'EVENT_RECEIVED';
    }
  }
}
