# Client Chats Frontend Module

Multi-channel messaging inbox UI for CRM operators and managers.

## Pages

| Route | File | Permission | Purpose |
|-------|------|-----------|---------|
| `/app/client-chats` | `page.tsx` | `client_chats.menu` | Main inbox (operators) + Manager Dashboard toggle |
| `/app/client-chats/analytics` | `analytics/page.tsx` | `client_chats_config.access` | Standalone analytics page |
| `/app/admin/client-chats-config` | `admin/client-chats-config/page.tsx` | `client_chats_config.access` | Channel config, canned responses, webhook logs |

## Component Hierarchy

```
page.tsx
├── Notification Banner (if permission not granted)
├── View Toggle: Inbox | Manager Dashboard
│
├── [Inbox View]
│   ├── InboxSidebar
│   │   ├── FilterBar (search, channel multi-select, assigned-to)
│   │   ├── Live/Closed tabs
│   │   └── Conversation list items (with unread badges, channel badges)
│   └── ConversationPanel (or EmptyState)
│       ├── ConversationHeader (name, actions)
│       ├── Message list (MessageBubble components)
│       ├── "Load Previous Conversation" button
│       ├── "Join Conversation" button (for unassigned, non-manager)
│       └── ReplyBox (text input, file attach, canned responses)
│
└── [Manager Dashboard View]
    └── ManagerDashboard
        ├── Tab: Chat Analytics (KPI cards, charts)
        ├── Tab: Active Operators (online/offline status)
        ├── Tab: Live Dashboard (real-time metrics)
        └── Tab: Queue & Schedule
            └── ManagerQueuePanel (today's queue, weekly schedule, escalation config)
```

## Hooks

### `useClientChatSocket`
WebSocket connection to `/ws/clientchats` via Socket.IO. Returns `{ on, off, isConnected }`.

Used by InboxSidebar and ConversationPanel to receive real-time events:
- `conversation:new` — New conversation arrived
- `conversation:updated` — Conversation assignment/status changed
- `message:new` — New message in a conversation
- `operator:paused` / `operator:unpaused` — Manager paused/unpaused operator

### `useNotifications`
Browser notification permission and sound playback. Returns `{ notify, permission, soundEnabled, showBanner, ... }`.

Key behavior:
- `unlockAudio()` called before every `play()` (browser autoplay policy workaround)
- Interaction listeners stay persistent (re-unlock on every click/keydown)
- Sound plays regardless of tab visibility; browser notification only when tab is hidden

## Display Name Resolution

**CRITICAL**: Never show raw channel IDs to users. The fallback chain is:

```
CRM Client name (firstName + lastName)
  → conversation.participant.displayName
    → "Unknown Customer"
```

The `conversation.participant` field is populated from the `participantId` FK on the conversation model, which is set when the conversation is created. This ensures the customer name is always available regardless of which message was last.

## API Integration

All HTTP calls use `@/lib/api` helpers (`apiGet`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`).

File uploads use `fetch` with `FormData` and the auth token from cookies.

## Types

All shared types are in `types.ts`:
- `ConversationSummary` — Used in sidebar list
- `ConversationDetail` — Used in conversation panel
- `ChatMessage` — Individual message
- `ConversationParticipant` — Customer identity on conversation
- `AgentOption` — Agent for filter dropdowns

## State Management

No global state store. Each component manages its own state via `useState`/`useEffect`. Real-time updates come through WebSocket events handled in `useEffect` hooks.

The InboxSidebar maintains the conversation list and unread counts. The ConversationPanel fetches conversation detail and messages independently when `conversationId` changes.
