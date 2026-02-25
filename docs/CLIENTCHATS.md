# Client Chats — Unified Inbox Module

## Architecture Overview

Client Chats is an adapter-based unified inbox for handling inbound/outbound conversations with external customers across multiple channels. It is a separate system from the internal Messenger module (employee-to-employee chat).

### Supported Channels

| Channel  | Adapter              | Status |
|----------|----------------------|--------|
| Web      | `WebChatAdapter`     | Full   |
| Viber    | `ViberAdapter`       | Full   |
| Facebook | `FacebookAdapter`    | Full   |
| Telegram | —                    | Planned |
| WhatsApp | —                    | Planned |

### Module Structure

```
backend/crm-backend/src/clientchats/
  clientchats.module.ts
  interfaces/
    channel-adapter.interface.ts      # ChannelAdapter + ParsedInboundMessage
  adapters/
    web-chat.adapter.ts
    viber.adapter.ts
    facebook.adapter.ts
    adapter-registry.service.ts       # Maps channelType -> adapter
  services/
    clientchats-core.service.ts       # Inbound pipeline, replies, CRUD
    clientchats-matching.service.ts   # Auto-match to CRM clients
    clientchats-observability.service.ts
  controllers/
    clientchats-public.controller.ts  # Widget + webhook endpoints (no auth)
    clientchats-agent.controller.ts   # Agent inbox (JWT auth)
    clientchats-admin.controller.ts   # Observability (JWT auth)
  guards/
    conversation-token.guard.ts       # JWT token for widget sessions
    webhook-signature.guard.ts        # Viber/Facebook signature guards
  dto/
    *.dto.ts
```

### Data Flow

```
External Channel
  -> Public Controller (webhook/POST)
  -> Adapter.verifyWebhook() + parseInbound()
  -> CoreService.processInbound()
      -> upsertParticipant()
      -> upsertConversation()
      -> saveMessage() (idempotent by externalMessageId)
      -> MatchingService.autoMatch()

Agent Reply
  -> Agent Controller (/reply)
  -> CoreService.sendReply()
      -> AdapterRegistry.getOrThrow()
      -> Adapter.sendMessage() (Viber API / Facebook Graph API / noop for Web)
      -> saveMessage() (direction: OUT)
```

---

## Database Models

| Model                       | Purpose                                   |
|-----------------------------|-------------------------------------------|
| `ClientChatChannelAccount`  | Registered channel configuration          |
| `ClientChatConversation`    | One conversation per visitor per channel  |
| `ClientChatParticipant`     | External user (visitor, Viber user, etc.) |
| `ClientChatMessage`         | Every inbound/outbound message            |
| `ClientChatWebhookFailure`  | Failed webhook processing log             |

---

## API Endpoints

### Public (No Authentication)

| Method | Route                                | Purpose                     |
|--------|--------------------------------------|-----------------------------|
| POST   | `/public/clientchats/start`          | Start web chat session      |
| POST   | `/public/clientchats/message`        | Send web chat message       |
| POST   | `/public/clientchats/webhook/viber`  | Viber inbound webhook       |
| GET    | `/public/clientchats/webhook/facebook` | Facebook verify endpoint  |
| POST   | `/public/clientchats/webhook/facebook` | Facebook inbound webhook  |

### Agent (JWT Required)

| Method | Route                                          | Purpose                |
|--------|-------------------------------------------------|------------------------|
| GET    | `/v1/clientchats/conversations`                | List conversations     |
| GET    | `/v1/clientchats/conversations/:id`            | Get conversation       |
| GET    | `/v1/clientchats/conversations/:id/messages`   | Get messages           |
| POST   | `/v1/clientchats/conversations/:id/reply`      | Send reply             |
| PATCH  | `/v1/clientchats/conversations/:id/assign`     | Assign agent           |
| PATCH  | `/v1/clientchats/conversations/:id/status`     | Change status          |
| POST   | `/v1/clientchats/conversations/:id/link-client`  | Link CRM client      |
| POST   | `/v1/clientchats/conversations/:id/unlink-client` | Unlink CRM client   |

### Observability (JWT Required)

| Method | Route                              | Purpose           |
|--------|------------------------------------|--------------------|
| GET    | `/v1/clientchats/status`           | Module health      |
| GET    | `/v1/clientchats/webhook-failures` | Recent failures    |

---

## Channel Configuration

### Web Chat Widget

No external configuration needed. The widget communicates via the public REST endpoints.

**Embed Snippet:**

```html
<script>
(function() {
  var API = 'https://your-crm-domain.com';
  var visitorId = localStorage.getItem('cc_visitor') || crypto.randomUUID();
  localStorage.setItem('cc_visitor', visitorId);

  // Start chat session
  fetch(API + '/public/clientchats/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: visitorId })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    window.__CC_TOKEN = data.token;
    window.__CC_CONV = data.conversationId;
  });

  // Send message helper
  window.ccSendMessage = function(text) {
    return fetch(API + '/public/clientchats/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Conversation-Token': window.__CC_TOKEN
      },
      body: JSON.stringify({ text: text })
    }).then(function(r) { return r.json(); });
  };
})();
</script>
```

### Viber Bot

1. Create a Viber Bot account at https://partners.viber.com/
2. Get the bot authentication token
3. Set `VIBER_BOT_TOKEN` in your `.env`
4. Register the webhook URL with Viber:

```bash
curl -X POST https://chatapi.viber.com/pa/set_webhook \
  -H "X-Viber-Auth-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-crm-domain.com/public/clientchats/webhook/viber"}'
```

### Facebook Page Messenger

1. Create a Facebook App at https://developers.facebook.com/
2. Add the Messenger product to the app
3. Generate a Page Access Token
4. Set environment variables:
   - `FB_PAGE_ACCESS_TOKEN` — Page access token
   - `FB_APP_SECRET` — App secret (for signature verification)
   - `FB_VERIFY_TOKEN` — Custom string for webhook verification
5. Configure the webhook in the Facebook Developer Console:
   - Callback URL: `https://your-crm-domain.com/public/clientchats/webhook/facebook`
   - Verify Token: same as `FB_VERIFY_TOKEN`
   - Subscribe to: `messages`

---

## Adding a New Channel

To add a new channel (e.g., Telegram):

1. Create `src/clientchats/adapters/telegram.adapter.ts` implementing `ChannelAdapter`
2. Add the new channel type to `ClientChatChannelType` enum in `schema.prisma`
3. Register the adapter in `AdapterRegistryService` constructor
4. Add the webhook endpoint in `ClientChatsPublicController`
5. Add a webhook guard if the channel requires signature verification
6. Run `npx prisma migrate dev --name add_telegram_channel`

---

## Client Matching

The matching service auto-links conversations to CRM clients:

- **Web chat**: Matches by phone or email if provided in the `/start` payload
- **Viber/Facebook**: Matches by phone if the platform provides it
- **Manual**: Use `POST /v1/clientchats/conversations/:id/link-client`

---

## Local Testing

### Webhook Testing with ngrok

For Viber and Facebook webhooks during local development:

```bash
ngrok http 3000
```

Then use the ngrok URL as the webhook base:
- Viber: `https://XXXX.ngrok.io/public/clientchats/webhook/viber`
- Facebook: `https://XXXX.ngrok.io/public/clientchats/webhook/facebook`

### Running Tests

```bash
cd backend/crm-backend
pnpm test:unit -- --testPathPatterns="clientchats"
```

### Environment Variables

Copy from `.env.example` and fill in:

```env
VIBER_BOT_TOKEN="your-viber-token"
FB_PAGE_ACCESS_TOKEN="your-fb-token"
FB_APP_SECRET="your-fb-secret"
FB_VERIFY_TOKEN="your-verify-token"
```
