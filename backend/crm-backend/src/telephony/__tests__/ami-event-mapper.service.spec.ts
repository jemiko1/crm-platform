import { AmiEventMapperService } from '../ami/ami-event-mapper.service';
import type { RawAmiEvent } from '../ami/ami.types';

describe('AmiEventMapperService', () => {
  let mapper: AmiEventMapperService;

  beforeEach(() => {
    const mockAmiClient = { on: jest.fn(), emit: jest.fn() } as any;
    const mockIngestion = { ingestBatch: jest.fn() } as any;
    mapper = new AmiEventMapperService(mockAmiClient, mockIngestion);
  });

  function makeEvent(overrides: Partial<RawAmiEvent>): RawAmiEvent {
    return {
      event: 'Unknown',
      uniqueid: '1234.1',
      linkedid: '1234.1',
      channel: 'PJSIP/100-0001',
      calleridnum: '555123456',
      calleridname: 'Test Caller',
      context: 'from-external',
      ...overrides,
    };
  }

  describe('Newchannel → call_start', () => {
    it('should map to call_start when uniqueid === linkedid', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'Newchannel', uniqueid: '1234.1', linkedid: '1234.1' }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('call_start');
      expect(result![0].linkedId).toBe('1234.1');
    });

    it('should skip when uniqueid !== linkedid (child channel)', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'Newchannel', uniqueid: '1234.2', linkedid: '1234.1' }),
      );
      expect(result).toBeNull();
    });
  });

  describe('DialEnd → call_answer', () => {
    it('should map ANSWER status to call_answer', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'DialEnd', dialstatus: 'ANSWER' }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('call_answer');
    });

    it('should skip non-ANSWER dial status', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'DialEnd', dialstatus: 'BUSY' }),
      );
      expect(result).toBeNull();
    });
  });

  describe('Hangup → call_end', () => {
    it('should map to call_end when uniqueid === linkedid', () => {
      const result = mapper.mapEvent(
        makeEvent({
          event: 'Hangup',
          cause: '16',
          'cause-txt': 'Normal Clearing',
        }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('call_end');
      expect(result![0].payload.causeTxt).toBe('Normal Clearing');
    });

    it('should skip child channel hangups', () => {
      const result = mapper.mapEvent(
        makeEvent({
          event: 'Hangup',
          uniqueid: '1234.2',
          linkedid: '1234.1',
        }),
      );
      expect(result).toBeNull();
    });
  });

  describe('QueueCallerJoin → queue_enter', () => {
    it('should map with queue name', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'QueueCallerJoin', queue: 'sales', position: '1' }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('queue_enter');
      expect(result![0].payload.queue).toBe('sales');
    });

    it('should skip without queue name', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'QueueCallerJoin', queue: undefined }),
      );
      expect(result).toBeNull();
    });
  });

  describe('QueueCallerLeave → queue_leave', () => {
    it('should map correctly', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'QueueCallerLeave', queue: 'sales' }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('queue_leave');
    });
  });

  describe('AgentConnect → agent_connect', () => {
    it('should map with extension from destchannel', () => {
      const result = mapper.mapEvent(
        makeEvent({
          event: 'AgentConnect',
          destchannel: 'PJSIP/200-0002',
          queue: 'support',
          holdtime: '15',
        }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('agent_connect');
      expect(result![0].payload.extension).toBe('200');
    });
  });

  describe('BlindTransfer → transfer', () => {
    it('should map blind transfer', () => {
      const result = mapper.mapEvent(
        makeEvent({
          event: 'BlindTransfer',
          transfertargetchannel: 'PJSIP/300-0003',
        }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('transfer');
      expect(result![0].payload.transferType).toBe('blind');
    });
  });

  describe('AttendedTransfer → transfer', () => {
    it('should map attended transfer', () => {
      const result = mapper.mapEvent(
        makeEvent({
          event: 'AttendedTransfer',
          transfertargetchannel: 'PJSIP/300-0003',
        }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('transfer');
      expect(result![0].payload.transferType).toBe('attended');
    });
  });

  describe('MusicOnHold → hold_start / hold_end', () => {
    it('should map MusicOnHoldStart to hold_start', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'MusicOnHoldStart' }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('hold_start');
    });

    it('should map MusicOnHoldStop to hold_end', () => {
      const result = mapper.mapEvent(
        makeEvent({ event: 'MusicOnHoldStop' }),
      );
      expect(result).toHaveLength(1);
      expect(result![0].eventType).toBe('hold_end');
    });
  });

  describe('unknown events', () => {
    it('should return null for unrecognized events', () => {
      const result = mapper.mapEvent(makeEvent({ event: 'SomethingElse' }));
      expect(result).toBeNull();
    });
  });

  describe('idempotency keys', () => {
    it('should generate unique keys per event type', () => {
      const start = mapper.mapEvent(
        makeEvent({ event: 'Newchannel' }),
      )!;
      const end = mapper.mapEvent(
        makeEvent({ event: 'Hangup', cause: '16', 'cause-txt': 'Normal' }),
      )!;
      expect(start[0].idempotencyKey).not.toBe(end[0].idempotencyKey);
    });
  });
});
