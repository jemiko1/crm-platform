# PBX TLS Certificate — Standard Operating Procedure

How the WSS cert on the PBX gets issued, renewed, and monitored. Read this if
operators suddenly all show "offline", or every ~60 days as a calendar reminder.

---

## TL;DR for the call-center owner

| You need to do | How often | Time it takes |
|---|---|---|
| Add a TXT record to `asg.ge` DNS | every ~60-80 days | 5 min once, plus 10-15 min DNS propagation |
| Click "merge" on a renewal PR (if/when CRM bumps related code) | rare | 30 sec |
| Nothing else | — | — |

If those happen on schedule, the call center stays up forever.

**You must check the operations dashboard regularly** — the dashboard header
shows a `PBX cert: Nd left` badge that goes amber at <21 days and red at <7.
Open https://crm28.asg.ge/admin/monitor/ at least once a week as part of your
ops check; the badge is your only built-in heads-up. (Email alerting is a
follow-up item — not implemented yet.) If the cert expires, **all softphones
immediately fail to register**. Renewing after expiry follows the same
procedure but with the operators offline during the renewal window.

---

## Architecture in 5 lines

1. The CRM softphone (Electron) connects via `wss://pbx.asg.ge:8089/ws`.
2. Asterisk's WSS port serves a public-CA-issued cert (ZeroSSL via acme.sh).
3. The cert is for FQDN `pbx.asg.ge` (DNS A record → 5.10.34.153, your PBX IP).
4. The cert is valid for ~90 days. acme.sh's daily cron tries to renew when
   it has < 30 days left, but our PBX network blocks LE's HTTP-01 challenge
   from the public internet, so we use **DNS-01** which is manual.
5. Manual renewal = adding a single TXT record once per renewal cycle.

---

## When operators are offline ("WebSocket failed", "ERR_CERT...", "1006")

1. **Check cert expiry first.** From any internet-connected machine:
   ```bash
   echo | openssl s_client -connect pbx.asg.ge:8089 -servername pbx.asg.ge 2>/dev/null \
     | openssl x509 -noout -dates
   ```
   - If `notAfter` is in the past → expired, follow renewal below.
   - If `notAfter` is in the future → cert is fine; problem is elsewhere
     (probably a softphone version mismatch or a broken extension config —
     see [`FREEPBX_EXTENSION_GUIDE.md`](FREEPBX_EXTENSION_GUIDE.md)).

2. **Check DNS hasn't drifted:**
   ```bash
   nslookup pbx.asg.ge 8.8.8.8
   ```
   Expect `5.10.34.153`. If anything else, fix the DNS A record.

---

## Renewal procedure (manual DNS-01, ~10 min)

Run when the dashboard badge goes amber, OR when calendar says "60 days since
last renewal", OR if the cert expired.

> **Who does what**
> - **Steps 1, 4, 5, 6 — engineer / Claude with PBX SSH access.** You can't
>   run these without `ssh asterisk`. Hand them off.
> - **Step 2 — call-center owner.** Adding the TXT record requires login to
>   the asg.ge DNS panel. The engineer cannot do this for you.
> - **Step 3 — anyone.** Just waiting for DNS to propagate; you can both
>   check.

### Step 1 — generate the challenge value (engineer)

SSH into the PBX or ask Claude to do it:
```bash
ssh asterisk "sudo /root/.acme.sh/acme.sh --renew -d pbx.asg.ge --force \
  --yes-I-know-dns-manual-mode-enough-go-ahead-please"
```

The output ends with:
```
Domain: '_acme-challenge.pbx.asg.ge'
TXT value: '<new 43-character challenge value>'
```

### Step 2 — add/update the DNS TXT record (owner)

In your `asg.ge` DNS panel:

| Type | Name | Value | TTL |
|---|---|---|---|
| TXT | `_acme-challenge.pbx` | `<the new value from step 1>` | 60 |

**If a TXT record from a previous renewal already exists at that name, REPLACE
it with the new value.** Don't keep the old one.

### Step 3 — wait for propagation (anyone)

```bash
nslookup -type=TXT _acme-challenge.pbx.asg.ge 8.8.8.8
```

Wait until it returns the new value. Typically 5-15 min.

### Step 4 — finalize (engineer)

```bash
ssh asterisk "sudo /root/.acme.sh/acme.sh --renew -d pbx.asg.ge \
  --yes-I-know-dns-manual-mode-enough-go-ahead-please"
```

This time it succeeds. acme.sh's installed `--reloadcmd` automatically:
- Copies the new cert to `/etc/asterisk/keys/integration/certificate.pem`
- Copies the new key to `/etc/asterisk/keys/integration/webserver.key`
- Sets owner/perms to `asterisk:asterisk` mode 600
- Reloads Asterisk's HTTP module so WSS picks up the new cert

### Step 5 — verify (anyone)

```bash
echo | openssl s_client -connect pbx.asg.ge:8089 -servername pbx.asg.ge 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

`notAfter` should be ~90 days in the future. Operators don't need to do
anything — the WSS endpoint hot-reloaded; their next reconnect (or any
softphone restart) gets the new cert transparently.

### Step 6 — clean up the TXT record (owner, optional)

The TXT record at `_acme-challenge.pbx.asg.ge` is no longer needed. You can
delete it. Or leave it — it's harmless until the next renewal when you'll
need to update it.

---

## If you get stuck

**Things to NOT do** if anything in the renewal goes sideways:

- **DO NOT** delete files in `/etc/asterisk/keys/integration/` — they're the
  cert + key. Deleting them takes the call center down even if the cert was
  still valid.
- **DO NOT** restart Asterisk (`fwconsole restart` / `asterisk -rx "core
  restart now"`) thinking it'll fix things — restart kicks every operator
  out for ~30 seconds and rarely fixes cert issues.
- **DO NOT** delete the `pbx.asg.ge` A record from DNS thinking you'll
  re-create it — the new record takes 5-15 min to propagate and you lose
  service for that whole window.
- **DO NOT** click "Generate Let's Encrypt Certificate" in FreePBX's
  Certificate Manager — it tries HTTP-01 which is firewalled and will fail.
  We use acme.sh / DNS-01 instead.

**If you get stuck, do this:**
- Take a screenshot of the error or copy the relevant log lines.
- Ping your engineer (or open a session with Claude) with the screenshot
  and the answer to: "is the cert expired right now?" (run the openssl
  command at the top of this doc from any PC).
- The fallback: while you wait for help, the operators can use FreePBX
  desktop phones / hardware phones — those don't go through WSS and aren't
  affected by the cert. CRM call attribution will be missing for those
  calls but the calls themselves work.

---

## Why we can't auto-renew

acme.sh ships with a daily cron that tries `--renew` automatically. **It will
not work for our setup** because:

- `asg.ge` DNS provider does not expose an API that acme.sh can use to add
  the TXT record automatically.
- The PBX is on a network that blocks inbound port 80 from the public internet,
  so HTTP-01 challenge (which doesn't need DNS API) also fails.
- The compromise: DNS-01 manual mode. Cron tries, fails, no harm done; human
  must run the renewal every 60-80 days.

If `asg.ge` ever gains a registrar API, we can switch to DNS-01 automatic and
forget this whole procedure exists.

---

## Why this single point of failure can take down the whole call center

If the cert expires:
- WSS handshake fails with `ERR_CERT_DATE_INVALID`.
- SIP.js never registers any softphone.
- All operators show "offline" simultaneously.
- Inbound queue calls have no operators to ring.
- The PBX itself keeps working — calls between hardware phones, trunk routing,
  etc. all fine. Only the WSS path is dead.

That's why the bridge-monitor alert is set 21 days early. **Treat the alert
as priority-1 within 1 business day.**

---

## What's monitored automatically

- **acme.sh daily cron** at 18:29 UTC: tries to renew. Logs to
  `/var/log/letsencrypt/` and `~/.acme.sh/acme.sh.log`. Will silently fail
  every day until you do the manual TXT step.
- **bridge-monitor cert-expiry check** (CRM's PM2 monitor service): hits
  `pbx.asg.ge:8089` once an hour. The dashboard header shows a `PBX cert:
  Nd left` badge that goes amber at < 21 days and red at < 7. See
  `vm-configs/crm-monitor/server.js` — `/api/pbx-cert`. Email/SMS alerting
  on top of this is a follow-up item, not yet implemented.

---

## Past incidents to learn from

**2026-04-28** — entire call center went offline simultaneously. Root cause:
softphone v1.10.x had a `setCertificateVerifyProc` blanket bypass that
trusted any cert. PR #292 (security audit) removed the bypass without
checking what cert the PBX actually served. Operators on v1.11.x updated,
discovered the PBX self-signed cert was untrusted, no WSS, no calls.
Fix: ZeroSSL public cert via acme.sh DNS-01 + `pbx.asg.ge` FQDN.
Documented in this file so the next "we just removed a security workaround"
PR pauses and asks "what was that workaround hiding?"
