import {
  Controller,
  Get,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';
import { OperatorDndService } from '../services/operator-dnd.service';

/**
 * Operator Do-Not-Disturb (DND) endpoints.
 *
 * All endpoints are operator-own (use the JWT-derived userId as the
 * target). No permission guard beyond JwtAuthGuard — the service
 * validates the user has an active TelephonyExtension and fails
 * cleanly with 400 if not.
 *
 * Unlike Break (which has separate manager read-only endpoints), DND
 * state is already visible in the existing `call_center.live` monitor
 * as agent `presence: PAUSED`. Managers see it there — no DND-specific
 * manager endpoints needed.
 */
@ApiTags('Telephony')
@Controller('v1/telephony/dnd')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
@RequirePermission('telephony.call')
export class OperatorDndController {
  constructor(private readonly service: OperatorDndService) {}

  @Post('enable')
  @Doc({
    summary: 'Enable DND for the current user (AMI QueuePause all queues)',
    ok: '{ enabled: true, extension }',
    permission: true,
  })
  async enable(@Req() req: any) {
    return this.service.enable(req.user.id);
  }

  @Post('disable')
  @Doc({
    summary: 'Disable DND for the current user',
    ok: '{ enabled: false, extension }',
    permission: true,
  })
  async disable(@Req() req: any) {
    return this.service.disable(req.user.id);
  }

  @Get('my-state')
  @Header('Cache-Control', 'no-store')
  @Doc({
    summary: "Get the current user's DND state (read from live AMI cache)",
    ok: '{ enabled: boolean, extension: string | null }',
    permission: true,
  })
  myState(@Req() req: any) {
    return this.service.getMyState(req.user.id);
  }
}
