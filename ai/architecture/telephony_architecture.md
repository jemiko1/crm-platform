# Telephony Architecture

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Overview

```
Asterisk/FreePBX ──AMI:5038──▶ AMI Bridge ──POST──▶ CRM Backend
       │                              │                    │
       │                              │                    ▼
       └──WSS:8089──▶ CRM28 Phone ◀───┴────────── WebSocket /telephony
       (SIP.js)                      (auth/me, app-login)      │
                                                               ▼
                                                    Call Center UI (Next.js)
```

---

## Components

| Component | Role |
|-----------|------|
| **Asterisk** | PJSIP (UDP 5060, WSS 8089), AMI (5038), ARI (8088) |
| **AMI Bridge** | Connects to AMI, maps events, batches, POSTs to CRM |
| **CRM Backend** | Ingests events, WebSocket gateway, ARI for call control |
| **CRM28 Phone** | Electron + SIP.js WebRTC softphone |
| **Call Center UI** | Live dashboard, analytics, quality, admin |

---

## Event Flow (AMI → CRM)
- `Newchannel` → `call_start`
- `Hangup` → `call_end`
- `QueueCallerJoin` → `queue_enter`
- `AgentConnect` → `agent_connect`, `call_answer`
- `BlindTransfer` / `AttendedTransfer` → `transfer`
- `MusicOnHoldStart`/`Stop` → `hold_start` / `hold_end`
- `VarSet`/`MixMonitor` → `recording_ready`

---

## Key Ports
- AMI: 5038
- ARI: 8088
- WSS (WebRTC): 8089
- CRM28 Phone local bridge: 127.0.0.1:19876

---

## References
- **Full guide**: [`docs/TELEPHONY_INTEGRATION.md`](../../docs/TELEPHONY_INTEGRATION.md)
- **Call Center**: [`docs/CALL_CENTER.md`](../../docs/CALL_CENTER.md)
- **AMI Bridge**: [`ami-bridge/README.md`](../../ami-bridge/README.md)
