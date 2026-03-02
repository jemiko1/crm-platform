import { AmiClientService } from '../ami/ami-client.service';

describe('AmiClientService', () => {
  let service: AmiClientService;

  beforeEach(() => {
    process.env.AMI_ENABLED = 'false';
    service = new AmiClientService();
  });

  afterEach(() => {
    service.disconnect();
    delete process.env.AMI_ENABLED;
  });

  it('should not connect when disabled', () => {
    service.onModuleInit();
    expect(service.connected).toBe(false);
  });

  it('should expose connected state', () => {
    expect(service.connected).toBe(false);
  });

  it('should reject sendAction when not connected', async () => {
    await expect(
      service.sendAction({ Action: 'Ping' }),
    ).rejects.toThrow('AMI not connected');
  });

  it('should disconnect gracefully when not connected', () => {
    expect(() => service.disconnect()).not.toThrow();
  });

  it('should disconnect gracefully on module destroy', () => {
    expect(() => service.onModuleDestroy()).not.toThrow();
  });

  it('should be an EventEmitter', () => {
    expect(typeof service.on).toBe('function');
    expect(typeof service.emit).toBe('function');
  });
});
