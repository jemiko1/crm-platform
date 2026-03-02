import { CdrImportService } from '../cdr/cdr-import.service';

describe('CdrImportService', () => {
  let service: CdrImportService;
  let mockIngestion: Record<string, any>;

  beforeEach(() => {
    process.env.CDR_IMPORT_ENABLED = 'false';
    mockIngestion = {
      ingestBatch: jest.fn().mockResolvedValue({
        processed: 0,
        skipped: 0,
        errors: [],
      }),
    };
    service = new CdrImportService(mockIngestion as any);
  });

  afterEach(() => {
    delete process.env.CDR_IMPORT_ENABLED;
    delete process.env.CDR_DB_URL;
  });

  it('should not import when disabled', async () => {
    await service.importCdr();
    expect(mockIngestion.ingestBatch).not.toHaveBeenCalled();
  });

  describe('mapCdrToEvents', () => {
    const sampleRow = {
      uniqueid: '123.1',
      linkedid: '123.1',
      src: '555111222',
      dst: '100',
      dcontext: 'from-external',
      channel: 'PJSIP/trunk-0001',
      dstchannel: 'PJSIP/100-0001',
      disposition: 'ANSWERED',
      duration: 120,
      billsec: 90,
      start: '2026-01-15T10:00:00Z',
      answer: '2026-01-15T10:00:30Z',
      end: '2026-01-15T10:02:00Z',
    };

    it('should produce call_start and call_end events', () => {
      const events = service.mapCdrToEvents([sampleRow]);
      expect(events.length).toBe(2);
      expect(events[0].eventType).toBe('call_start');
      expect(events[1].eventType).toBe('call_end');
    });

    it('should use unique idempotency keys', () => {
      const events = service.mapCdrToEvents([sampleRow]);
      const keys = events.map((e) => e.idempotencyKey);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('should produce recording_ready when recordingfile exists', () => {
      const withRecording = { ...sampleRow, recordingfile: '/rec/123.wav' };
      const events = service.mapCdrToEvents([withRecording]);
      expect(events.length).toBe(3);
      expect(events[2].eventType).toBe('recording_ready');
      expect(events[2].payload.recordingFile).toBe('/rec/123.wav');
    });

    it('should map caller and callee from CDR fields', () => {
      const events = service.mapCdrToEvents([sampleRow]);
      expect(events[0].payload.callerIdNum).toBe('555111222');
      expect(events[0].payload.connectedLineNum).toBe('100');
    });

    it('should map CDR disposition to cause code', () => {
      const events = service.mapCdrToEvents([sampleRow]);
      expect(events[1].payload.cause).toBe('16');
    });

    it('should handle NO ANSWER disposition', () => {
      const noAnswer = { ...sampleRow, disposition: 'NO ANSWER' };
      const events = service.mapCdrToEvents([noAnswer]);
      expect(events[1].payload.cause).toBe('19');
    });

    it('should handle BUSY disposition', () => {
      const busy = { ...sampleRow, disposition: 'BUSY' };
      const events = service.mapCdrToEvents([busy]);
      expect(events[1].payload.cause).toBe('17');
    });

    it('should handle empty rows', () => {
      const events = service.mapCdrToEvents([]);
      expect(events).toHaveLength(0);
    });
  });
});
