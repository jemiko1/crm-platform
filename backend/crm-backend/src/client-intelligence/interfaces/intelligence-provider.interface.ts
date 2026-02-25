import { ClientMetrics, IntelligenceProfile } from './intelligence.types';

export const INTELLIGENCE_PROVIDER = Symbol('INTELLIGENCE_PROVIDER');

export interface IntelligenceProvider {
  readonly name: string;
  generateProfile(metrics: ClientMetrics): Promise<IntelligenceProfile>;
}
