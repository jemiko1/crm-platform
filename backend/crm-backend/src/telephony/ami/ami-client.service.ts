import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import type { AmiConnectionConfig, AmiManagerInstance, RawAmiEvent } from './ami.types';

const AmiManager = require('asterisk-manager');

const RELEVANT_EVENTS = new Set([
  'newchannel',
  'hangup',
  'dialend',
  'bridgeenter',
  'queuecallerjoin',
  'queuecallerleave',
  'agentconnect',
  'blindtransfer',
  'attendedtransfer',
  'musiconholdstart',
  'musiconholdstop',
  'mixmonitormute',
  'varset',
  'newexten',
  'queuememberstatus',
  'queueparams',
  'queuemember',
  'queuememberpause',
  'queuememberadded',
  'queuememberremoved',
]);

@Injectable()
export class AmiClientService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AmiClientService.name);
  private manager: AmiManagerInstance | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private readonly config: AmiConnectionConfig;

  constructor() {
    super();
    this.config = {
      host: process.env.AMI_HOST ?? '127.0.0.1',
      port: parseInt(process.env.AMI_PORT ?? '5038', 10),
      user: process.env.AMI_USER ?? 'crm',
      secret: process.env.AMI_SECRET ?? '',
      enabled: process.env.AMI_ENABLED === 'true',
      reconnectInterval: parseInt(
        process.env.AMI_RECONNECT_INTERVAL ?? '5000',
        10,
      ),
    };
  }

  get connected(): boolean {
    return this._connected;
  }

  onModuleInit() {
    if (!this.config.enabled) {
      this.logger.log('AMI is disabled (AMI_ENABLED != true), skipping');
      return;
    }
    this.connect();
  }

  onModuleDestroy() {
    this.disconnect();
  }

  connect(): void {
    if (this.manager) {
      this.disconnect();
    }

    this.logger.log(
      `Connecting to AMI at ${this.config.host}:${this.config.port}`,
    );

    this.manager = new AmiManager(
      this.config.port,
      this.config.host,
      this.config.user,
      this.config.secret,
      true,
    ) as AmiManagerInstance;

    this.manager.on('connect', (() => {
      this._connected = true;
      this.logger.log('AMI connected');
      this.emit('ami:connected');
    }) as any);

    this.manager.on('error', ((err: any) => {
      this.logger.error(`AMI error: ${err?.message ?? err}`);
      this._connected = false;
    }) as any);

    this.manager.on('close', (() => {
      this._connected = false;
      this.logger.warn('AMI connection closed');
      this.emit('ami:disconnected');
      this.scheduleReconnect();
    }) as any);

    this.manager.on('managerevent', ((evt: RawAmiEvent) => {
      const eventName = (evt.event ?? '').toLowerCase();
      if (RELEVANT_EVENTS.has(eventName)) {
        this.emit('ami:event', evt);
      }
    }) as any);

    this.manager.keepConnected();
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.manager) {
      try {
        this.manager.disconnect();
      } catch {
        /* ignore */
      }
      this.manager = null;
    }
    this._connected = false;
  }

  sendAction(action: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.manager || !this._connected) {
        return reject(new Error('AMI not connected'));
      }
      this.manager.action(action, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.config.enabled) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.logger.log('Attempting AMI reconnect...');
      this.connect();
    }, this.config.reconnectInterval);
  }
}
