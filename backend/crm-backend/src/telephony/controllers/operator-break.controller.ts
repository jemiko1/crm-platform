import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';
import { OperatorBreakService } from '../services/operator-break.service';

/**
 * HTTP surface for the operator Break feature.
 *
 * Split by audience:
 *  - Operator-own (start/end/my-current): any authenticated user, but the
 *    service validates they have a TelephonyExtension. No permission
 *    check beyond JWT — a user without an extension fails in the
 *    service with 400 regardless.
 *  - Manager "currently on break": `call_center.live` — break status is a
 *    live-monitor concern, aligns with who's on a call, paused, etc.
 *  - Manager "break history": `call_center.statistics` — historical
 *    reporting concern.
 *
 * Both permissions already exist in the production seed catalog
 * (`seed-permissions.ts`). The upcoming permission refactor will
 * consolidate these under `call_center.manage`; at that point both
 * endpoints will migrate to the new name together.
 */
@ApiTags('Telephony')
@Controller('v1/telephony/breaks')
@UseGuards(JwtAuthGuard)
export class OperatorBreakController {
  constructor(private readonly service: OperatorBreakService) {}

  // ── Operator endpoints (caller's own break) ──────────────

  @Post('start')
  @Doc({
    summary: 'Start a break for the current user',
    ok: '{ id, startedAt, extension }',
    permission: false,
  })
  async start(@Req() req: any) {
    return this.service.start(req.user.id);
  }

  @Post('end')
  @Doc({
    summary: "End the current user's active break (idempotent)",
    ok: '{ id, startedAt, endedAt, durationSec } or null if no active break',
    permission: false,
  })
  async end(@Req() req: any) {
    return this.service.endForUser(req.user.id);
  }

  @Get('my-current')
  @Doc({
    summary: "Get the current user's active break (or null)",
    ok: 'Active OperatorBreakSession row or null',
    permission: false,
  })
  async myCurrent(@Req() req: any) {
    return this.service.getMyActive(req.user.id);
  }

  // ── Manager endpoints (all operators) ────────────────────

  @Get('current')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('call_center.live')
  @Doc({
    summary: 'List all currently-active breaks across operators',
    ok: 'Array of { userId, userName, extension, startedAt, elapsedSec }',
    permission: true,
  })
  async currentAll() {
    return this.service.getAllActive();
  }

  @Get('history')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('call_center.statistics')
  @Doc({
    summary: 'Paginated break history (finished sessions)',
    ok: '{ data, meta: { page, pageSize, total, totalPages } }',
    permission: true,
  })
  async history(
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('includeAutoEnded') includeAutoEnded?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.getHistory({
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      // ?includeAutoEnded=false excludes system-ended rows. Default: include.
      includeAutoEnded: includeAutoEnded === 'false' ? false : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }
}
