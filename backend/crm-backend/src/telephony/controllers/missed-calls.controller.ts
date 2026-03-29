import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';
import { MissedCallsService } from '../services/missed-calls.service';

@ApiTags('Telephony')
@Controller('v1/telephony/missed-calls')
@UseGuards(JwtAuthGuard)
export class MissedCallsController {
  constructor(private readonly missedCallsService: MissedCallsService) {}

  @Get()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('missed_calls.access')
  @Doc({
    summary: 'List missed calls with smart filtering',
    ok: 'Paginated missed calls with enriched context',
    permission: true,
  })
  async findAll(
    @Query('status') status?: string,
    @Query('queueId') queueId?: string,
    @Query('myClaimsOnly') myClaimsOnly?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: any,
  ) {
    return this.missedCallsService.findAll({
      status,
      queueId,
      claimedByMe: myClaimsOnly === 'true' ? req?.user?.sub : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Patch(':id/claim')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('missed_calls.manage')
  @Doc({
    summary: 'Claim a missed call for processing',
    ok: 'Missed call claimed',
    permission: true,
  })
  async claim(@Param('id') id: string, @Req() req: any) {
    return this.missedCallsService.claim(id, req.user.sub);
  }

  @Patch(':id/attempt')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('missed_calls.manage')
  @Doc({
    summary: 'Record a callback attempt',
    ok: 'Attempt recorded',
    permission: true,
  })
  async recordAttempt(
    @Param('id') id: string,
    @Body('note') note?: string,
  ) {
    return this.missedCallsService.recordAttempt(id, note);
  }

  @Patch(':id/resolve')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('missed_calls.manage')
  @Doc({
    summary: 'Manually resolve a missed call',
    ok: 'Missed call resolved',
    permission: true,
  })
  async resolve(
    @Param('id') id: string,
    @Body('note') note?: string,
  ) {
    return this.missedCallsService.resolve(id, note);
  }

  @Patch(':id/ignore')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('missed_calls.manage')
  @Doc({
    summary: 'Ignore a missed call with reason',
    ok: 'Missed call ignored',
    permission: true,
  })
  async ignore(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.missedCallsService.ignore(id, reason ?? 'No reason provided');
  }
}
