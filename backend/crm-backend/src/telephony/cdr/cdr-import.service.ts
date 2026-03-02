import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelephonyIngestionService } from '../services/telephony-ingestion.service';
import { IngestEventItemDto } from '../dto/ingest-event.dto';

interface CdrRow {
  uniqueid: string;
  linkedid: string;
  src: string;
  dst: string;
  dcontext: string;
  channel: string;
  dstchannel: string;
  disposition: string;
  duration: number;
  billsec: number;
  start: string;
  answer: string;
  end: string;
  recordingfile?: string;
}

@Injectable()
export class CdrImportService {
  private readonly logger = new Logger(CdrImportService.name);
  private readonly enabled: boolean;
  private readonly cdrDbUrl: string | null;
  private lastImportTimestamp: Date;
  private pgClient: any = null;

  constructor(private readonly ingestionService: TelephonyIngestionService) {
    this.enabled = process.env.CDR_IMPORT_ENABLED === 'true';
    this.cdrDbUrl = process.env.CDR_DB_URL ?? null;
    this.lastImportTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  @Cron('0 */5 * * * *')
  async importCdr(): Promise<void> {
    if (!this.enabled || !this.cdrDbUrl) return;

    try {
      const rows = await this.fetchCdrRows();
      if (rows.length === 0) return;

      const events = this.mapCdrToEvents(rows);
      const result = await this.ingestionService.ingestBatch(events);

      this.logger.log(
        `CDR import: ${rows.length} rows → ${result.processed} processed, ${result.skipped} skipped`,
      );

      const latestEnd = rows.reduce(
        (max, r) => {
          const d = new Date(r.end);
          return d > max ? d : max;
        },
        this.lastImportTimestamp,
      );
      this.lastImportTimestamp = latestEnd;
    } catch (err: any) {
      this.logger.error(`CDR import failed: ${err.message}`);
    }
  }

  private async fetchCdrRows(): Promise<CdrRow[]> {
    if (!this.pgClient) {
      const { default: pg } = await import('pg');
      this.pgClient = new pg.Client({ connectionString: this.cdrDbUrl! });
      await this.pgClient.connect();
    }

    const result = await this.pgClient.query(
      `SELECT uniqueid, linkedid, src, dst, dcontext, channel, dstchannel,
              disposition, duration, billsec, start, answer, "end", recordingfile
       FROM cdr
       WHERE "end" > $1
       ORDER BY "end" ASC
       LIMIT 500`,
      [this.lastImportTimestamp.toISOString()],
    );

    return result.rows;
  }

  mapCdrToEvents(rows: CdrRow[]): IngestEventItemDto[] {
    const events: IngestEventItemDto[] = [];

    for (const row of rows) {
      const startDto = new IngestEventItemDto();
      startDto.eventType = 'call_start' as any;
      startDto.timestamp = new Date(row.start).toISOString();
      startDto.idempotencyKey = `cdr:start:${row.uniqueid}`;
      startDto.linkedId = row.linkedid;
      startDto.uniqueId = row.uniqueid;
      startDto.payload = {
        callerIdNum: row.src,
        connectedLineNum: row.dst,
        context: row.dcontext,
        channel: row.channel,
        source: 'asterisk-cdr',
      };
      events.push(startDto);

      const endDto = new IngestEventItemDto();
      endDto.eventType = 'call_end' as any;
      endDto.timestamp = new Date(row.end).toISOString();
      endDto.idempotencyKey = `cdr:end:${row.uniqueid}`;
      endDto.linkedId = row.linkedid;
      endDto.uniqueId = row.uniqueid;
      endDto.payload = {
        callerIdNum: row.src,
        connectedLineNum: row.dst,
        context: row.dcontext,
        channel: row.channel,
        cause: this.mapCdrDisposition(row.disposition),
        causeTxt: row.disposition,
        talkTime: row.billsec,
        source: 'asterisk-cdr',
      };
      events.push(endDto);

      if (row.recordingfile) {
        const recDto = new IngestEventItemDto();
        recDto.eventType = 'recording_ready' as any;
        recDto.timestamp = new Date(row.end).toISOString();
        recDto.idempotencyKey = `cdr:rec:${row.uniqueid}`;
        recDto.linkedId = row.linkedid;
        recDto.uniqueId = row.uniqueid;
        recDto.payload = {
          recordingFile: row.recordingfile,
          recordingDuration: row.billsec,
          source: 'asterisk-cdr',
        };
        events.push(recDto);
      }
    }

    return events;
  }

  private mapCdrDisposition(disposition: string): string {
    switch ((disposition ?? '').toUpperCase()) {
      case 'ANSWERED':
        return '16';
      case 'NO ANSWER':
        return '19';
      case 'BUSY':
        return '17';
      case 'FAILED':
        return '38';
      default:
        return '0';
    }
  }
}
