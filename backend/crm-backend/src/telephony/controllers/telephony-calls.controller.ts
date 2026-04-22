import { Controller, Get, Header, Param, Query, Req, UseGuards } from '@nestjs/common';
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

  /**
   * Disable HTTP caching on all live telephony list endpoints.
   *
   * Background: Express's default `etag: "weak"` adds an `ETag` header
   * on every response. The browser remembers it and sends
   * `If-None-Match` on subsequent identical requests — if the hash
   * matches, the server returns 304 and the browser reuses the
   * previously-cached body.
   *
   * This is a disaster for paginated live-data endpoints: new calls
   * landing in the DB don't change the ETag if the query window
   * extends far enough back that the first-page top is stable (or if
   * the underlying response is empty both times). A field report in
   * April 2026 had one operator seeing an empty Call Logs table for
   * hours because the browser cached the first empty response and then
   * 304'd forever — even though the DB had filled up with fresh rows.
   *
   * `no-store` guarantees a fresh 200 with current data on every
   * load. We apply it controller-wide because every endpoint here
   * returns live, time-sensitive data (calls list, CRM lookup for
   * an incoming call popup, extension history, callbacks queue).
   */
  @Get('calls')
  @Header('Cache-Control', 'no-store')
  @Doc({ summary: 'Search and list calls', ok: 'Paged call records' })
  async getCalls(@Query() query: QueryCallsDto, @Req() req: any) {
    return this.callsService.findAll(query, req.user.id, req.user.isSuperAdmin);
  }

  @Get('lookup')
  @Header('Cache-Control', 'no-store')
  @Doc({
    summary: 'Lookup CRM context by phone number',
    ok: 'Matching client/building hints',
    queries: [{ name: 'phone', description: 'E.164 or local phone', required: true }],
  })
  async lookupPhone(@Query() query: LookupPhoneDto) {
    return this.callsService.lookupPhone(query.phone);
  }

  @Get('history/:extension')
  @Header('Cache-Control', 'no-store')
  @Doc({
    summary: 'Recent calls for extension',
    ok: 'Call history rows',
    params: [{ name: 'extension', description: 'PBX extension number' }],
  })
  async getExtensionHistory(@Param('extension') extension: string) {
    return this.callsService.getExtensionHistory(extension);
  }

  @Get('callbacks')
  @Header('Cache-Control', 'no-store')
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
