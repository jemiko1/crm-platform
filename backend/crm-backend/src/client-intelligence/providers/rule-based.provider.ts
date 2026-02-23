import { Injectable } from '@nestjs/common';
import { IntelligenceProvider } from '../interfaces/intelligence-provider.interface';
import {
  ClientLabel,
  ClientMetrics,
  IntelligenceInsight,
  IntelligenceProfile,
} from '../interfaces/intelligence.types';

@Injectable()
export class RuleBasedProvider implements IntelligenceProvider {
  readonly name = 'rule-based';

  async generateProfile(metrics: ClientMetrics): Promise<IntelligenceProfile> {
    const labels = this.computeLabels(metrics);
    const insights = this.computeInsights(metrics);
    const summary = this.buildSummary(metrics, labels);

    return {
      clientId: metrics.clientId,
      clientCoreId: metrics.clientCoreId,
      generatedAt: new Date().toISOString(),
      provider: this.name,
      labels,
      summary,
      insights,
      metrics,
    };
  }

  computeLabels(m: ClientMetrics): ClientLabel[] {
    const labels: ClientLabel[] = [];
    const { contactFrequency, calls, chats, incidents } = m;

    if (contactFrequency.avgContactsPerMonth >= 8) {
      labels.push('high_contact');
    } else if (contactFrequency.avgContactsPerMonth <= 1) {
      labels.push('low_contact');
    }

    if (calls.total >= 10 && calls.total > chats.total * 2) {
      labels.push('frequent_caller');
    }

    if (chats.total >= 5 && chats.total > calls.total) {
      labels.push('chat_preferred');
    }

    if (incidents.total >= 5) {
      labels.push('incident_prone');
    }

    if (incidents.critical >= 2 || incidents.highPriority >= 4) {
      labels.push('high_priority_issues');
    }

    if (calls.avgDurationSeconds >= 300) {
      labels.push('long_calls');
    }

    if (
      contactFrequency.avgContactsPerMonth >= 6 &&
      incidents.total === 0 &&
      calls.answered >= 5
    ) {
      labels.push('vip_potential');
    }

    if (
      incidents.open >= 3 ||
      (incidents.critical >= 1 && contactFrequency.avgContactsPerMonth >= 10)
    ) {
      labels.push('at_risk');
    }

    if (
      labels.length === 0 ||
      (!labels.includes('at_risk') &&
        !labels.includes('incident_prone') &&
        !labels.includes('high_priority_issues'))
    ) {
      if (
        incidents.total <= 2 &&
        contactFrequency.daysSinceLastContact !== null &&
        contactFrequency.daysSinceLastContact <= 60
      ) {
        labels.push('stable');
      }
    }

    return labels;
  }

  computeInsights(m: ClientMetrics): IntelligenceInsight[] {
    const insights: IntelligenceInsight[] = [];

    if (m.incidents.open >= 3) {
      insights.push({
        key: 'many_open_incidents',
        title: 'Multiple open incidents',
        description: `Client has ${m.incidents.open} open incidents. Consider prioritizing resolution.`,
        severity: 'warning',
      });
    }

    if (m.incidents.critical >= 1) {
      insights.push({
        key: 'critical_incidents',
        title: 'Critical incidents reported',
        description: `${m.incidents.critical} critical incident(s) in the last ${m.periodDays} days.`,
        severity: 'critical',
      });
    }

    if (m.calls.missed > m.calls.answered && m.calls.total >= 3) {
      insights.push({
        key: 'high_missed_calls',
        title: 'High missed call rate',
        description: `${m.calls.missed} of ${m.calls.total} calls were missed. Client may be frustrated.`,
        severity: 'warning',
      });
    }

    if (m.calls.avgDurationSeconds >= 600) {
      insights.push({
        key: 'very_long_calls',
        title: 'Exceptionally long calls',
        description: `Average call duration is ${Math.round(m.calls.avgDurationSeconds / 60)} minutes. May indicate complex issues.`,
        severity: 'info',
      });
    }

    if (
      m.contactFrequency.daysSinceLastContact !== null &&
      m.contactFrequency.daysSinceLastContact >= 90 &&
      m.contactFrequency.totalContacts >= 5
    ) {
      insights.push({
        key: 'gone_silent',
        title: 'Client has gone silent',
        description: `No contact in ${m.contactFrequency.daysSinceLastContact} days despite previous activity. May need outreach.`,
        severity: 'warning',
      });
    }

    if (m.chats.open >= 3) {
      insights.push({
        key: 'many_open_chats',
        title: 'Multiple unresolved chats',
        description: `${m.chats.open} chat conversations are still open.`,
        severity: 'info',
      });
    }

    if (m.contactFrequency.avgContactsPerMonth >= 12) {
      insights.push({
        key: 'very_high_frequency',
        title: 'Very high contact frequency',
        description: `Client averages ${m.contactFrequency.avgContactsPerMonth} contacts/month. Consider dedicated support.`,
        severity: 'info',
      });
    }

    return insights;
  }

  buildSummary(m: ClientMetrics, labels: ClientLabel[]): string {
    const parts: string[] = [];

    const totalContacts = m.contactFrequency.totalContacts;
    if (totalContacts === 0) {
      return `No recorded activity in the last ${m.periodDays} days.`;
    }

    parts.push(
      `${totalContacts} total contact(s) over the last ${m.periodDays} days`,
    );

    if (m.calls.total > 0) {
      parts.push(
        `${m.calls.total} call(s) (${m.calls.answered} answered, avg ${Math.round(m.calls.avgDurationSeconds)}s)`,
      );
    }
    if (m.chats.total > 0) {
      parts.push(`${m.chats.total} chat conversation(s)`);
    }
    if (m.incidents.total > 0) {
      parts.push(
        `${m.incidents.total} incident(s) (${m.incidents.open} open)`,
      );
    }

    if (labels.includes('at_risk')) {
      parts.push('⚠ Flagged as at-risk due to open critical incidents and high contact volume');
    } else if (labels.includes('vip_potential')) {
      parts.push('Potential VIP — frequent engaged contact with no incident history');
    } else if (labels.includes('stable')) {
      parts.push('Client relationship appears stable');
    }

    return parts.join('. ') + '.';
  }
}
