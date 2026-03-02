import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface AriConfig {
  baseUrl: string;
  user: string;
  password: string;
  enabled: boolean;
}

@Injectable()
export class AriClientService implements OnModuleInit {
  private readonly logger = new Logger(AriClientService.name);
  private readonly config: AriConfig;

  constructor() {
    this.config = {
      baseUrl: process.env.ARI_BASE_URL ?? 'http://127.0.0.1:8088/ari',
      user: process.env.ARI_USER ?? 'crm',
      password: process.env.ARI_PASSWORD ?? '',
      enabled: process.env.ARI_ENABLED === 'true',
    };
  }

  onModuleInit() {
    if (!this.config.enabled) {
      this.logger.log('ARI is disabled (ARI_ENABLED != true), skipping');
      return;
    }
    this.logger.log(`ARI client ready, base URL: ${this.config.baseUrl}`);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  async originate(params: {
    endpoint: string;
    extension: string;
    context?: string;
    callerId?: string;
    timeout?: number;
  }): Promise<any> {
    return this.request('POST', '/channels', {
      endpoint: params.endpoint,
      extension: params.extension,
      context: params.context ?? 'from-internal',
      callerId: params.callerId,
      timeout: params.timeout ?? 30,
      app: 'crm',
    });
  }

  async hangup(channelId: string, reason?: string): Promise<void> {
    await this.request(
      'DELETE',
      `/channels/${encodeURIComponent(channelId)}`,
      reason ? { reason } : undefined,
    );
  }

  async hold(channelId: string): Promise<void> {
    await this.request(
      'POST',
      `/channels/${encodeURIComponent(channelId)}/hold`,
    );
  }

  async unhold(channelId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/channels/${encodeURIComponent(channelId)}/hold`,
    );
  }

  async redirect(
    channelId: string,
    endpoint: string,
  ): Promise<void> {
    await this.request(
      'POST',
      `/channels/${encodeURIComponent(channelId)}/redirect`,
      { endpoint },
    );
  }

  async getChannels(): Promise<any[]> {
    return this.request('GET', '/channels');
  }

  async getBridges(): Promise<any[]> {
    return this.request('GET', '/bridges');
  }

  async sendQueueAction(
    action: 'QueueAdd' | 'QueueRemove' | 'QueuePause',
    _params: Record<string, string>,
  ): Promise<any> {
    throw new Error(
      `Queue action ${action} requires AMI. Use AmiClientService.sendAction() instead.`,
    );
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<any> {
    if (!this.config.enabled) {
      throw new Error('ARI is not enabled');
    }

    const url = new URL(path, this.config.baseUrl);
    url.searchParams.set('api_key', `${this.config.user}:${this.config.password}`);

    if (method === 'GET' && body) {
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (method !== 'GET' && method !== 'DELETE' && body) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url.toString(), init);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ARI ${method} ${path} failed (${res.status}): ${text}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return null;
  }
}
