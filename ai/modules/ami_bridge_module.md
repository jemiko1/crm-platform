# AMI Bridge Module

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Location
`ami-bridge/`

---

## Purpose
Connects to Asterisk AMI (Manager Interface), listens for call events, maps them to CRM format, batches, and POSTs to CRM backend.

---

## Flow
```
Asterisk AMI (TCP:5038) → AMI Client → Event Mapper → Event Buffer → CRM Poster
                                                          (POST /v1/telephony/events)
```

---

## Requirements
- Node.js 22 LTS
- Network to Asterisk AMI (5038) and CRM backend (HTTPS)
- AMI user: `cdr,reporting,call,agent`

---

## Config (.env)
- `AMI_HOST`, `AMI_PORT`, `AMI_USER`, `AMI_SECRET`
- `CRM_BASE_URL` – Railway backend URL
- `TELEPHONY_INGEST_SECRET` – must match backend

---

## Run
```bash
cd ami-bridge
pnpm install
pnpm build
pnpm start
# Or: pm2 start dist/main.js --name ami-bridge
```

---

## Event Mapping (Summary)
| AMI Event | CRM Type |
|-----------|----------|
| Newchannel | call_start |
| Hangup | call_end |
| QueueCallerJoin | queue_enter |
| AgentConnect | agent_connect, call_answer |
| BlindTransfer/AttendedTransfer | transfer |
| MusicOnHoldStart/Stop | hold_start/hold_end |
| VarSet/MixMonitor | recording_ready |

---

## References
- **Full doc**: [`ami-bridge/README.md`](../../ami-bridge/README.md)
- **Telephony**: [`docs/TELEPHONY_INTEGRATION.md`](../../docs/TELEPHONY_INTEGRATION.md)
- **Architecture**: [`ai/architecture/telephony_architecture.md`](../architecture/telephony_architecture.md)
