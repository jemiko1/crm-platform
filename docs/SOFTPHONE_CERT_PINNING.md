# Softphone PBX Certificate Pinning

How the CRM softphone trusts the FreePBX TLS cert, and how to rotate the pin
when the underlying cert changes.

## Why we pin

The softphone connects to FreePBX over WSS at `wss://pbx.asg.ge:8089/ws`.
Two facts shape the design:

1. The PBX runs on a private network (5.10.34.153). Public CAs cannot reach
   it for HTTP-01, and `asg.ge` has no DNS API for automated DNS-01. Any
   public-CA cert (Let's Encrypt / ZeroSSL) requires a manual DNS-01 step
   every ~60 days — exactly the operational burden we're trying to avoid
   after the 2026-04-28 outage.
2. The FreePBX-default self-signed cert at
   `/etc/asterisk/keys/integration/certificate.pem` is valid until
   **2036-02-28** — ten years of zero ops cost.

Pinning a specific cert hash is **strictly stronger** than trusting a public
CA: a public CA can be tricked, coerced, or compromised; a pinned hash
cannot. This is the same pattern used by mobile banking apps and Chrome's
HSTS preload list.

## What's pinned and where

| File | Role |
|---|---|
| `crm-phone/src/main/pbx-cert-pin.ts` | The pin module. Trusts only one SPKI hash at one host list, rejects everything else there, falls through to Chromium default for other hosts. |
| `crm-phone/src/main/index.ts` | Calls `installPbxCertPin()` once at `app.whenReady`, before any window opens. |

**Subject-Public-Key-Info SHA-256, base64.** We pin the SPKI rather than the
full cert because cert re-issuance using the same private key (FreePBX can
regenerate `certificate.pem` with a new validity range) keeps the SPKI hash
stable. Only an actual keypair rotation requires a softphone release.

The pin is attached to **`electronSession.defaultSession` only.** Today the
SIP.js client uses defaultSession for its WSS connection. If a future
feature creates a partitioned session (e.g. `session.fromPartition(...)`),
it will not inherit this pin — call `installPbxCertPin` again on the new
session.

## Rotation procedure

The pin needs to change in two cases:

- **Cert re-issuance with same key** (FreePBX cert ages out and admin
  clicks "Renew" in Cert Manager → keypair stays, validity extends).
  **No softphone release needed.** SPKI hash is unchanged.
- **Keypair rotation** (admin clicks "Generate new self-signed certificate"
  in FreePBX Cert Manager, or we move to a new PBX instance).
  **Softphone release required**, with the old + new SPKI both pinned in
  the bridging release so there's no operator downtime.

### Step-by-step (keypair rotation)

The key insight: ship the new pin **before** rotating the cert. Both old
and new are accepted during the window; operators auto-update in the
background; then we rotate the cert; then we drop the old pin.

1. **(engineer)** SSH to the PBX. Generate a new cert in FreePBX
   Cert Manager UI or via `acme.sh` — but **do not activate it yet**.
   ```bash
   ssh asterisk
   # Cert Manager UI: System Admin → Certificate Manager → New Certificate
   # OR via acme.sh:
   acme.sh --issue ... # standard procedure
   # Save the resulting cert PEM somewhere readable, e.g.
   # /tmp/new-cert.pem
   ```

2. **(engineer)** Capture the SPKI hash of the new cert:
   ```bash
   openssl x509 -in /tmp/new-cert.pem -noout -pubkey \
     | openssl pkey -pubin -outform DER \
     | openssl dgst -sha256 -binary \
     | openssl enc -base64
   ```
   Save the output (e.g. `Xy7k...=`).

3. **(engineer)** In `crm-phone/src/main/pbx-cert-pin.ts`, add the new
   hash as a SECOND entry in `PINNED_SPKI_SHA256` — keep the old one too:
   ```ts
   const PINNED_SPKI_SHA256 = [
     // FreePBX self-signed default cert (valid until 2036-02-28).
     // Captured 2026-04-28.
     'M29AQslp5wqLwEeH+qT9tYanHwDxvuRk9n/5q5pQyw8=',
     // New cert, will activate on PBX after softphone rollout.
     // Captured YYYY-MM-DD.
     'Xy7k...=',
   ];
   ```

4. **(engineer)** Bump version, build, ship release, push installer to
   GitHub Releases. (Standard softphone release flow — see
   `crm-phone/README.md` if it exists, or just `pnpm pack`.)

5. **(operators)** Wait for auto-update to roll out. The auto-updater hits
   `crm28.asg.ge` (CRM web app, public LE cert) so this works regardless
   of what cert state the PBX is in.

   Confirm in the bridge-monitor dashboard or by spot-checking individual
   operator versions: every active operator should be on the new build
   before step 6.

6. **(engineer)** Activate the new cert on the PBX:
   ```bash
   ssh asterisk
   cp /tmp/new-cert.pem /etc/asterisk/keys/integration/certificate.pem
   # corresponding key file too:
   cp /tmp/new-key.pem /etc/asterisk/keys/integration/webserver.key
   chmod 600 /etc/asterisk/keys/integration/{certificate.pem,webserver.key}
   chown asterisk:asterisk /etc/asterisk/keys/integration/{certificate.pem,webserver.key}
   asterisk -rx "module reload http"
   ```

   At this point both old and new certs are trusted by softphones
   (because both SPKI hashes are pinned). Operators see no outage.

7. **(engineer)** Wait ~1 week to give any straggler operators time to
   update. Then drop the OLD hash from `PINNED_SPKI_SHA256`. Bump
   version, ship, release. Done.

### What can go wrong

| Symptom | Cause | Fix |
|---|---|---|
| All operators offline after a softphone release | New hash is wrong (typo, captured from wrong cert) or PBX is serving a different cert than expected | `openssl s_client -connect pbx.asg.ge:8089 \| openssl x509 -noout -pubkey \| openssl pkey -pubin -outform DER \| openssl dgst -sha256 -binary \| openssl enc -base64` and compare to what's pinned. Roll back softphone if mismatched. |
| One operator offline after release | Their auto-update didn't apply | Right-click softphone tray → Check for Updates. Or download installer directly from GitHub Releases. |
| All operators offline mid-week | PBX cert was rotated outside the procedure | SSH to PBX, restore previous cert from backup at `/etc/asterisk/keys/integration/certificate.pem.bak.<date>` if it exists. Reload http module. Then run the rotation procedure properly. |
| `[cert-pin] PBX pbx.asg.ge presented UNEXPECTED cert` in softphone log | Either an unauthorized cert change OR an active MITM | Treat as security incident. Verify on PBX what cert is being served. If it's a legitimate change, run rotation procedure. If not, isolate operator's network. |

## What to NEVER do

- **Never re-add a `setCertificateVerifyProc` that returns `0` for any
  host other than the pinned PBX hosts.** That's PR #292's audit blocker
  B2 coming back: trusting any cert from any host on any network turns
  every untrusted Wi-Fi into an active-MITM opportunity.
- **Never pin a cert without also testing it.** Build the installer,
  install on a test machine, log in, place a call. If the SIP register
  fails the pin is wrong.
- **Never delete the `.bak` files on the PBX without an audit trail.**
  They are the rollback path.
- **Never put the SPKI hash in env vars or remote config.** It's a
  build-time constant on purpose: a release that doesn't include the
  right hash should fail to connect, loudly. Runtime override defeats
  the security property.

## Audit posture

The 2026-04-28 incident root cause was that PR #292 removed a security
workaround (the blanket cert-verify bypass) without identifying what the
workaround was hiding (a self-signed cert on the PBX). The lesson:
**when removing a security workaround, always pair the removal with a
fix on the underlying issue.**

This module is the underlying-issue fix. It does NOT bring back the
"trust any cert" behavior — it does "trust THIS specific cert at THIS
specific host, refuse everything else there, fall through to default for
unrelated hosts." That's the standard certificate-pinning pattern; see
RFC 7469 (HPKP, deprecated for browsers but the pattern stands) and any
mobile-banking-app pinning library.
