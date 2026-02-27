import { TelegramAdapter } from '../adapters/telegram.adapter';

describe('TelegramAdapter', () => {
  let adapter: TelegramAdapter;
  const TELEGRAM_TOKEN = 'test-telegram-token-12345:ABCdef';

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TELEGRAM_TOKEN;
    adapter = new TelegramAdapter();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it('should have channelType TELEGRAM', () => {
    expect(adapter.channelType).toBe('TELEGRAM');
  });

  describe('verifyWebhook', () => {
    it('should return true when token is configured', () => {
      const req = { headers: {}, body: {} };
      expect(adapter.verifyWebhook(req as any)).toBe(true);
    });

    it('should return false when TELEGRAM_BOT_TOKEN is not set', () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      const req = { headers: {}, body: {} };
      expect(adapter.verifyWebhook(req as any)).toBe(false);
    });

    it('should validate secret token when TELEGRAM_WEBHOOK_SECRET is set', () => {
      process.env.TELEGRAM_WEBHOOK_SECRET = 'my-secret';
      const req = {
        headers: { 'x-telegram-bot-api-secret-token': 'my-secret' },
        body: {},
      };
      expect(adapter.verifyWebhook(req as any)).toBe(true);
    });

    it('should reject when secret token does not match', () => {
      process.env.TELEGRAM_WEBHOOK_SECRET = 'my-secret';
      const req = {
        headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
        body: {},
      };
      expect(adapter.verifyWebhook(req as any)).toBe(false);
    });
  });

  describe('parseInbound', () => {
    it('should parse a valid message', () => {
      const body = {
        update_id: 123,
        message: {
          message_id: 456,
          from: {
            id: 789,
            first_name: 'Alice',
            last_name: 'Smith',
            username: 'alice_s',
          },
          chat: { id: 789, type: 'private' },
          text: 'Hello from Telegram',
        },
      };

      const result = adapter.parseInbound(body);

      expect(result).not.toBeNull();
      expect(result!.externalConversationId).toBe('tg_789');
      expect(result!.externalUserId).toBe('789');
      expect(result!.externalMessageId).toBe('456');
      expect(result!.displayName).toBe('Alice Smith');
      expect(result!.text).toBe('Hello from Telegram');
    });

    it('should parse edited_message', () => {
      const body = {
        update_id: 124,
        edited_message: {
          message_id: 457,
          from: { id: 999, first_name: 'Bob' },
          chat: { id: 999 },
          text: 'Edited text',
        },
      };

      const result = adapter.parseInbound(body);

      expect(result).not.toBeNull();
      expect(result!.externalConversationId).toBe('tg_999');
      expect(result!.externalUserId).toBe('999');
      expect(result!.displayName).toBe('Bob');
      expect(result!.text).toBe('Edited text');
    });

    it('should return null when no message or edited_message', () => {
      const result = adapter.parseInbound({ update_id: 1 });
      expect(result).toBeNull();
    });

    it('should return null when from or chat is missing', () => {
      const result = adapter.parseInbound({
        update_id: 1,
        message: { message_id: 1, text: 'hi' },
      });
      expect(result).toBeNull();
    });
  });
});
