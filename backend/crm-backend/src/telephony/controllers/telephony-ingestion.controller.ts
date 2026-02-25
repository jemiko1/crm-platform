import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelephonyIngestGuard } from '../guards/telephony-ingest.guard';
import { TelephonyIngestionService } from '../services/telephony-ingestion.service';
import { IngestEventsDto } from '../dto/ingest-event.dto';

@ApiTags('Telephony')
@Controller('v1/telephony')
export class TelephonyIngestionController {
  constructor(private readonly ingestionService: TelephonyIngestionService) {}

  @Post('events')
  @UseGuards(TelephonyIngestGuard)
  async ingestEvents(@Body() dto: IngestEventsDto) {
    return this.ingestionService.ingestBatch(dto.events);
  }
}
