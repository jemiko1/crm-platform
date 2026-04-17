import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { TelephonyCallsService } from '../services/telephony-calls.service';
import { TelephonyCallbackService } from '../services/telephony-callback.service';
import { QueryCallsDto, LookupPhoneDto } from '../dto/query-calls.dto';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('Telephony')
@Controller('v1/telephony')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
@RequirePermission('call_center.menu')
export class TelephonyCallsController {
  constructor(
    private readonly callsService: TelephonyCallsService,
    private readonly callbackService: TelephonyCallbackService,
  ) {}

  @Get('calls')
  @Doc({ summary: 'Search and list calls', ok: 'Paged call records' })
  async getCalls(@Query() query: QueryCallsDto, @Req() req: any) {
    return this.callsService.findAll(query, req.user.id, req.user.isSuperAdmin);
  }

  @Get('lookup')
  @Doc({
    summary: 'Lookup CRM context by phone number',
    ok: 'Matching client/building hints',
    queries: [{ name: 'phone', description: 'E.164 or local phone', required: true }],
  })
  async lookupPhone(@Query() query: LookupPhoneDto) {
    return this.callsService.lookupPhone(query.phone);
  }

  @Get('history/:extension')
  @Doc({
    summary: 'Recent calls for extension',
    ok: 'Call history rows',
    params: [{ name: 'extension', description: 'PBX extension number' }],
  })
  async getExtensionHistory(@Param('extension') extension: string) {
    return this.callsService.getExtensionHistory(extension);
  }

  @Get('callbacks')
  @Doc({
    summary: 'Callback queue',
    ok: 'Paged callback tasks',
    queries: [
      { name: 'status', description: 'Status filter' },
      { name: 'page', description: 'Page number' },
      { name: 'pageSize', description: 'Page size' },
    ],
  })
  async getCallbacks(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.callbackService.getCallbackQueue({
      status: status as any,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }
}
