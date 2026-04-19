import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AgentPresenceService } from '../services/agent-presence.service';
import { ReportPresenceDto } from '../dto/agent-presence.dto';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

/**
 * Softphone → backend SIP presence heartbeat. Called every 30s while the
 * softphone holds an active SIP registration, and immediately on any state
 * transition (registered ↔ unregistered).
 *
 * Gated behind `softphone.handshake` — same permission the device-token
 * pairing flow uses; operators have it, web-only users do not.
 */
@ApiTags('Telephony')
@Controller('v1/telephony/agents')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class TelephonyPresenceController {
  constructor(private readonly presenceService: AgentPresenceService) {}

  @Post('presence')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('softphone.handshake')
  @Doc({
    summary: 'Softphone SIP registration heartbeat',
    ok: 'Recorded heartbeat',
    badRequest: true,
    notFound: true,
    bodyType: ReportPresenceDto,
    permission: true,
    status: 200,
  })
  async reportPresence(
    @Req() req: { user: { id: string } },
    @Body() dto: ReportPresenceDto,
  ) {
    const result = await this.presenceService.reportState(
      req.user.id,
      dto.state,
      dto.extension,
    );

    return {
      ok: true,
      sipRegistered: result.sipRegistered,
      sipLastSeenAt: result.sipLastSeenAt.toISOString(),
      extension: result.extension,
      stateChanged: result.stateChanged,
    };
  }
}
