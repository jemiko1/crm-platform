import { TelephonyStateManager } from '../realtime/telephony-state.manager';
import type { RawAmiEvent } from '../ami/ami.types';

describe('TelephonyStateManager', () => {
  let manager: TelephonyStateManager;

  beforeEach(() => {
    const mockPrisma = {
      telephonyExtension: { findMany: jest.fn().mockResolvedValue([]) },
      callSession: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const mockAmi = { on: jest.fn(), emit: jest.fn() } as any;
    manager = new TelephonyStateManager(mockPrisma, mockAmi);
  });

  function emit(overrides: Partial<RawAmiEvent>): void {
    manager.handleAmiEvent({
      event: 'Unknown',
      uniqueid: '1.1',
      linkedid: '1.1',
      channel: 'PJSIP/100-0001',
      calleridnum: '555000111',
      ...overrides,
    });
  }

  describe('call lifecycle', () => {
    it('should track a new call on Newchannel', () => {
      emit({ event: 'Newchannel' });
      expect(manager.getActiveCalls()).toHaveLength(1);
      expect(manager.getActiveCall('1.1')?.state).toBe('RINGING');
    });

    it('should update state to QUEUED on QueueCallerJoin', () => {
      emit({ event: 'Newchannel' });
      emit({ event: 'QueueCallerJoin', queue: 'sales' });
      expect(manager.getActiveCall('1.1')?.state).toBe('QUEUED');
      expect(manager.getActiveCall('1.1')?.queueName).toBe('sales');
    });

    it('should update state to CONNECTED on AgentConnect', () => {
      emit({ event: 'Newchannel' });
      emit({ event: 'AgentConnect', destchannel: 'PJSIP/200-0002' });
      expect(manager.getActiveCall('1.1')?.state).toBe('CONNECTED');
      expect(manager.getActiveCall('1.1')?.assignedExtension).toBe('200');
    });

    it('should update state to ON_HOLD on MusicOnHoldStart', () => {
      emit({ event: 'Newchannel' });
      emit({ event: 'AgentConnect', destchannel: 'PJSIP/200-0002' });
      emit({ event: 'MusicOnHoldStart' });
      expect(manager.getActiveCall('1.1')?.state).toBe('ON_HOLD');
    });

    it('should return to CONNECTED on MusicOnHoldStop', () => {
      emit({ event: 'Newchannel' });
      emit({ event: 'AgentConnect', destchannel: 'PJSIP/200-0002' });
      emit({ event: 'MusicOnHoldStart' });
      emit({ event: 'MusicOnHoldStop' });
      expect(manager.getActiveCall('1.1')?.state).toBe('CONNECTED');
    });

    it('should remove call on Hangup', () => {
      emit({ event: 'Newchannel' });
      emit({ event: 'Hangup' });
      expect(manager.getActiveCalls()).toHaveLength(0);
    });

    it('should not track child channels', () => {
      emit({ event: 'Newchannel', uniqueid: '1.2', linkedid: '1.1' });
      expect(manager.getActiveCalls()).toHaveLength(0);
    });
  });

  describe('queue snapshots', () => {
    it('should aggregate queue state from active calls', () => {
      emit({ event: 'Newchannel' });
      emit({ event: 'QueueCallerJoin', queue: 'sales' });

      // manually set queueId for snapshot
      const call = manager.getActiveCall('1.1');
      if (call) call.queueId = 'q1';

      const snapshots = manager.getQueueSnapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].waitingCallers).toBe(1);
      expect(snapshots[0].activeCalls).toBe(1);
    });
  });

  describe('agent states', () => {
    it('should return empty by default', () => {
      expect(manager.getAgentStates()).toHaveLength(0);
    });

    it('should allow refreshing extension map', () => {
      manager.refreshExtensionMap([
        { extension: '100', crmUserId: 'user-1', displayName: 'Agent 1' },
      ]);
      expect(manager.getAgentStates()).toHaveLength(1);
      expect(manager.getAgentState('user-1')?.presence).toBe('OFFLINE');
    });
  });

  describe('QueueMemberPause', () => {
    it('should set agent to PAUSED', () => {
      manager.refreshExtensionMap([
        { extension: '100', crmUserId: 'user-1', displayName: 'Agent 1' },
      ]);
      manager.handleAmiEvent({
        event: 'QueueMemberPause',
        interface: 'PJSIP/100',
        paused: '1',
        pausedreason: 'lunch',
      } as any);
      expect(manager.getAgentState('user-1')?.presence).toBe('PAUSED');
      expect(manager.getAgentState('user-1')?.pausedReason).toBe('lunch');
    });

    it('should set agent back to IDLE on unpause', () => {
      manager.refreshExtensionMap([
        { extension: '100', crmUserId: 'user-1', displayName: 'Agent 1' },
      ]);
      manager.handleAmiEvent({
        event: 'QueueMemberPause',
        interface: 'PJSIP/100',
        paused: '1',
      } as any);
      manager.handleAmiEvent({
        event: 'QueueMemberPause',
        interface: 'PJSIP/100',
        paused: '0',
      } as any);
      expect(manager.getAgentState('user-1')?.presence).toBe('IDLE');
    });
  });
});
