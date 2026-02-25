import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyWorktimeService } from '../services/telephony-worktime.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorktimeConfig } from '../types/telephony.types';

describe('TelephonyWorktimeService', () => {
  let service: TelephonyWorktimeService;
  let prisma: Record<string, any>;

  const weekdayConfig: WorktimeConfig = {
    timezone: 'UTC',
    windows: [
      { day: 1, start: '09:00', end: '18:00' }, // Mon
      { day: 2, start: '09:00', end: '18:00' }, // Tue
      { day: 3, start: '09:00', end: '18:00' }, // Wed
      { day: 4, start: '09:00', end: '18:00' }, // Thu
      { day: 5, start: '09:00', end: '18:00' }, // Fri
    ],
  };

  beforeEach(async () => {
    prisma = {
      telephonyQueue: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyWorktimeService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TelephonyWorktimeService);
  });

  describe('checkWithinWindows', () => {
    it('should return true for Monday 10:00 UTC', () => {
      // Feb 23, 2026 is a Monday
      const timestamp = new Date('2026-02-23T10:00:00Z');
      expect(service.checkWithinWindows(timestamp, weekdayConfig)).toBe(true);
    });

    it('should return false for Monday 07:00 UTC (before opening)', () => {
      const timestamp = new Date('2026-02-23T07:00:00Z');
      expect(service.checkWithinWindows(timestamp, weekdayConfig)).toBe(false);
    });

    it('should return false for Monday 19:00 UTC (after closing)', () => {
      const timestamp = new Date('2026-02-23T19:00:00Z');
      expect(service.checkWithinWindows(timestamp, weekdayConfig)).toBe(false);
    });

    it('should return false for Saturday', () => {
      // Feb 21, 2026 is a Saturday
      const timestamp = new Date('2026-02-21T12:00:00Z');
      expect(service.checkWithinWindows(timestamp, weekdayConfig)).toBe(false);
    });

    it('should return false for Sunday', () => {
      // Feb 22, 2026 is a Sunday
      const timestamp = new Date('2026-02-22T12:00:00Z');
      expect(service.checkWithinWindows(timestamp, weekdayConfig)).toBe(false);
    });

    it('should handle edge case at exactly opening time', () => {
      const timestamp = new Date('2026-02-23T09:00:00Z');
      expect(service.checkWithinWindows(timestamp, weekdayConfig)).toBe(true);
    });

    it('should handle edge case at exactly closing time', () => {
      const timestamp = new Date('2026-02-23T18:00:00Z');
      expect(service.checkWithinWindows(timestamp, weekdayConfig)).toBe(false);
    });
  });

  describe('findNextWindowStart', () => {
    it('should return same time if already within a window', () => {
      const timestamp = new Date('2026-02-23T10:00:00Z'); // Mon 10:00
      const result = service.findNextWindowStart(timestamp, weekdayConfig);
      expect(result.getTime()).toBe(timestamp.getTime());
    });

    it('should return a future time within a worktime window for after-hours on a weekday', () => {
      const timestamp = new Date('2026-02-23T19:00:00Z'); // Mon 19:00
      const result = service.findNextWindowStart(timestamp, weekdayConfig);
      expect(result.getTime()).toBeGreaterThan(timestamp.getTime());
      expect(service.checkWithinWindows(result, weekdayConfig)).toBe(true);
    });

    it('should return a Monday window for Saturday', () => {
      const timestamp = new Date('2026-02-21T12:00:00Z'); // Sat 12:00
      const result = service.findNextWindowStart(timestamp, weekdayConfig);
      expect(result.getTime()).toBeGreaterThan(timestamp.getTime());
      expect(service.checkWithinWindows(result, weekdayConfig)).toBe(true);
    });

    it('should handle empty windows config', () => {
      const emptyConfig: WorktimeConfig = { timezone: 'UTC', windows: [] };
      const timestamp = new Date('2026-02-21T12:00:00Z');
      const result = service.findNextWindowStart(timestamp, emptyConfig);
      expect(result.getTime()).toBe(timestamp.getTime());
    });
  });

  describe('isWithinWorktime (with DB)', () => {
    it('should return true when no worktime config exists (always open)', async () => {
      prisma.telephonyQueue.findUnique.mockResolvedValue({
        worktimeConfig: null,
      });

      const result = await service.isWithinWorktime('q-1', new Date());
      expect(result).toBe(true);
    });
  });
});
