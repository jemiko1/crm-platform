# FreePBX Extension Setup Guide

How to create new extensions in FreePBX so they work with the CRM softphone.

> **Read this first if you've ever had operators stuck on "offline":**
> The Electron softphone (v1.11.x and later) connects via WSS (WebSocket Secure)
> to `wss://pbx.asg.ge:8089/ws`. It enforces a real public-CA certificate and
> needs a specific WebRTC config on the extension. If any of those drift, the
> operator can never register, no matter how good their password is.

---

## Quick path: copy ext 200's profile

Ext 200 is the canonical "known-working" profile. The fastest correct way to
make a new extension is to **clone its settings**, change only the number,
name, and email, and submit.

### Step-by-step (FreePBX GUI)

1. **Admin → Applications → Extensions → +Add Extension → Add New Chan_PJSIP Extension**
2. **General tab** — fill in:
   - **User Extension** → the new number (e.g. `503`)
   - **Display Name** → operator's full name in Latin
     (e.g. `Bela Resulidze`). FreePBX shows this in CDR + Caller ID.
   - **Outbound CID** → leave blank (CRM controls it via dialplan)
   - **Secret** → click the dice icon for a random 32-char hex.
     **Do not type a vanity password.**
   - **Voicemail** → Disabled (CRM doesn't use FreePBX voicemail)
3. **Advanced tab** — set EXACTLY these values
   (the rest are FreePBX defaults, leave alone):

   | Field | Required value | Why |
   |---|---|---|
   | DTMF Signaling | RFC 4733 | Default. Don't change. |
   | Context | `from-internal` | Standard FreePBX context. |
   | Trust RPID | Yes | Caller ID propagation. |
   | Send Connected Line | Yes | Display name updates after answer. |
   | user = Phone | No | This is a softphone, not a phone with TUI. |
   | Send RPID | Send P-Asserted-Identity header | Standard for ID flows. |
   | Qualify Frequency | 60 | Liveness probe interval. |
   | Transport | **Auto** | **Critical** — required so WSS works. Don't pick "Custom". |
   | Enable AVPF | **Yes** | **Critical** for WebRTC. |
   | Enable ICE Support | **Yes** | **Critical** for WebRTC NAT traversal. |
   | Enable rtcp Mux | **Yes** | **Critical** — WebRTC mandates rtcp-mux. |
   | Max Contacts | 1 | Operator should be on one device at a time. |
   | Media Use Received Transport | No | Default. |
   | RTP Symmetric | Yes | NAT-friendly. |
   | Rewrite Contact | Yes | NAT-friendly. |
   | Force rport | Yes | NAT-friendly. |
   | MWI Subscription Type | Auto | Default. |
   | Aggregate MWI | Yes | Default. |
   | **Enable WebRTC defaults** | **No** ⚠️ | **Counter-intuitive** — clicking "Yes" sets `bundle=yes` + DTLS, which is incompatible with how SIP.js connects to this PBX. Leave as **No** even though we ARE running WebRTC. |
   | Max audio streams | 1 | |
   | Max video streams | 1 | |
   | **Media Encryption** | **None** | **Critical** — must NOT be `dtls`. The current PBX cert doesn't terminate DTLS-SRTP correctly. |
   | Session Timers | Yes | |
   | Timer Expiration Period | 90 | |
   | Direct Media | **Yes** | Allows direct media path between operators (lower latency for internal calls). |
   | Allow Non-Encrypted Media | No | Doesn't apply — we use no encryption. |
   | Refer Blind Progress | Yes | |

4. **DTLS section** (further down on Advanced tab):
   - **Enable DTLS** → **No** ⚠️ — must be off; we don't use DTLS-SRTP.
   - All other DTLS fields irrelevant when Enable DTLS = No.

5. **Voicemail tab** → leave Disabled. The CRM's missed-call workflow handles
   what voicemail would otherwise do.

6. **User Manager assignment** (after Submit):
   - Set the User Manager username to the operator's CRM email
     (e.g. `bela.resulidze@asg.ge`).
   - This drives the future `accountcode` value used by `asterisk-sync`
     for auto-link discovery in CRM.

7. **Submit** → **Apply Config**.

8. Wait ~5 minutes (or `pm2 restart crm-backend` on the VM) for
   `asterisk-sync` to pick up the new extension into CRM as a pool row.

9. In CRM **Admin → Telephony Extensions**, the new number appears as
   `— available —`. Click **Link employee** → pick the operator → done.

---

## Why these specific settings (the long version)

The CRM softphone is **SIP.js running inside Electron**. SIP.js connects
to Asterisk over **WebSocket Secure (WSS)** at `wss://pbx.asg.ge:8089/ws`.
Once the WSS connection is up, SIP signalling flows over it and media
flows over UDP/RTP.

The PBX's **WebRTC defaults** template in FreePBX is designed for browsers
that do full WebRTC including DTLS-SRTP. Our softphone does WSS for
signalling but uses plain RTP for media (no DTLS-SRTP). If you enable
WebRTC defaults, FreePBX flips on `media_encryption=dtls` + `bundle=yes`,
the softphone cannot complete media negotiation, and the call drops or
never connects. This was the root cause of the 502/204 confusion earlier.

The "looks like WebRTC but isn't quite" config is:
- WSS transport ✅ (so the softphone can reach Asterisk through https)
- AVPF + ICE + rtcp-mux ✅ (modern RTP profile, browser compatible)
- Media encryption: **off** ❌ no DTLS (because SIP.js negotiates plain RTP here)

Ext 200's GUI settings, captured live for reference:

```
General tab:
  User Extension: 200
  Display Name: Keti Khelashvili
  Outbound CID: (blank)
  Secret: 8234c7510fe2a8df1b5173a6bfe4aeac (auto-generated)
  Voicemail: Disabled

Advanced tab key fields:
  Transport: Auto
  Enable AVPF: yes
  Enable ICE Support: yes
  Enable rtcp Mux: yes
  Bundle: NO (WebRTC defaults must be NO)
  Media Encryption: NONE
  DTLS Enable: NO
  Direct Media: YES
  RTP Symmetric: yes
  Rewrite Contact: yes
  Force rport: yes
```

If you ever wonder whether a new extension is set up correctly, run:
```bash
ssh asterisk "sudo mysql -u root asterisk -e \"SELECT keyword,data FROM sip WHERE id='<EXT>' AND keyword IN ('media_encryption','rtcp_mux','bundle','transport','avpf','use_avpf')\""
```
and compare against ext 200.

---

## Bulk-creating extensions

For 5+ extensions at once:

1. **FreePBX GUI → Admin → Bulk Handler → Extensions → Export → CSV**
2. Open the CSV. Find the row for ext 200.
3. Copy that row 5 times. Change only:
   - `extension`, `name`, `cid_num`, `outboundcid`, `secret`, `accountcode`
4. Bulk Handler → Import → choose your file → Submit
5. Apply Config. Then run `asterisk-sync` (5 min cron, or `pm2 restart`).

This guarantees identical settings without 32 manual checkboxes.

---

## Common mistakes to avoid

1. **Clicking "Enable WebRTC defaults: Yes"** when creating an extension.
   This is the most common gotcha. It LOOKS like the right answer because
   we DO use WebRTC. It isn't. Leave at No.
2. **Setting Media Encryption to anything other than None.** DTLS / SDES
   both fail in different ways with SIP.js + this PBX cert.
3. **Setting Transport to a specific value** like `transport-wss`.
   Auto is right; specific transports break the auto-WSS routing.
4. **Manually typing a Secret.** Use the dice icon. Predictable secrets
   are a security issue, and CRM reads the secret via SSH+AMI anyway.
5. **Adding the new extension to a queue manually before linking in CRM.**
   The CRM Position-Queue rules system handles queue membership.
   Pre-adding creates duplicate entries that the unlink path won't clean up.
6. **Using sequential numbers across CRM operators and infrastructure.**
   Reserve `100-199` for special / outbound trunks, `200-299` for call-center
   operators, `500-599` for system extensions (admin, conference). The CRM
   pool model expects 200-series for operators.
