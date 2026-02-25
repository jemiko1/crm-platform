import { WebChatAdapter } from '../adapters/web-chat.adapter';

describe('WebChatAdapter', () => {
  let adapter: WebChatAdapter;

  beforeEach(() => {
    adapter = new WebChatAdapter();
  });

  it('should have channelType WEB', () => {
    expect(adapter.channelType).toBe('WEB');
  });

  describe('parseInbound', () => {
    it('should parse a valid web chat message', () => {
      const result = adapter.parseInbound({
        visitorId: 'v123',
        text: 'Hello world',
        name: 'Alice',
        phone: '+1234567890',
        email: 'alice@test.com',
      });

      expect(result).not.toBeNull();
      expect(result!.externalConversationId).toBe('web_v123');
      expect(result!.externalUserId).toBe('v123');
      expect(result!.displayName).toBe('Alice');
      expect(result!.phone).toBe('+1234567890');
      expect(result!.email).toBe('alice@test.com');
      expect(result!.text).toBe('Hello world');
    });

    it('should return null when visitorId is missing', () => {
      const result = adapter.parseInbound({ text: 'Hello' });
      expect(result).toBeNull();
    });

    it('should return null when text is missing', () => {
      const result = adapter.parseInbound({ visitorId: 'v123' });
      expect(result).toBeNull();
    });

    it('should use provided messageId as externalMessageId', () => {
      const result = adapter.parseInbound({
        visitorId: 'v123',
        text: 'Hi',
        messageId: 'custom-id',
      });

      expect(result!.externalMessageId).toBe('custom-id');
    });

    it('should generate fallback externalMessageId when not provided', () => {
      const result = adapter.parseInbound({
        visitorId: 'v123',
        text: 'Hi',
      });

      expect(result!.externalMessageId).toMatch(/^web_v123_/);
    });
  });

  describe('sendMessage', () => {
    it('should return a success result with generated id', async () => {
      const result = await adapter.sendMessage('web_v123', 'Reply', {});

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toMatch(/^web_out_/);
    });
  });

  describe('verifyWebhook', () => {
    it('should always return true (no webhook for web)', () => {
      expect(adapter.verifyWebhook({} as any)).toBe(true);
    });
  });
});
