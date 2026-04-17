# Asterisk / FreePBX Production Inventory

**Host:** 5.10.34.153 (SSH alias `asterisk`, reached via OpenVPN)
**Collection:** 2026-04-17, read-only. No reloads, no config writes.

---

## 1. Service status

| Item | Value |
|---|---|
| Asterisk version | 16.11.1 (built 2020-07-20) — **EOL upstream (16 LTS ended 2023-10)** |
| FreePBX version | 15.0.16.72 (`fwconsole`) |
| Distro | SNG7 FreePBX (root `/dev/mapper/s7_freepbx-root`) |
| Architecture | x86_64, Linux |
| Uptime | 113 days, 7:52 (load avg 0.06 / 0.09 / 0.13) |
| Service manager | LSB init script `/etc/rc.d/init.d/asterisk` — `systemctl is-active` returns `unknown` but Asterisk *is* running (verified by `asterisk -rx` responding and 2096 calls processed) |
| Total calls processed since start | 2096 |
| Active channels at snapshot | 0 |

---

## 2. SIP endpoints (PJSIP only; chan_sip not loaded)

### Extensions (`context=from-internal`)

| Ext | Status | Contact | Owner |
|---|---|---|---|
| **200** | **Not in use (Available)** | `sip:dj8ktvnc@46.49.102.171:52610` | Keti Khelashvili — only one registered |
| 201 | Unavailable | — | Nini Odisharia |
| 202 | Unavailable | — | Eto Metreveli (sample: transport udp, direct_media=yes, ulaw/alaw/gsm/g726/g722, dtmf rfc4733, trust_id_inbound=yes, media_encryption=no, ice_support=yes) |
| 203–214 | Unavailable | — | Mako Foladashvili, Anano Mchedlishvili, Anamaria Kutateladze, Mariam Nakaidze, Sofo Chikhladze, Mzia Mermanishvili, Ketevan Kiladze, Jeko Durmushova, Mariam Dolaberidze, Natia Gurgenadze, Lizi Gabritchidze, Mariam Malichava |
| 501 | Unavailable | — | Floater / test |

### Trunk

| Endpoint | Registration | Peer | Notes |
|---|---|---|---|
| `1055267e1-Active-NoWorkAlamex` | Registered (`sip:1055267e1@89.150.1.11`) | 89.150.1.11, RTT ~235ms | PJSIP outbound auth, max_retries=10000, 1h expiration, identified by source-IP match `89.150.1.11/32`. Provider Alamex. |

### PJSIP transport

`0.0.0.0-udp` on `0.0.0.0:5060`. **No TLS, no TCP.** All media unencrypted.

---

## 3. Queues

`/etc/asterisk/queues_additional.conf` (FreePBX-managed; edit only via GUI).

| Queue | Strategy | Timeout | ringinuse | wrapup | Members | Activity |
|---|---|---|---|---|---|---|
| `default` | ringall | — | — | — | none | — |
| `800` | ringall, retry=1 | 120 | yes | 1 | Local/100 | idle |
| `801` | ringall, retry=5 | 15 | yes | 0 | Local/200 (Keti) | idle |
| `802` | ringall, retry=1 | 30 | **no** | 2 | Local/102–107 (6) | idle — **can double-ring busy agent** |
| `803` | ringall, retry=1 | 1 | yes | 0 | Local/101 | idle (effectively pass-through) |
| **`804`** | **ringall, retry=1** | 15 | yes | 1, MOH=MOHNEW | **Local/200–214 + Local/501 (16 members)** | **Live queue — today: 67 completed, 70 abandoned, SL 98.5%, SL2 94.9% within 60s, 11s hold, 16s talk** |

Queue 804 is the live call-center queue. Agents bound via hints on `ext-local` so DND/in-use state propagates. Only ext 200 is registered at snapshot time so the other 15 members with `ringinuse=yes` cannot ring. No `periodic-announce-frequency` — callers hear MOHNEW only.

---

## 4. Manager / AMI

### `/etc/asterisk/manager.conf` (effective)

```
Manager (AMI):         Yes
Web Manager (AMI/HTTP):No
TCP Bindaddress:       0.0.0.0:5038
HTTP Timeout:          60s
TLS Enable:            No
Allow multiple login:  Yes
Display connects:      No
Timestamp events:      No
```

### `/etc/asterisk/manager_custom.conf`

```ini
[crm_ami]
secret  = CrmB1rdg3!Ast2026#Secure
deny    = 0.0.0.0/0.0.0.0
permit  = 0.0.0.0/0.0.0.0
read    = system,call,log,verbose,agent,user,config,dtmf,reporting,cdr,dialplan
write   = system,call,agent,user,config,command,reporting,originate
writetimeout = 5000
```

**AMI user for CRM bridge: `crm_ami`.** Bridge reaches it via SSH tunnel from VM localhost (127.0.0.1) — confirmed by all three `crm_ami` entries in `manager show connected` originating from 127.0.0.1.

### Connected AMI clients

| User | IP | Connected for |
|---|---|---|
| `crm_ami` | 127.0.0.1 | ~3,944,133s (~45 days) |
| `crm_ami` | 127.0.0.1 | ~170,634s (~2 days) |
| `firewall` | 127.0.0.1 | ~10,005s (Sangoma firewall module) |
| `crm_ami` | 127.0.0.1 | ~939s (fresh, reconnect cycle) |

**Three stacked `crm_ami` sessions.** Bridge reconnects without cleanly closing prior sockets; `Allow multiple login: Yes` is why they accumulate. Worth watching for FD leak on the VM PM2 side. If two bridges are both relaying, we could see doubled events.

Permission set includes `originate` + `command` — the bridge can execute arbitrary CLI. Rotate this secret if it has ever been committed or shared externally.

---

## 5. ARI

All 12 `res_ari*` modules loaded (use count on `res_ari.so` = 10).

### `/etc/asterisk/ari.conf` + `ari_general_additional.conf` + `ari_additional.conf`

```ini
[general]
enabled=yes
pretty=no
websocket_write_timeout=100
allowed_origins=*

[freepbxuser]
type=user
password=$6$...   (crypt, password_format=crypt)
read_only=no
```

**Only ARI user: `freepbxuser`.** No dedicated CRM ARI user. If backend ever needs ARI beyond current AMI-first flow, a new user must be added via FreePBX GUI.

### HTTP (ARI transport)

```
Server:  Asterisk/16.11.1
HTTP:    Enabled [::]:8088
HTTPS:   Enabled [::]:8089
URIs:    /httpstatus, /ari/..., /ws
```

Ports 8088/8089 likely blocked at the network edge (same posture as 5038). Reachable locally on the host.

---

## 6. Recordings

### Path

`/var/spool/asterisk/monitor/` (owner `asterisk:asterisk`, `drwxrwxr-x`).

### Structure

```
/var/spool/asterisk/monitor/2025/12/…
/var/spool/asterisk/monitor/2026/02/…
/var/spool/asterisk/monitor/2026/03/…
/var/spool/asterisk/monitor/2026/04/…
```

Year / month / day hierarchy.

### 10 most recent files (2026-04-17)

```
q-804-995599224774-20260417-170850-1776431330.1855.wav
q-804-995599224774-20260417-170953-1776431393.2176.wav
q-804-995599224774-20260417-171040-1776431440.2499.wav
q-804-995599224774-20260417-171538-1776431738.2726.wav
q-804-995599224774-20260417-182837-1776436117.3399.wav
q-804-995599224774-20260417-182854-1776436134.3656.wav
q-804-995599224774-20260417-182955-1776436195.3722.wav
q-804-995599224774-20260417-183117-1776436277.3853.wav
q-804-995599224774-20260417-183436-1776436476.4146.wav
q-804-995599224774-20260417-183515-1776436515.4213.wav
```

**Filename scheme:** `q-<queue>-<callerID>-YYYYMMDD-HHMMSS-<linkedid>.<uniqueid>.wav`.

All ten calls today came from the same number `995599224774` — test traffic or a single repeat caller. `.wav` format is uncompressed.

### Disk space

`/` (root volume, holds `/var/spool`): 39G total, 27G used, 13G free — **69% full**. No separate partition for recordings, no visible rotation cron. Safe for weeks at current volume; will fill if call volume ramps or recordings accumulate.

---

## 7. Dialplan contexts (summary)

80+ contexts loaded (FreePBX generates many). Relevant:

| Context | Notes |
|---|---|
| `from-internal` | Entry point for all PJSIP extensions (2xx). Outbound + feature codes. |
| `from-trunk` | Inbound entry after trunk handoff; delegates DID routing. |
| `from-pstn` | `Goto(from-trunk, ${DID}, 1)` |
| `from-trunk-pjsip-1055267e1-Active-NoWorkAlamex` | Trunk-specific handler; delegates to from-trunk |
| `from-trunk-pai` | Trust P-Asserted-Identity CID fallback |
| `crm-hangup` | **Sangoma's built-in `sangomacrm.agi` AGI. NOT our CRM.** Fires on every hangup. No-op if Sangoma CRM unconfigured, but one extra AGI round-trip per call. |

`crm-hangup` snippet:
```
's' =>  1. Noop(Sending Hangup to CRM)
        2. Noop(HANGUP CAUSE: ${HANGUPCAUSE})
        3. ExecIf($[${LEN(${CRM_VOICEMAIL})} > 0]?Set(__CRM_VOICEMAIL=${VMSTATUS}))
        4. Noop(MASTER CHANNEL: ${CHANNEL(UNIQUEID)} = ${MASTER_CHANNEL(CHANNEL(UNIQUEID))})
        5. GotoIf($["${CHANNEL(UNIQUEID)}"!="${MASTER_CHANNEL(CHANNEL(UNIQUEID))}"]?return)
        6. Set(__CRM_HANGUP=1)
        7. AGI(agi://127.0.0.1/sangomacrm.agi)
        8. Return()
```

---

## 8. Risks / notable findings (pre-launch view)

1. **Only 1 of 16 operator extensions registered** at snapshot time. Queue 804 effectively rings one person until others register. Verify each operator's SIP softphone is actually online Monday morning.
2. **Three simultaneous `crm_ami` sessions from 127.0.0.1.** Confirm only one AMI-bridge instance is running on VM via `pm2 list`. Doubled AMI relay would produce duplicate ingest events.
3. **`ringinuse=no` on queue 802** vs `yes` on 804 — inconsistent. Operational choice, but 802 can double-ring busy agents.
4. **ARI user only `freepbxuser`** — no dedicated CRM user. Acceptable for AMI-first design; flag if we enable ARI originate.
5. **Sangoma `sangomacrm.agi` fires on every hangup** — unrelated to our CRM. Dead AGI call per hangup; low impact but noise.
6. **Recording disk at 69% on single 39GB volume**, no rotation visible. Monitor; add rotation before end-of-year.
7. **All of today's recordings from same callerID** (`995599224774`). Probably testing; worth confirming the call center expects diverse inbound from real residents Monday.
8. **Asterisk 16.11.1 is EOL upstream**. Sangoma distro may still patch but this is long-term risk.
9. **SIP transport UDP-only, `media_encryption=no`**. Media unencrypted on the wire. Fine inside the private network; flag the moment any remote extension ever registers over public Internet.
10. **`crm_ami` has `originate` and `command` write perms.** The AMI bridge can run arbitrary Asterisk CLI. Rotate `CrmB1rdg3!Ast2026#Secure` if it has leaked. Also the Asterisk-side twin of `TELEPHONY_INGEST_SECRET` in CLAUDE.md's silent-override risks.

---

## 9. Key file paths (for future reference on the Asterisk host)

- `/etc/asterisk/manager_custom.conf` — `[crm_ami]` user
- `/etc/asterisk/ari.conf` + `ari_additional.conf` — ARI user `freepbxuser`
- `/etc/asterisk/ari_general_additional.conf` — ARI enabled, WebSocket config
- `/etc/asterisk/queues_additional.conf` — all queue definitions
- `/etc/asterisk/pjsip.registration.conf` — trunk registration
- `/etc/asterisk/pjsip.endpoint.conf` — extension endpoints
- `/etc/asterisk/extensions_additional.conf` — `from-trunk-pjsip-*` and `crm-hangup` contexts (lines 4089, 6183–6190)
- `/var/spool/asterisk/monitor/YYYY/MM/DD/` — recordings
