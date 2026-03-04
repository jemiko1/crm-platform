# CRM28 Phone Module

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Location
`crm-phone/`

---

## Purpose
Electron desktop softphone for Windows. SIP.js + WebRTC for calls via Asterisk PJSIP WSS.

---

## Tech
- Electron 28, React 18, SIP.js 0.21, TypeScript
- SIP over WSS (port 8089) to Asterisk
- WebRTC for audio

---

## Architecture
- **Main process**: Window, tray, auth, IPC, local HTTP bridge (127.0.0.1:19876)
- **Renderer**: SIP.js UserAgent, WebRTC, React UI
- **Preload**: contextBridge for secure IPC

---

## Auth
- `POST /auth/app-login` → `{ accessToken, telephonyExtension }`
- SIP credentials (sipServer, sipPassword) from CRM admin, stored in DB

---

## Features
- Incoming/outgoing calls, hold, mute, DTMF
- Ringtone, always-on-top popup
- Caller ID lookup via CRM API
- Audio device settings
- Local HTTP bridge for CRM web app (status, switch-user, logout)

---

## Build
```bash
cd crm-phone
npm install
npm run build
npm run pack   # NSIS installer
```

---

## References
- **Telephony doc**: [`docs/TELEPHONY_INTEGRATION.md`](../../docs/TELEPHONY_INTEGRATION.md) (Section 4)
- **Architecture**: [`ai/architecture/telephony_architecture.md`](../architecture/telephony_architecture.md)
- **Key files**: `crm-phone/src/main/index.ts`, `crm-phone/src/renderer/sip-service.ts`
