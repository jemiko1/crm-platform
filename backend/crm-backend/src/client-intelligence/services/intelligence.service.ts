import { Inject, Injectable } from '@nestjs/common';
import { INTELLIGENCE_PROVIDER } from '../interfaces/intelligence-provider.interface';
import type { IntelligenceProvider } from '../interfaces/intelligence-provider.interface';
import type { IntelligenceProfile } from '../interfaces/intelligence.types';
import { ClientMetricsService } from './client-metrics.service';

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly metricsService: ClientMetricsService,
    @Inject(INTELLIGENCE_PROVIDER)
    private readonly provider: IntelligenceProvider,
  ) {}

  async getProfile(
    clientCoreId: number,
    periodDays?: number,
  ): Promise<IntelligenceProfile> {
    const metrics = await this.metricsService.computeMetrics(
      clientCoreId,
      periodDays,
    );
    return this.provider.generateProfile(metrics);
  }
}
