import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

/**
 * Canonical softphone credential fetch (audit/P0-B).
 *
 * Returns the current authenticated user's own SIP credentials including
 * `sipPassword`. Only the Electron softphone is expected to call this
 * endpoint — the browser UI never needs the password.
 *
 * Guarded by the `softphone.handshake` permission so a compromised browser
 * JWT (for a user without softphone access) cannot leak credentials. Every
 * call is logged at LOG level with userId / ip / userAgent for audit trail.
 *
 * Prior to this endpoint, `/auth/me` returned `sipPassword` inline, which
 * meant any authenticated caller could retrieve their SIP credentials and
 * any XSS sink would leak them via the global user store. `/auth/me` no
 * longer exposes the password — the softphone must call this endpoint
 * explicitly.
 */
@ApiTags('Telephony')
@Controller('v1/telephony/sip-credentials')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class TelephonySipCredentialsController {
  private readonly logger = new Logger(TelephonySipCredentialsController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('softphone.handshake')
  @Doc({
    summary: "Current user's own SIP credentials for softphone registration",
    ok: 'Credentials (extension, sipUsername, sipPassword, sipServer, displayName)',
    notFound: true,
    permission: true,
  })
  async getCredentials(@Req() req: any) {
    const userId = req.user.id;
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const userAgent = req.headers?.['user-agent'] ?? 'unknown';

    this.logger.log(
      `sip-credentials requested userId=${userId} ip=${ip} ua=${userAgent}`,
    );

    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: userId },
      select: {
        extension: true,
        displayName: true,
        sipServer: true,
        sipPassword: true,
        isActive: true,
      },
    });

    if (!ext || !ext.isActive) {
      throw new NotFoundException(
        'No active telephony extension bound to this user',
      );
    }

    return {
      extension: ext.extension,
      sipUsername: ext.extension,
      sipPassword: ext.sipPassword,
      sipServer: ext.sipServer,
      displayName: ext.displayName,
    };
  }
}
