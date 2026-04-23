import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.call')
  @Doc({
    summary: 'Originate outbound call from user extension',
    ok: 'ARI channel info or AMI async acknowledgment',
    badRequest: true,
    permission: true,
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

  /**
   * Ownership guard for live-channel actions (hangup / transfer / hold).
   *
   * Without this, any caller holding `telephony.call` could POST an arbitrary
   * channelId and tear down or redirect another operator's live call. We
   * parse the extension out of the Asterisk channel name (e.g. the "200"
   * out of "PJSIP/200-00000123" or "Local/200@from-queue/n;1") and require
   * it to match the requesting user's extension. Managers with
   * `call_center.live` (supervisor permission) bypass. Superadmins bypass.
   *
   * Channel formats observed on our FreePBX 16 install:
   *   - `PJSIP/<ext>-<tail>`             (direct device leg)
   *   - `Local/<ext>@from-queue/n;<n>`   (queue member leg — see Risk #26)
   *   - `Local/<ext>@from-internal/n;<n>`
   */
  private extensionFromChannel(channelId: string): string | null {
    const m = channelId.match(/^(?:PJSIP|Local|SIP|IAX2)\/(\d+)/);
    return m ? m[1] : null;
  }

  private async assertChannelOwnership(
    req: any,
    channelId: string,
  ): Promise<void> {
    if (req.user?.isSuperAdmin) return;

    const permissions: string[] = req.user?.permissions ?? [];
    if (permissions.includes('call_center.live')) return;

    const channelExt = this.extensionFromChannel(channelId);
    if (!channelExt) {
      // Unparseable channel — we can't prove ownership; deny rather than
      // letting an opaque string through to AMI.
      throw new ForbiddenException('Unrecognized channel format');
    }

    const myExt = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: req.user.id },
      select: { extension: true },
    });
    if (!myExt || myExt.extension !== channelExt) {
      throw new ForbiddenException('You do not own this channel');
    }
  }

  @Post('transfer')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.call')
  @Doc({
    summary: 'Transfer active channel',
    ok: 'Redirect initiated',
    badRequest: true,
    permission: true,
  })
  async transfer(@Req() req: any, @Body() body: { channelId: string; target: string }) {
    if (!body.channelId || !body.target) {
      throw new BadRequestException('channelId and target are required');
    }
    await this.assertChannelOwnership(req, body.channelId);

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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.call')
  @Doc({
    summary: 'Hang up channel',
    ok: 'Hangup sent',
    badRequest: true,
    permission: true,
  })
  async hangup(@Req() req: any, @Body() body: { channelId: string }) {
    if (!body.channelId) {
      throw new BadRequestException('channelId is required');
    }
    await this.assertChannelOwnership(req, body.channelId);

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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.call')
  @Doc({
    summary: 'Hold or resume channel (ARI only)',
    ok: 'Hold state updated',
    badRequest: true,
    permission: true,
  })
  async hold(@Req() req: any, @Body() body: { channelId: string; hold: boolean }) {
    if (!body.channelId) {
      throw new BadRequestException('channelId is required');
    }
    await this.assertChannelOwnership(req, body.channelId);

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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.call')
  @Doc({
    summary: 'Add user extension to queue',
    ok: 'QueueAdd sent',
    badRequest: true,
    permission: true,
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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.call')
  @Doc({
    summary: 'Remove user extension from queue',
    ok: 'QueueRemove sent',
    badRequest: true,
    permission: true,
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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.call')
  @Doc({
    summary: 'Pause or unpause queue member',
    ok: 'QueuePause sent',
    badRequest: true,
    permission: true,
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
