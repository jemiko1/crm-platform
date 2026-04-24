import { Test, TestingModule } from '@nestjs/testing';
import { PositionQueueRulesController } from './position-queue-rules.controller';
import { PrismaService } from '../../prisma/prisma.service';

describe('PositionQueueRulesController', () => {
  let controller: PositionQueueRulesController;
  let prisma: {
    positionQueueRule: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      positionQueueRule: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PositionQueueRulesController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get(PositionQueueRulesController);
  });

  describe('list', () => {
    it('flattens joined position + queue fields for the matrix UI', async () => {
      prisma.positionQueueRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          positionId: 'pos-1',
          queueId: 'q-1',
          createdAt: new Date('2026-04-24'),
          position: { id: 'pos-1', name: 'Call Center Operator', nameKa: 'ოპერატორი', code: 'CALL_CENTER' },
          queue: { id: 'q-1', name: '30', isAfterHoursQueue: false },
        },
      ]);

      const result = await controller.list();

      expect(result).toEqual([
        {
          id: 'rule-1',
          positionId: 'pos-1',
          queueId: 'q-1',
          positionName: 'Call Center Operator',
          positionNameKa: 'ოპერატორი',
          positionCode: 'CALL_CENTER',
          queueName: '30',
          isAfterHoursQueue: false,
          createdAt: new Date('2026-04-24'),
        },
      ]);
    });

    it('orders by position name then queue name', async () => {
      prisma.positionQueueRule.findMany.mockResolvedValue([]);
      await controller.list();
      const args = prisma.positionQueueRule.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([
        { position: { name: 'asc' } },
        { queue: { name: 'asc' } },
      ]);
    });
  });

  describe('create', () => {
    it('upserts on the compound unique key so double-clicks are idempotent', async () => {
      // Regression guard: if the matrix UI sends two POSTs for the same
      // cell in a race (double-click, or user rage-clicks), the second
      // request must NOT 409/500 on P2002. Upsert with update:{} is what
      // gives us the idempotency.
      const fakeRow = { id: 'rule-2', positionId: 'pos-1', queueId: 'q-2', createdAt: new Date() };
      prisma.positionQueueRule.upsert.mockResolvedValue(fakeRow);

      const result = await controller.create({ positionId: 'pos-1', queueId: 'q-2' });

      expect(result).toBe(fakeRow);
      expect(prisma.positionQueueRule.upsert).toHaveBeenCalledWith({
        where: { positionId_queueId: { positionId: 'pos-1', queueId: 'q-2' } },
        update: {},
        create: { positionId: 'pos-1', queueId: 'q-2' },
      });
    });
  });

  describe('remove', () => {
    it('uses deleteMany so removing an already-gone rule is a no-op (no 404)', async () => {
      prisma.positionQueueRule.deleteMany.mockResolvedValue({ count: 0 });
      await expect(controller.remove('does-not-exist')).resolves.toBeUndefined();
      expect(prisma.positionQueueRule.deleteMany).toHaveBeenCalledWith({
        where: { id: 'does-not-exist' },
      });
    });
  });
});
