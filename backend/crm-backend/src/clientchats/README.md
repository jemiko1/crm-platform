# Client Chats Backend Module

Multi-channel messaging inbox for CRM. Handles inbound/outbound messages across WhatsApp, Telegram, Viber, Facebook Messenger, and web chat.

## Quick Reference

### Inbound Message Flow

```
Webhook (public endpoint)
  → Signature guard verifies authenticity
  → Channel adapter parses raw payload into ParsedInboundMessage
  → ClientChatsCoreService.processInbound()
    1. Dedup by externalMessageId (skip if already exists)
    2. Upsert participant (with "best name wins" guard)
    3. Upsert conversation (store participantId, archive closed → new chain)
    4. Save message to DB
    5. Auto-match participant to CRM client by phone/email
    6. Emit WebSocket events (conversation:new/updated + message:new)
```

### Outbound Reply Flow

```
Agent clicks Send in UI
  → POST /v1/clientchats/conversations/:id/reply
  → ClientChatsCoreService.sendReply()
    1. Load conversation + channel account
    2. Channel adapter sends message via external API
    3. Save outbound message to DB
    4. Update firstResponseAt if first reply
    5. Emit message:new via WebSocket
```

### Queue System

The queue determines which operators see new conversations:

- **Weekly Schedule**: Managers define operators per day of week
- **Daily Override**: Managers can add/remove operators for today without changing the schedule
- **Join Model**: Operators in today's queue see unassigned conversations. They click "Join Conversation" to claim one (optimistic locking prevents race conditions).
- **Managers always see everything** regardless of queue membership.

### Services

| Service | Responsibility |
|---------|---------------|
| `clientchats-core.service.ts` | Core logic: inbound processing, replies, conversations, messages |
| `clientchats-matching.service.ts` | Auto-match participants to CRM clients |
| `clientchats-event.service.ts` | WebSocket event emission to correct rooms |
| `assignment.service.ts` | Queue membership checks, join conversation |
| `queue-schedule.service.ts` | Weekly schedule + daily override CRUD |
| `escalation.service.ts` | SLA monitoring, auto-escalation (cron) |
| `clientchats-analytics.service.ts` | Statistics: pickup time, resolution time, per-agent metrics |
| `canned-responses.service.ts` | Quick reply template CRUD |
| `clientchats-observability.service.ts` | Module health status, webhook failure logging |

### Controllers

| Controller | Base Path | Auth | Purpose |
|-----------|-----------|------|---------|
| `clientchats-public.controller.ts` | `public/clientchats` | None (webhook guards) | Webhooks + web chat |
| `clientchats-agent.controller.ts` | `v1/clientchats` | JWT + `client_chats.menu` | Operator inbox operations |
| `clientchats-admin.controller.ts` | `v1/clientchats` | JWT + `client_chats_config.access` | Channel config, analytics |
| `clientchats-manager.controller.ts` | `v1/clientchats/queue` | JWT + `client_chats.manage` | Queue, escalation, manager actions |

### Channel Adapters

Each implements `ChannelAdapter` interface from `interfaces/channel-adapter.interface.ts`:

| Adapter | Webhook Verification | Outbound Support |
|---------|---------------------|-----------------|
| WhatsApp | HMAC-SHA256 | Text + media (image, video, audio, document) |
| Telegram | Secret token header | Text + media (photo, document) |
| Viber | HMAC-SHA256 | Text only |
| Facebook | HMAC-SHA256 | Text only |
| WebChat | Always valid | No outbound push (polling) |

### WebSocket Rooms

| Room | Members | Events |
|------|---------|--------|
| `managers` | Users with `client_chats.manage` | All conversation/message events |
| `queue` | Operators in today's queue | Unassigned conversation events |
| `agent:{userId}` | Specific operator | Their assigned conversation events |
| `agents` | All authenticated agents | (reserved for broadcast) |

### Database Models

See `prisma/schema.prisma` for full definitions. Key models:

- `ClientChatConversation` — Thread with customer (has `participantId`, `assignedUserId`, `previousConversationId`)
- `ClientChatParticipant` — Customer identity (unique by `externalUserId`)
- `ClientChatMessage` — Individual message (direction IN/OUT)
- `ClientChatChannelAccount` — Channel configuration
- `ClientChatQueueSchedule` / `ClientChatQueueOverride` — Queue management

### Running Tests

```bash
cd backend/crm-backend
npx jest --passWithNoTests
```

### Adding a New Channel

1. Create adapter in `adapters/` implementing `ChannelAdapter`
2. Add enum value to `ClientChatChannelType` in schema (non-transactional migration!)
3. Register adapter in `AdapterRegistryService`
4. Add webhook guard in `guards/webhook-signature.guard.ts`
5. Add webhook endpoint in `clientchats-public.controller.ts`
6. Add webhook management service if needed
7. Update frontend `ChannelType` in `types.ts` and `ChannelBadge` component
