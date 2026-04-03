# Telephony Integration Architecture

**Complete guide to how Asterisk, AMI Bridge, CRM Backend, and CRM28 Phone Desktop App work together.**

Last Updated: 2026-03-03 | CRM28 Phone v1.2.2 | Asterisk 16 (PJSIP)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ASTERISK / FreePBX SERVER                           │
│                         (IP: 5.10.34.153)                                  │
│                                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ PJSIP    │  │ AMI          │  │ ARI        │  │ HTTP/WSS             │  │
│  │ UDP:5060 │  │ TCP:5038     │  │ HTTP:8088  │  │ WSS:8089/ws          │  │
│  │ WSS:8089 │  │ (events)     │  │ (control)  │  │ (WebRTC softphones)  │  │
│  └────┬─────┘  └──────┬───────┘  └─────┬──────┘  └──────────┬───────────┘  │
│       │               │                │                     │              │
│  PSTN Trunks     Event stream     Call control         SIP.js clients      │
│  SIP Phones      to AMI Bridge    from CRM backend     (CRM28 Phone)       │
└───────┼───────────────┼────────────────┼─────────────────────┼──────────────┘
        │               │                │                     │
        │               ▼                │                     │
        │  ┌──────────────────────┐      │                     │
        │  │    AMI BRIDGE        │      │                     │
        │  │  (Windows VM)        │      │                     │
        │  │  Node.js service     │      │                     │
        │  │                      │      │                     │
        │  │  TCP:5038 ──listen── │      │                     │
        │  │  HTTPS POST ──push─▶│──────┼──────────┐          │
        │  └──────────────────────┘      │          │          │
        │                                │          ▼          │
        │                         ┌──────┴──────────────┐      │
        │                         │  CRM BACKEND        │      │
        │                         │  (VM 192.168.65.110)    │      │
        │                         │  NestJS             │      │
        │                         │                     │      │
        │                         │  POST /v1/telephony │      │
        │                         │  /events            │      │
        │                         │                     │      │
        │                         │  WebSocket          │      │
        │                         │  /telephony         │◄─────┤
        │                         │  (Socket.IO)        │      │
        │                         │                     │      │
        │                         │  GET /auth/me       │◄─────┤
        │                         │  POST /auth/        │      │
        │                         │  app-login          │      │
        │                         └──────┬──────────────┘      │
        │                                │                     │
        │                                ▼                     │
        │                         ┌─────────────────┐          │
        │                         │  CRM FRONTEND   │          │
        │                         │  (VM/Next.js)  │          │
        │                         │                 │          │
        │                         │  Call Center UI │          │
        │                         │  Live Dashboard │          │
        │                         │  Admin Pages    │          │
        │                         └─────────────────┘          │
        │                                                      │
        │                                                      │
        │         ┌────────────────────────────────────────┐   │
        │         │     CRM28 PHONE DESKTOP APP            │   │
        │         │     (Windows, Electron)                 │   │
        │         │                                        │   │
        │         │  ┌─────────────┐  ┌─────────────────┐  │   │
        │         │  │ Main Process│  │ Renderer Process │  │   │
        │         │  │ (Node.js)   │  │ (Chromium)       │  │   │
        │         │  │             │  │                   │  │   │
        │         │  │ IPC, Tray,  │  │ SIP.js UserAgent │──┘
        │         │  │ Auth, Store │  │ WebRTC audio     │
        │         │  │ Local HTTP  │  │ React UI         │
        │         │  │ bridge      │  │ Ringtone, DTMF   │
        │         │  └─────────────┘  └─────────────────┘  │
        │         └────────────────────────────────────────┘
        │
   PSTN / SIP Phones (hardware)
```

---

## Component Details

### 1. Asterisk / FreePBX Server

**Location**: Dedicated server at `5.10.34.153`
**Version**: Asterisk 16.20 with FreePBX GUI
**SIP Driver**: PJSIP only (`chan_sip` disabled via `noload` in `modules.conf`)

#### Key Configuration

| Setting | Value | File/Location |
|---------|-------|---------------|
| SIP Driver | `chan_pjsip` | `ASTSIPDRIVER` in FreePBX Advanced Settings |
| chan_sip | Disabled | `noload = chan_sip.so` in `/etc/asterisk/modules.conf` |
| WSS Transport | `0.0.0.0:8089` | PJSIP transport for WebRTC clients |
| TLS Certificate | Self-signed for `5.10.34.153` | `/etc/asterisk/keys/asterisk.pem` (valid until 2036) |
| AMI Port | `5038` | `/etc/asterisk/manager.conf` |
| ARI Port | `8088` | `/etc/asterisk/ari.conf` |

#### WebRTC Extension Configuration (PJSIP)

Each WebRTC-capable extension needs these settings in the PJSIP endpoint. FreePBX applies them, but custom overrides go in `/etc/asterisk/pjsip.endpoint_custom_post.conf`:

```ini
[502](+)
webrtc=yes
force_avp=yes
media_encryption=dtls
direct_media=no
transport=0.0.0.0-wss
rewrite_contact=yes
```

The `(+)` syntax means "append to existing section" -- this ensures WebRTC settings persist even after FreePBX "Apply Config" regenerates dialplan files.

#### ASTDB Requirements

For each extension (e.g., 502), Asterisk's internal database must have these entries for the dialplan to route calls correctly:

```
DEVICE/502/default_user  = 502
DEVICE/502/dial          = PJSIP/502
DEVICE/502/type          = fixed
DEVICE/502/user          = 502
AMPUSER/502/cidname      = <Display Name>
AMPUSER/502/cidnum       = 502
AMPUSER/502/device       = 502
AMPUSER/502/hint         = PJSIP/502
```

These are normally created by FreePBX when you add an extension via the GUI. If adding via SQL, you must also populate ASTDB manually using `asterisk -rx "database put DEVICE/502 dial PJSIP/502"` etc.

#### Applying Changes

- **Always use**: `fwconsole reload` (not `systemctl restart asterisk`)
- **Database changes**: Must match FreePBX GUI expectations to avoid "Apply Config" overwriting them
- **Custom configs**: Use `*_custom_post.conf` files which FreePBX preserves

---

### 2. AMI Bridge

**Location**: Runs on the same Windows VM as (or with network access to) the Asterisk server
**Technology**: Node.js, PM2 for process management
**Source**: `ami-bridge/` directory

#### What It Does

The AMI Bridge maintains a persistent TCP connection to Asterisk's Manager Interface (AMI) on port 5038. It listens for raw AMI events, normalizes them into a standard CRM event format, batches them, and POSTs them to the CRM backend's telephony ingestion endpoint.

#### Event Flow

```
Asterisk AMI Event (TCP:5038)
        │
        ▼
   AMI Client (TCP socket, auto-reconnect with backoff)
        │
        ▼
   Event Mapper
   - Filters: only primary channels (uniqueid === linkedid)
   - Maps AMI event names to CRM event types (see table below)
   - Generates idempotency keys
   - Extracts recording paths from VarSet/MixMonitor
        │
        ▼
   Event Buffer (batches up to 20 events or 3 seconds)
        │
        ▼
   CRM Poster
   - POST http://127.0.0.1:3000/v1/telephony/events
   - Header: x-telephony-secret: <shared secret>
   - Retry with exponential backoff on failure
```

#### AMI → CRM Event Type Mapping

| Asterisk AMI Event | CRM Event Type | When |
|---|---|---|
| `Newchannel` (uniqueid=linkedid) | `call_start` | New incoming/outgoing call |
| `DialEnd` (status=ANSWER) | `call_answer` | Call was answered |
| `BridgeEnter` | `call_answer` | Caller bridged to agent |
| `Hangup` | `call_end` | Call terminated |
| `QueueCallerJoin` | `queue_enter` | Caller enters queue |
| `QueueCallerLeave` | `queue_leave` | Caller leaves queue |
| `AgentConnect` | `agent_connect` | Agent picks up queued call |
| `BlindTransfer` | `transfer` | Blind transfer |
| `AttendedTransfer` | `transfer` | Attended transfer |
| `MusicOnHoldStart` | `hold_start` | Call put on hold |
| `MusicOnHoldStop` | `hold_end` | Call taken off hold |
| `VarSet` / `MixMonitor` | `recording_ready` | Recording file path captured |

#### Configuration (`.env`)

```env
AMI_HOST=127.0.0.1
AMI_PORT=5038
AMI_USER=crm_ami
AMI_SECRET=<ami-password>
CRM_BASE_URL=http://127.0.0.1:3000
TELEPHONY_INGEST_SECRET=<shared-secret-matching-backend>
LOG_LEVEL=INFO
```

#### Running

```bash
cd ami-bridge
pnpm install
pnpm build
pm2 start dist/main.js --name ami-bridge
```

---

### 3. CRM Backend (Telephony Module)

**Location**: VM 192.168.65.110 (NestJS application, PM2)
**Source**: `backend/crm-backend/src/telephony/`
**Full documentation**: `docs/CALL_CENTER.md`

#### Key Services

| Service | Responsibility |
|---------|---------------|
| `TelephonyIngestionService` | Receives batched events from AMI Bridge, deduplicates via idempotency keys, persists to DB |
| `AmiClientService` | Direct AMI connection (when backend runs near Asterisk) for sync operations |
| `AriClientService` | HTTP calls to Asterisk ARI for call control (originate, transfer, hangup) |
| `TelephonyStateManager` | In-memory real-time state (active calls, agent presence, queue snapshots) |
| `TelephonyGateway` | Socket.IO WebSocket gateway at `/telephony` namespace, pushes live events |
| `AsteriskSyncService` | Syncs queues and extensions from Asterisk to CRM database |
| `CdrImportService` | Imports CDR records as safety net (cron every 5 min) |
| `QualityPipelineService` | OpenAI Whisper + GPT for call quality scoring |

#### Authentication for Desktop App

The desktop app authenticates via a dedicated endpoint:

```
POST /auth/app-login
Body: { email, password }
Response: { accessToken, user, telephonyExtension }
```

The `telephonyExtension` object contains:
- `extension`: PJSIP extension number (e.g., "502")
- `displayName`: Employee name
- `sipServer`: Asterisk IP (e.g., "5.10.34.153") -- manually configured by admin
- `sipPassword`: PJSIP secret -- manually configured by admin

These SIP credentials are stored in the CRM database (`TelephonyExtension` model), NOT auto-synced from Asterisk for security reasons. An admin configures them via the Telephony Extensions admin page.

#### Database Models (Prisma)

```
TelephonyExtension
├── extension     String     (e.g., "502")
├── displayName   String
├── sipServer     String?    (manually set by admin)
├── sipPassword   String?    (manually set by admin)
└── userId        String     (FK to User)

CallSession       (one per call, keyed by Asterisk linkedId)
├── linkedId      String     @unique
├── callerNumber, calledNumber
├── direction     (INBOUND/OUTBOUND)
├── disposition   (ANSWERED/MISSED/ABANDONED/NOANSWER/BUSY/FAILED)
├── queueId       (FK to TelephonyQueue)
├── assignedUserId (FK to User, the agent)
└── CallEvent[]    (chronological event log)

CallEvent
├── eventType     (call_start, call_answer, call_end, etc.)
├── idempotencyKey String @unique (prevents duplicate processing)
└── payload       Json

CallMetrics       (computed from events per call)
├── waitSeconds, talkSeconds, holdSeconds, wrapupSeconds
├── transfersCount, isSlaMet
└── callSessionId (FK)
```

#### Environment Variables

```env
AMI_ENABLED=true
AMI_HOST=127.0.0.1        # or via AMI Bridge
AMI_PORT=5038
AMI_USER=crm
AMI_SECRET=<secret>
ARI_ENABLED=true
ARI_BASE_URL=http://127.0.0.1:8088/ari
ARI_USER=crm
ARI_PASSWORD=<secret>
CDR_IMPORT_ENABLED=true
CDR_DB_URL=postgresql://asterisk:pass@localhost:5432/asteriskcdrdb
TELEPHONY_INGEST_SECRET=<shared-secret>
QUALITY_AI_ENABLED=true
OPENAI_API_KEY=sk-...
RECORDING_BASE_PATH=/var/spool/asterisk/monitor
```

---

### 4. CRM28 Phone Desktop App

**Location**: User's Windows PC
**Technology**: Electron 28, React 18, SIP.js 0.21, TypeScript
**Source**: `crm-phone/`
**Current Version**: 1.2.2

#### Architecture

The app uses Electron's multi-process model:

**Main Process** (`src/main/index.ts`) -- Node.js:
- Window management (BrowserWindow, Tray, always-on-top)
- IPC handlers for auth, settings, contact lookup
- Session persistence via `electron-store` (encrypted)
- Local HTTP bridge on `127.0.0.1:19876` for CRM web app communication
- TLS certificate bypass for self-signed Asterisk cert
- Media permission grants (`setPermissionRequestHandler`)
- Renderer log relay (writes renderer logs to file)

**Renderer Process** (`src/renderer/`) -- Chromium:
- SIP.js `UserAgent` with WebRTC (native `getUserMedia`, `RTCPeerConnection`)
- WebSocket connection to Asterisk WSS on port 8089
- Call control: answer, hangup, hold, unhold, mute, DTMF
- Remote audio playback via dynamically created `<audio>` elements
- Ringtone via Web Audio API (440Hz/480Hz oscillator)
- React UI: Login, Phone, Settings, IncomingCallPopup pages

**Preload Script** (`src/main/preload.ts`):
- `contextBridge` securely exposes APIs to the sandboxed renderer
- APIs: auth, sip.reportStatus, log, settings, window, contact, app

#### SIP Registration Flow

```
1. User logs in via CRM credentials
   └─ POST /auth/app-login → { accessToken, telephonyExtension }

2. Session stored encrypted locally (electron-store)

3. SIP.js UserAgent created in renderer process
   └─ URI: sip:502@5.10.34.153
   └─ Transport: wss://5.10.34.153:8089/ws
   └─ Auth: extension + sipPassword from telephonyExtension

4. TLS cert validation bypassed in main process
   └─ setCertificateVerifyProc(() => callback(0))

5. Registerer sends REGISTER to Asterisk PJSIP
   └─ On success: "Registered" state emitted
   └─ Main process tray updated via IPC

6. On app restart: session restored from store
   └─ GET /auth/me refreshes extension data
   └─ SIP re-registers automatically
```

#### Incoming Call Flow

```
1. Asterisk sends SIP INVITE via WSS to registered UserAgent

2. SIP.js fires ua.delegate.onInvite(invitation)

3. SipService.handleIncoming():
   └─ Sets callState = "ringing"
   └─ Emits "incoming-call" event
   └─ Shows main window (app.show)

4. Settings checked:
   └─ If !muteRingtone → startRingtone() (Web Audio API)
   └─ If overrideApps → setAlwaysOnTop(true)

5. IncomingCallPopup rendered with Answer/Decline buttons

6. User clicks Answer:
   └─ callState = "connecting" (spinner animation shown)
   └─ invitation.accept() called
   └─ SIP 200 OK sent, SDP exchange happens
   └─ Session transitions: Establishing → Established

7. On Established:
   └─ callState = "connected"
   └─ attachRemoteAudio():
       - Get RTCPeerConnection from sessionDescriptionHandler
       - Collect receiver tracks into MediaStream
       - Create <audio> element, set srcObject, autoplay
       - Apply audioOutputDeviceId via setSinkId if configured
   └─ Ringtone stopped, alwaysOnTop cleared

8. On call end (Terminated):
   └─ cleanupRemoteAudio() (pause, remove element)
   └─ callState = "idle"
```

#### Outgoing Call Flow

```
1. User enters number and clicks Call

2. SipService.dial(number):
   └─ Creates Inviter targeting sip:number@sipHost
   └─ Sets callState = "dialing"
   └─ inviter.invite() sends SIP INVITE

3. On Established:
   └─ Same remote audio attachment as incoming
   └─ callState = "connected"
```

#### Hold / Mute Implementation

**Mute**: Disables local audio tracks on the RTCPeerConnection senders. Caller can't hear the agent. Agent can still hear caller. Visual indicator turns amber.

**Hold**: Disables local audio tracks AND mutes the remote audio element. Neither party hears the other. Visual indicator turns amber. Unhold reverses both.

Note: This is a "local hold" -- it does not send a SIP re-INVITE with `a=sendonly`. The caller does not get music-on-hold from Asterisk. For server-side hold with MOH, use the ARI hold endpoint from the CRM web frontend instead.

#### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `auth:login` | Renderer → Main | CRM login |
| `auth:logout` | Renderer → Main | Clear session |
| `auth:get-session` | Renderer → Main | Get current session + SIP status |
| `auth:session-changed` | Main → Renderer | Session updated (from web bridge) |
| `sip:status-report` | Renderer → Main | SIP registration state for tray |
| `renderer:log` | Renderer → Main | Send logs to file |
| `settings:get` | Renderer → Main | Read all settings |
| `settings:set` | Renderer → Main | Update a setting |
| `win:set-always-on-top` | Renderer → Main | Toggle always-on-top |
| `contact:lookup` | Renderer → Main | Caller ID lookup via CRM API |
| `app:quit` | Renderer → Main | Quit application |
| `app:show` | Renderer → Main | Show + focus window |
| `app:hide` | Renderer → Main | Hide to tray |

#### Settings (persisted via electron-store)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `muteRingtone` | boolean | false | Suppress ringtone audio on incoming calls |
| `overrideApps` | boolean | true | Bring window to front on incoming calls |
| `audioInputDeviceId` | string | "" | Preferred microphone device ID |
| `audioOutputDeviceId` | string | "" | Preferred speaker device ID |

#### Local HTTP Bridge (127.0.0.1:19876)

The CRM web frontend can communicate with the desktop app via this local bridge:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/status` | GET | Is app running? Who's logged in? Extension? |
| `/switch-user` | POST | Exchange handshake token for session (seamless login from web) |
| `/logout` | POST | Log out desktop app |

The frontend header (`header-settings.tsx`) polls `/status` to show phone app connection state.

#### Building the App

```bash
cd crm-phone
npm install
npm run build          # esbuild (main+preload) + vite (renderer)
npm run pack           # electron-builder → NSIS installer
```

Output: `release/CRM28 Phone Setup X.Y.Z.exe`

Release: Upload to GitHub Releases, update download link in `header-settings.tsx`.

---

### 5. CRM Frontend (Call Center UI)

**Location**: VM 192.168.65.110 (Next.js, PM2)
**Source**: `frontend/crm-frontend/src/app/app/call-center/`

#### Pages

| Route | Purpose |
|-------|---------|
| `/app/call-center` | Live dashboard: active calls, queue state, agent presence (WebSocket) |
| `/app/call-center/analytics` | Historical KPIs: SLA, answer time, abandon rate, per-agent/queue |
| `/app/call-center/quality` | Quality review list, AI scores, transcripts |
| `/app/admin/telephony` | Extension management: assign SIP server + password per employee |

#### Phone App Integration in Header

`header-settings.tsx` checks if the desktop app is running by polling `http://127.0.0.1:19876/status`. It shows one of three states:

1. **Connected**: Green dot, logged-in user, extension number
2. **Not logged in**: Amber dot, "App running, not logged in"
3. **Not installed**: Download link to latest GitHub release

---

## Data Flow Summary

### Real-Time Call Monitoring (Web Dashboard)

```
Phone rings → Asterisk → AMI event
                           │
                    AMI Bridge batches & POSTs
                           │
                    CRM Backend ingests event
                           │
                    TelephonyStateManager updates in-memory state
                           │
                    TelephonyGateway emits WebSocket event
                           │
                    Frontend call-center dashboard updates live
```

### Desktop App SIP Call

```
Phone rings → Asterisk → PJSIP → WSS:8089 → SIP.js in Electron renderer
                                                │
                                         IncomingCallPopup shown
                                         User clicks Answer
                                                │
                                         SDP exchange (WebRTC)
                                         RTP media flows directly:
                                         Asterisk ←→ Electron (via STUN/TURN)
                                                │
                                         Remote audio → <audio> element
                                         Local mic → RTCPeerConnection sender
```

### Extension Configuration

```
Admin opens /app/admin/telephony
    │
    ▼
Sets sipServer + sipPassword for employee
    │
    ▼
Saved to CRM DB (TelephonyExtension table)
    │
    ▼
Desktop app fetches via GET /auth/me on next login/restart
    │
    ▼
SIP.js registers with those credentials to Asterisk
```

---

## Troubleshooting

### Desktop App: "Offline" / Won't Register

1. Check DevTools (Ctrl+Shift+I in the app) for SIP-R errors
2. Verify `sipServer` and `sipPassword` are set in CRM admin
3. Verify Asterisk WSS is accessible: `wss://5.10.34.153:8089/ws`
4. Check PJSIP extension exists: `asterisk -rx "pjsip show endpoint 502"`
5. Check TLS cert: `openssl s_client -connect 5.10.34.153:8089`
6. Log file: `%APPDATA%/crm-phone/crm-phone-debug.log` (or `crm28-phone/`)

### Desktop App: One-Way Audio

- If caller can't hear agent: Check microphone permissions, test mic in Settings
- If agent can't hear caller: Verify `attachRemoteAudio()` ran (check logs for "Remote audio playback started")
- Check Asterisk NAT settings: `rtp_symmetric=yes`, `rewrite_contact=yes`
- Check firewall allows UDP RTP ports (10000-20000)

### Desktop App: Can't Answer Calls

- Check for `NotFoundError: Requested device not found` in DevTools
- Ensure `setPermissionRequestHandler` is in main process (grants mic access)
- Verify at least one audio input device exists

### AMI Bridge: Events Not Reaching CRM

- Verify `TELEPHONY_INGEST_SECRET` matches between AMI Bridge `.env` and CRM backend
- Test connectivity: `curl -X POST <CRM_BASE_URL>/v1/telephony/events -H "x-telephony-secret: <secret>"`
- Check AMI connection: look for "AMI Connected" in bridge logs
- Set `LOG_LEVEL=DEBUG` for verbose output

### Asterisk: Extension Not Receiving Calls

- Check ASTDB entries: `asterisk -rx "database show DEVICE/502"`
- Verify endpoint is registered: `asterisk -rx "pjsip show endpoint 502"`
- Check `pjsip.endpoint_custom_post.conf` has WebRTC settings
- Run `fwconsole reload` after any config changes

### FreePBX "Apply Config" Overwrites Settings

- Use `*_custom_post.conf` files for settings that must persist
- Database changes (MySQL) must match what FreePBX GUI expects
- After manual DB changes, always run `fwconsole reload`
- Never edit `pjsip.endpoint.conf` directly -- FreePBX regenerates it

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-02-27 | Initial Electron app with SIP.js in main process |
| v1.1.0 | 2026-03-02 | Moved SIP.js to renderer (native WebRTC), PJSIP migration |
| v1.2.0 | 2026-03-03 | Mic permissions, ringtone, settings page, rename to CRM28 Phone |
| v1.2.1 | 2026-03-03 | Fix one-way audio (attach remote stream to audio element) |
| v1.2.2 | 2026-03-03 | Fix mute indicator, hold/unhold, connecting animation |

---

## Key Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| PJSIP only (chan_sip disabled) | WebSocket transport requires PJSIP; chan_sip conflicts with res_pjsip_transport_websocket |
| SIP.js in renderer, not main process | Main process lacks WebRTC APIs (MediaStream, RTCPeerConnection); Chromium renderer has them natively |
| Manual SIP credential config | Security: admin explicitly sets sipServer/sipPassword per employee, no auto-sync from Asterisk |
| Local HTTP bridge (port 19876) | Allows CRM web frontend to detect and communicate with desktop app without complex protocols |
| Self-signed TLS cert bypass | Production Asterisk uses self-signed cert; `setCertificateVerifyProc` in Electron bypasses validation |
| electron-store for settings | Simple, file-based persistence for user preferences; separate from encrypted session store |
| AMI Bridge as separate PM2 process | CRM backend and AMI bridge both run on VM 192.168.65.110; AMI reaches Asterisk via SSH tunnel |

---

## For Developers Continuing This Work

### Adding a New Phone Feature

1. Add IPC channel in `crm-phone/src/shared/ipc-channels.ts`
2. Expose via `contextBridge` in `crm-phone/src/main/preload.ts`
3. Handle in main process (`crm-phone/src/main/index.ts`) or renderer
4. If SIP-related, modify `crm-phone/src/renderer/sip-service.ts`
5. Update UI in the relevant page component under `crm-phone/src/renderer/pages/`
6. Build: `npm run build` then `npm run pack`

### Adding a New AMI Event Type

1. Add mapping in `ami-bridge/src/event-mapper.ts`
2. Add handler in `backend/crm-backend/src/telephony/services/telephony-ingestion.service.ts`
3. If it affects live state, update `TelephonyStateManager`
4. If it should push to clients, add WebSocket event in `TelephonyGateway`
5. Update `docs/CALL_CENTER.md` event mapping table

### Adding a New Call Control Action

1. Add ARI method in `backend/crm-backend/src/telephony/services/ari-client.service.ts`
2. Add controller endpoint in `backend/crm-backend/src/telephony/controllers/telephony-actions.controller.ts`
3. Add frontend button/action in the call center UI
4. Optionally expose via desktop app IPC if needed from the softphone
