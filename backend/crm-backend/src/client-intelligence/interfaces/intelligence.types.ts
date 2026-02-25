export type ActivityType = 'call' | 'chat' | 'incident';

export interface TimelineEntry {
  id: string;
  type: ActivityType;
  timestamp: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface ClientMetrics {
  clientId: string;
  clientCoreId: number;
  periodDays: number;

  calls: {
    total: number;
    answered: number;
    missed: number;
    avgDurationSeconds: number;
    totalDurationSeconds: number;
    lastCallAt: string | null;
  };

  chats: {
    total: number;
    open: number;
    closed: number;
    totalMessages: number;
    avgMessagesPerConversation: number;
    channels: Record<string, number>;
    lastChatAt: string | null;
  };

  incidents: {
    total: number;
    open: number;
    completed: number;
    critical: number;
    highPriority: number;
    types: Record<string, number>;
    lastIncidentAt: string | null;
  };

  contactFrequency: {
    totalContacts: number;
    avgContactsPerMonth: number;
    daysSinceLastContact: number | null;
  };
}

export type ClientLabel =
  | 'high_contact'
  | 'low_contact'
  | 'frequent_caller'
  | 'chat_preferred'
  | 'incident_prone'
  | 'high_priority_issues'
  | 'long_calls'
  | 'vip_potential'
  | 'at_risk'
  | 'stable';

export interface IntelligenceProfile {
  clientId: string;
  clientCoreId: number;
  generatedAt: string;
  provider: string;
  labels: ClientLabel[];
  summary: string;
  insights: IntelligenceInsight[];
  metrics: ClientMetrics;
}

export interface IntelligenceInsight {
  key: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}
