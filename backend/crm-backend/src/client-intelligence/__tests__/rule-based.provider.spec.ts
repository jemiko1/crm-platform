import { RuleBasedProvider } from '../providers/rule-based.provider';
import { ClientMetrics } from '../interfaces/intelligence.types';

describe('RuleBasedProvider', () => {
  let provider: RuleBasedProvider;

  beforeEach(() => {
    provider = new RuleBasedProvider();
  });

  function baseMetrics(overrides: Partial<ClientMetrics> = {}): ClientMetrics {
    return {
      clientId: 'client-1',
      clientCoreId: 100,
      periodDays: 180,
      calls: {
        total: 5,
        answered: 4,
        missed: 1,
        avgDurationSeconds: 120,
        totalDurationSeconds: 480,
        lastCallAt: new Date().toISOString(),
      },
      chats: {
        total: 3,
        open: 1,
        closed: 2,
        totalMessages: 20,
        avgMessagesPerConversation: 6.7,
        channels: { WEB: 2, VIBER: 1 },
        lastChatAt: new Date().toISOString(),
      },
      incidents: {
        total: 1,
        open: 0,
        completed: 1,
        critical: 0,
        highPriority: 0,
        types: { PLUMBING: 1 },
        lastIncidentAt: new Date().toISOString(),
      },
      contactFrequency: {
        totalContacts: 9,
        avgContactsPerMonth: 1.5,
        daysSinceLastContact: 5,
      },
      ...overrides,
    };
  }

  describe('computeLabels', () => {
    it('should flag high_contact when avgContactsPerMonth >= 8', () => {
      const m = baseMetrics({
        contactFrequency: { totalContacts: 50, avgContactsPerMonth: 8.3, daysSinceLastContact: 2 },
      });
      expect(provider.computeLabels(m)).toContain('high_contact');
    });

    it('should flag low_contact when avgContactsPerMonth <= 1', () => {
      const m = baseMetrics({
        contactFrequency: { totalContacts: 3, avgContactsPerMonth: 0.5, daysSinceLastContact: 30 },
      });
      expect(provider.computeLabels(m)).toContain('low_contact');
    });

    it('should flag frequent_caller when calls >= 10 and > 2x chats', () => {
      const m = baseMetrics({
        calls: { total: 12, answered: 10, missed: 2, avgDurationSeconds: 60, totalDurationSeconds: 600, lastCallAt: null },
        chats: { total: 2, open: 0, closed: 2, totalMessages: 5, avgMessagesPerConversation: 2.5, channels: {}, lastChatAt: null },
      });
      expect(provider.computeLabels(m)).toContain('frequent_caller');
    });

    it('should flag chat_preferred when chats >= 5 and > calls', () => {
      const m = baseMetrics({
        calls: { total: 2, answered: 2, missed: 0, avgDurationSeconds: 60, totalDurationSeconds: 120, lastCallAt: null },
        chats: { total: 8, open: 1, closed: 7, totalMessages: 40, avgMessagesPerConversation: 5, channels: { WEB: 8 }, lastChatAt: null },
      });
      expect(provider.computeLabels(m)).toContain('chat_preferred');
    });

    it('should flag incident_prone when incidents total >= 5', () => {
      const m = baseMetrics({
        incidents: { total: 6, open: 2, completed: 4, critical: 0, highPriority: 1, types: {}, lastIncidentAt: null },
      });
      expect(provider.computeLabels(m)).toContain('incident_prone');
    });

    it('should flag at_risk when >= 3 open incidents', () => {
      const m = baseMetrics({
        incidents: { total: 5, open: 3, completed: 2, critical: 0, highPriority: 0, types: {}, lastIncidentAt: null },
      });
      expect(provider.computeLabels(m)).toContain('at_risk');
    });

    it('should flag long_calls when avgDuration >= 300s', () => {
      const m = baseMetrics({
        calls: { total: 5, answered: 5, missed: 0, avgDurationSeconds: 350, totalDurationSeconds: 1750, lastCallAt: null },
      });
      expect(provider.computeLabels(m)).toContain('long_calls');
    });

    it('should flag stable for low-incident clients with recent contact', () => {
      const m = baseMetrics({
        incidents: { total: 1, open: 0, completed: 1, critical: 0, highPriority: 0, types: {}, lastIncidentAt: null },
        contactFrequency: { totalContacts: 5, avgContactsPerMonth: 1.5, daysSinceLastContact: 10 },
      });
      expect(provider.computeLabels(m)).toContain('stable');
    });
  });

  describe('computeInsights', () => {
    it('should flag many_open_incidents when open >= 3', () => {
      const m = baseMetrics({
        incidents: { total: 5, open: 4, completed: 1, critical: 0, highPriority: 0, types: {}, lastIncidentAt: null },
      });
      const insights = provider.computeInsights(m);
      expect(insights.find((i) => i.key === 'many_open_incidents')).toBeDefined();
    });

    it('should flag critical_incidents when critical >= 1', () => {
      const m = baseMetrics({
        incidents: { total: 3, open: 1, completed: 2, critical: 2, highPriority: 0, types: {}, lastIncidentAt: null },
      });
      const insights = provider.computeInsights(m);
      const critical = insights.find((i) => i.key === 'critical_incidents');
      expect(critical).toBeDefined();
      expect(critical!.severity).toBe('critical');
    });

    it('should flag high_missed_calls when missed > answered', () => {
      const m = baseMetrics({
        calls: { total: 6, answered: 2, missed: 4, avgDurationSeconds: 60, totalDurationSeconds: 120, lastCallAt: null },
      });
      const insights = provider.computeInsights(m);
      expect(insights.find((i) => i.key === 'high_missed_calls')).toBeDefined();
    });

    it('should flag gone_silent when daysSinceLastContact >= 90 and had prior activity', () => {
      const m = baseMetrics({
        contactFrequency: { totalContacts: 10, avgContactsPerMonth: 2, daysSinceLastContact: 120 },
      });
      const insights = provider.computeInsights(m);
      expect(insights.find((i) => i.key === 'gone_silent')).toBeDefined();
    });

    it('should return empty for nominal client', () => {
      const m = baseMetrics();
      const insights = provider.computeInsights(m);
      expect(insights.length).toBe(0);
    });
  });

  describe('buildSummary', () => {
    it('should return "No recorded activity" when totalContacts is 0', () => {
      const m = baseMetrics({
        contactFrequency: { totalContacts: 0, avgContactsPerMonth: 0, daysSinceLastContact: null },
        calls: { total: 0, answered: 0, missed: 0, avgDurationSeconds: 0, totalDurationSeconds: 0, lastCallAt: null },
        chats: { total: 0, open: 0, closed: 0, totalMessages: 0, avgMessagesPerConversation: 0, channels: {}, lastChatAt: null },
        incidents: { total: 0, open: 0, completed: 0, critical: 0, highPriority: 0, types: {}, lastIncidentAt: null },
      });
      const summary = provider.buildSummary(m, []);
      expect(summary).toContain('No recorded activity');
    });

    it('should include call, chat, and incident counts in summary', () => {
      const m = baseMetrics();
      const labels = provider.computeLabels(m);
      const summary = provider.buildSummary(m, labels);
      expect(summary).toContain('5 call(s)');
      expect(summary).toContain('3 chat conversation(s)');
      expect(summary).toContain('1 incident(s)');
    });

    it('should include at-risk warning when label present', () => {
      const m = baseMetrics();
      const summary = provider.buildSummary(m, ['at_risk']);
      expect(summary).toContain('at-risk');
    });
  });

  describe('generateProfile', () => {
    it('should return a complete IntelligenceProfile', async () => {
      const m = baseMetrics();
      const profile = await provider.generateProfile(m);
      expect(profile.clientId).toBe('client-1');
      expect(profile.clientCoreId).toBe(100);
      expect(profile.provider).toBe('rule-based');
      expect(profile.generatedAt).toBeDefined();
      expect(Array.isArray(profile.labels)).toBe(true);
      expect(typeof profile.summary).toBe('string');
      expect(Array.isArray(profile.insights)).toBe(true);
      expect(profile.metrics).toBe(m);
    });
  });
});
