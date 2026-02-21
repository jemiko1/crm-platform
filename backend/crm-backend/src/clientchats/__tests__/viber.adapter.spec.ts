import { ViberAdapter } from '../adapters/viber.adapter';
import * as crypto from 'crypto';

describe('ViberAdapter', () => {
  let adapter: ViberAdapter;
  const VIBER_TOKEN = 'test-viber-token-12345';

  beforeEach(() => {
    process.env.VIBER_BOT_TOKEN = VIBER_TOKEN;
    adapter = new ViberAdapter();
  });

  afterEach(() => {
    delete process.env.VIBER_BOT_TOKEN;
  });

  it('should have channelType VIBER', () => {
    expect(adapter.channelType).toBe('VIBER');
  });

  describe('verifyWebhook', () => {
    it('should validate correct HMAC signature', () => {
      const body = JSON.stringify({ event: 'message', sender: { id: '123' } });
      const sig = crypto
        .createHmac('sha256', VIBER_TOKEN)
        .update(body)
        .digest('hex');

      const req = {
        headers: { 'x-viber-content-signature': sig },
        body: JSON.parse(body),
      };

      expect(adapter.verifyWebhook(req as any)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const req = {
        headers: { 'x-viber-content-signature': 'bad-sig' },
        body: { event: 'message' },
      };

      expect(adapter.verifyWebhook(req as any)).toBe(false);
    });

    it('should return false when no signature header', () => {
      const req = { headers: {}, body: {} };
      expect(adapter.verifyWebhook(req as any)).toBe(false);
    });

    it('should return false when VIBER_BOT_TOKEN is not set', () => {
      delete process.env.VIBER_BOT_TOKEN;
      const req = {
        headers: { 'x-viber-content-signature': 'anything' },
        body: {},
      };
      expect(adapter.verifyWebhook(req as any)).toBe(false);
    });
  });

  describe('parseInbound', () => {
    it('should parse a valid message event', () => {
      const body = {
        event: 'message',
        sender: { id: 'viber-user-1', name: 'Bob' },
        message: { text: 'Hello from Viber', type: 'text' },
        message_token: 12345678,
      };

      const result = adapter.parseInbound(body);

      expect(result).not.toBeNull();
      expect(result!.externalConversationId).toBe('viber_viber-user-1');
      expect(result!.externalUserId).toBe('viber-user-1');
      expect(result!.externalMessageId).toBe('12345678');
      expect(result!.displayName).toBe('Bob');
      expect(result!.text).toBe('Hello from Viber');
    });

    it('should return null for non-message events', () => {
      const result = adapter.parseInbound({ event: 'delivered' });
      expect(result).toBeNull();
    });

    it('should return null when sender is missing', () => {
      const result = adapter.parseInbound({
        event: 'message',
        message: { text: 'hi' },
        message_token: 1,
      });
      expect(result).toBeNull();
    });
  });
});
