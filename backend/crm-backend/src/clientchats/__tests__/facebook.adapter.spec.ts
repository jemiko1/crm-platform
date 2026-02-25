import { FacebookAdapter } from '../adapters/facebook.adapter';
import * as crypto from 'crypto';

describe('FacebookAdapter', () => {
  let adapter: FacebookAdapter;
  const APP_SECRET = 'test-fb-secret';
  const VERIFY_TOKEN = 'test-fb-verify';
  const PAGE_TOKEN = 'test-fb-page-token';

  beforeEach(() => {
    process.env.FB_APP_SECRET = APP_SECRET;
    process.env.FB_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.FB_PAGE_ACCESS_TOKEN = PAGE_TOKEN;
    adapter = new FacebookAdapter();
  });

  afterEach(() => {
    delete process.env.FB_APP_SECRET;
    delete process.env.FB_VERIFY_TOKEN;
    delete process.env.FB_PAGE_ACCESS_TOKEN;
  });

  it('should have channelType FACEBOOK', () => {
    expect(adapter.channelType).toBe('FACEBOOK');
  });

  describe('verifyWebhook (GET - subscription)', () => {
    it('should verify valid subscription request', () => {
      const req = {
        method: 'GET',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '12345',
        },
        headers: {},
      };

      expect(adapter.verifyWebhook(req as any)).toBe(true);
    });

    it('should reject wrong verify token', () => {
      const req = {
        method: 'GET',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
        },
        headers: {},
      };

      expect(adapter.verifyWebhook(req as any)).toBe(false);
    });
  });

  describe('verifyWebhook (POST - signature)', () => {
    it('should verify valid X-Hub-Signature-256', () => {
      const body = JSON.stringify({ object: 'page', entry: [] });
      const sig =
        'sha256=' +
        crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');

      const req = {
        method: 'POST',
        headers: { 'x-hub-signature-256': sig },
        body: JSON.parse(body),
        query: {},
      };

      expect(adapter.verifyWebhook(req as any)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const req = {
        method: 'POST',
        headers: { 'x-hub-signature-256': 'sha256=invalid' },
        body: { object: 'page' },
        query: {},
      };

      expect(adapter.verifyWebhook(req as any)).toBe(false);
    });
  });

  describe('parseInbound', () => {
    it('should parse a valid Facebook message', () => {
      const body = {
        object: 'page',
        entry: [
          {
            messaging: [
              {
                sender: { id: 'fb-user-1' },
                message: { mid: 'm.12345', text: 'Hello from FB' },
              },
            ],
          },
        ],
      };

      const result = adapter.parseInbound(body);

      expect(result).not.toBeNull();
      expect(result!.externalConversationId).toBe('fb_fb-user-1');
      expect(result!.externalUserId).toBe('fb-user-1');
      expect(result!.externalMessageId).toBe('m.12345');
      expect(result!.text).toBe('Hello from FB');
    });

    it('should return null when entry is empty', () => {
      const result = adapter.parseInbound({ object: 'page', entry: [] });
      expect(result).toBeNull();
    });

    it('should return null when messaging is empty', () => {
      const result = adapter.parseInbound({
        object: 'page',
        entry: [{ messaging: [] }],
      });
      expect(result).toBeNull();
    });

    it('should return null when sender is missing', () => {
      const result = adapter.parseInbound({
        object: 'page',
        entry: [{ messaging: [{ message: { text: 'hi' } }] }],
      });
      expect(result).toBeNull();
    });
  });

  describe('getVerificationChallenge', () => {
    it('should return challenge from query', () => {
      const req = { query: { 'hub.challenge': 'test-challenge' } };
      expect(adapter.getVerificationChallenge(req as any)).toBe('test-challenge');
    });

    it('should return null when no challenge', () => {
      const req = { query: {} };
      expect(adapter.getVerificationChallenge(req as any)).toBeNull();
    });
  });
});
