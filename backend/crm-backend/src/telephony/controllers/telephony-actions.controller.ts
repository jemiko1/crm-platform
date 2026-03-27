import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AriClientService } from '../ari/ari-client.service';
import { AmiClientService } from '../ami/ami-client.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('Telephony')
@Controller('v1/telephony/actions')
@UseGuards(JwtAuthGuard)
export class TelephonyActionsController {
  constructor(
    private readonly ari: AriClientService,
    private readonly ami: AmiClientService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('originate')
  @Doc({
    summary: 'Originate outbound call from user extension',
    ok: 'ARI channel info or AMI async acknowledgment',
    badRequest: true,
  })
  async originate(
    @Req() req: any,
    @Body() body: { number: string; callerId?: string },
  ) {
    if (!body.number) throw new BadRequestException('number is required');

    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: req.user.id },
    });
    if (!ext) {
      throw new BadRequestException('No telephony extension linked to your account');
    }

    if (this.ari.enabled) {
      const result = await this.ari.originate({
        endpoint: `PJSIP/${ext.extension}`,
        extension: body.number,
        context: 'from-internal',
        callerId: body.callerId ?? ext.displayName,
      });
      return { ok: true, channel: result };
    }

    // Fallback to AMI Originate
    await this.ami.sendAction({
      Action: 'Originate',
      Channel: `PJSIP/${ext.extension}`,
      Exten: body.number,
      Context: 'from-internal',
      Priority: '1',
      CallerID: body.callerId ?? ext.displayName,
      Async: 'true',
    });
    return { ok: true };
  }

  @Post('transfer')
  @Doc({
    summary: 'Transfer active channel',
    ok: 'Redirect initiated',
    badRequest: true,
  })
  async transfer(@Body() body: { channelId: string; target: string }) {
    if (!body.channelId || !body.target) {
      throw new BadRequestException('channelId and target are required');
    }

    if (this.ari.enabled) {
      await this.ari.redirect(body.channelId, `PJSIP/${body.target}`);
      return { ok: true };
    }

    await this.ami.sendAction({
      Action: 'Redirect',
      Channel: body.channelId,
      Exten: body.target,
      Context: 'from-internal',
      Priority: '1',
    });
    return { ok: true };
  }

  @Post('hangup')
  @Doc({
    summary: 'Hang up channel',
    ok: 'Hangup sent',
    badRequest: true,
  })
  async hangup(@Body() body: { channelId: string }) {
    if (!body.channelId) {
      throw new BadRequestException('channelId is required');
    }

    if (this.ari.enabled) {
      await this.ari.hangup(body.channelId);
      return { ok: true };
    }

    await this.ami.sendAction({
      Action: 'Hangup',
      Channel: body.channelId,
    });
    return { ok: true };
  }

  @Post('hold')
  @Doc({
    summary: 'Hold or resume channel (ARI only)',
    ok: 'Hold state updated',
    badRequest: true,
  })
  async hold(@Body() body: { channelId: string; hold: boolean }) {
    if (!body.channelId) {
      throw new BadRequestException('channelId is required');
    }

    if (this.ari.enabled) {
      if (body.hold) {
        await this.ari.hold(body.channelId);
      } else {
        await this.ari.unhold(body.channelId);
      }
      return { ok: true };
    }

    // AMI doesn't have direct hold/unhold; use Park or MusicOnHold
    throw new BadRequestException(
      'Hold via AMI requires custom dialplan; use ARI instead',
    );
  }

  @Post('queue-login')
  @Doc({
    summary: 'Add user extension to queue',
    ok: 'QueueAdd sent',
    badRequest: true,
  })
  async queueLogin(
    @Req() req: any,
    @Body() body: { queue: string },
  ) {
    if (!body.queue) throw new BadRequestException('queue is required');

    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: req.user.id },
    });
    if (!ext) {
      throw new BadRequestException('No telephony extension linked to your account');
    }

    await this.ami.sendAction({
      Action: 'QueueAdd',
      Queue: body.queue,
      Interface: `PJSIP/${ext.extension}`,
      Penalty: '0',
      Paused: 'false',
    });
    return { ok: true };
  }

  @Post('queue-logout')
  @Doc({
    summary: 'Remove user extension from queue',
    ok: 'QueueRemove sent',
    badRequest: true,
  })
  async queueLogout(
    @Req() req: any,
    @Body() body: { queue: string },
  ) {
    if (!body.queue) throw new BadRequestException('queue is required');

    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: req.user.id },
    });
    if (!ext) {
      throw new BadRequestException('No telephony extension linked to your account');
    }

    await this.ami.sendAction({
      Action: 'QueueRemove',
      Queue: body.queue,
      Interface: `PJSIP/${ext.extension}`,
    });
    return { ok: true };
  }

  @Post('queue-pause')
  @Doc({
    summary: 'Pause or unpause queue member',
    ok: 'QueuePause sent',
    badRequest: true,
  })
  async queuePause(
    @Req() req: any,
    @Body() body: { queue?: string; paused: boolean; reason?: string },
  ) {
    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: req.user.id },
    });
    if (!ext) {
      throw new BadRequestException('No telephony extension linked to your account');
    }

    const action: Record<string, string> = {
      Action: 'QueuePause',
      Interface: `PJSIP/${ext.extension}`,
      Paused: body.paused ? 'true' : 'false',
    };
    if (body.queue) action.Queue = body.queue;
    if (body.reason) action.Reason = body.reason;

    await this.ami.sendAction(action);
    return { ok: true };
  }
}
