import { Test, TestingModule } from '@nestjs/testing';
import { PhoneResolverService } from '../phone-resolver.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('PhoneResolverService', () => {
  let service: PhoneResolverService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      client: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhoneResolverService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PhoneResolverService);
  });

  describe('normalize', () => {
    it('should normalize full E.164 with + prefix', () => {
      expect(service.normalize('+995555123456')).toBe('995555123456');
    });

    it('should normalize with country code but no +', () => {
      expect(service.normalize('995555123456')).toBe('995555123456');
    });

    it('should normalize 9-digit local number by prepending 995', () => {
      expect(service.normalize('555123456')).toBe('995555123456');
    });

    it('should normalize 0-prefixed local number', () => {
      expect(service.normalize('0555123456')).toBe('995555123456');
    });

    it('should strip spaces, dashes, and parens', () => {
      expect(service.normalize('+995 555 12-34-56')).toBe('995555123456');
      expect(service.normalize('(555) 123 456')).toBe('995555123456');
      expect(service.normalize('555-123-456')).toBe('995555123456');
    });

    it('should handle already normalized input', () => {
      expect(service.normalize('995555123456')).toBe('995555123456');
    });

    it('should return raw digits for non-Georgian patterns', () => {
      expect(service.normalize('+1-555-123-4567')).toBe('15551234567');
    });

    it('should handle empty string', () => {
      expect(service.normalize('')).toBe('');
    });
  });

  describe('localDigits', () => {
    it('should extract last 9 digits from full E.164', () => {
      expect(service.localDigits('+995555123456')).toBe('555123456');
    });

    it('should extract last 9 from 0-prefixed', () => {
      expect(service.localDigits('0555123456')).toBe('555123456');
    });

    it('should return all digits when exactly 9', () => {
      expect(service.localDigits('555123456')).toBe('555123456');
    });

    it('should return all digits when fewer than 9', () => {
      expect(service.localDigits('12345')).toBe('12345');
    });

    it('should strip formatting before extracting', () => {
      expect(service.localDigits('+995 (555) 123-456')).toBe('555123456');
    });
  });

  describe('buildCallSessionFilter', () => {
    it('should generate OR clauses for caller and callee per phone', () => {
      const filters = service.buildCallSessionFilter(['+995555123456']);
      expect(filters).toEqual([
        { callerNumber: { contains: '555123456' } },
        { calleeNumber: { contains: '555123456' } },
      ]);
    });

    it('should generate clauses for multiple phones', () => {
      const filters = service.buildCallSessionFilter([
        '+995555123456',
        '0577654321',
      ]);
      expect(filters).toHaveLength(4);
      expect(filters[0]).toEqual({ callerNumber: { contains: '555123456' } });
      expect(filters[2]).toEqual({ callerNumber: { contains: '577654321' } });
    });

    it('should return empty array for no phones', () => {
      expect(service.buildCallSessionFilter([])).toEqual([]);
    });
  });

  describe('resolveClient', () => {
    it('should find client by primaryPhone match', async () => {
      const mockClient = { id: 'c-1', primaryPhone: '+995555123456' };
      prisma.client.findFirst.mockResolvedValue(mockClient);

      const result = await service.resolveClient('+995555123456');

      expect(result).toBe(mockClient);
      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { primaryPhone: { contains: '555123456' } },
            { secondaryPhone: { contains: '555123456' } },
          ],
        },
      });
    });

    it('should return null when no client matches', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      const result = await service.resolveClient('599000000');
      expect(result).toBeNull();
    });

    it('should return null for empty phone', async () => {
      const result = await service.resolveClient('');
      expect(result).toBeNull();
      expect(prisma.client.findFirst).not.toHaveBeenCalled();
    });

    it('should normalize before querying', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await service.resolveClient('+995 (555) 12-34-56');

      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { primaryPhone: { contains: '555123456' } },
            { secondaryPhone: { contains: '555123456' } },
          ],
        },
      });
    });
  });
});
