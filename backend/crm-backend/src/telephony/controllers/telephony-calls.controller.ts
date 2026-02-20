import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TelephonyCallsService } from '../services/telephony-calls.service';
import { TelephonyCallbackService } from '../services/telephony-callback.service';
import { QueryCallsDto, LookupPhoneDto } from '../dto/query-calls.dto';

@ApiTags('Telephony')
@Controller('v1/telephony')
@UseGuards(JwtAuthGuard)
export class TelephonyCallsController {
  constructor(
    private readonly callsService: TelephonyCallsService,
    private readonly callbackService: TelephonyCallbackService,
  ) {}

  @Get('calls')
  async getCalls(@Query() query: QueryCallsDto) {
    return this.callsService.findAll(query);
  }

  @Get('lookup')
  async lookupPhone(@Query() query: LookupPhoneDto) {
    return this.callsService.lookupPhone(query.phone);
  }

  @Get('callbacks')
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
