# Asterisk Extension Configuration Reference

**Purpose:** What a properly-configured WebRTC operator extension looks like in Asterisk/FreePBX. Use this to verify existing extensions and to create new ones correctly.

**Context:** 8 of the 9 operator extensions (206, 208–214) were missing critical ASTDB entries. Inbound calls to the queue could not build a dial string and silently failed. The CLI fix was applied on 2026-04-17 to unblock operations, but **per FreePBX best practice, each extension should also be re-saved via the web GUI** so changes persist through "Apply Config".

---

## The 5 layers a working extension needs

### Layer 1 — `pjsip.endpoint_custom_post.conf` (WebRTC flags)
PJSIP endpoint must have these WebRTC settings. They're already correct for all operator extensions (verified 2026-04-17):

```ini
[214](+)
webrtc=yes
force_avp=yes
media_encryption=dtls
direct_media=no
transport=0.0.0.0-wss
rewrite_contact=yes
```

**Check command:**
```bash
asterisk -rx "pjsip show endpoint 214" | grep -E "webrtc|media_encryption|use_avpf|ice_support|rtcp_mux"
```
Expected values:
- `webrtc: yes`
- `media_encryption: dtls`
- `use_avpf: true`
- `ice_support: true`
- `rtcp_mux: true`

### Layer 2 — PJSIP auth record (password must match CRM DB)
```bash
asterisk -rx "pjsip show auth 214-auth" | grep password
```
The `password` value must match `TelephonyExtension.sipPassword` in the CRM PostgreSQL DB for that extension. If they differ, registration fails silently.

**Check CRM side:**
```sql
SELECT extension, "sipPassword" FROM "TelephonyExtension" WHERE extension = '214';
```

### Layer 3 — Queue membership
Extension must be a member of the operator queue (804 in this deployment):
```bash
asterisk -rx "queue show 804" | grep 214
```
Expected: `Local/214@from-queue/n ... (ringinuse enabled) (Not in use)` — the exact "Not in use" status shows it's eligible to ring.

### Layer 4 — ASTDB entries (**THIS WAS THE BROKEN LAYER**)
These are what the FreePBX dialplan reads at runtime to build the dial string. Without them, the queue returns `NOANSWER` with empty `DEVICES=`.

Every extension needs these entries:

**`DEVICE/<ext>/*`** — tells the dialplan which technology and endpoint to dial
```bash
asterisk -rx "database show DEVICE/214"
```
Expected 5 entries:
```
/DEVICE/214/default_user : 214
/DEVICE/214/dial         : PJSIP/214
/DEVICE/214/tech         : pjsip
/DEVICE/214/type         : fixed
/DEVICE/214/user         : 214
```

**`AMPUSER/<ext>/device`** — maps the user to the device
```
/AMPUSER/214/device      : 214
```

**`AMPUSER/<ext>/hint`** — critical: must include `PJSIP/<ext>&` at the start
```
/AMPUSER/214/hint        : PJSIP/214&Custom:DND214,CustomPresence:214
```
If the hint is `&Custom:DND214,CustomPresence:214` **without** the `PJSIP/214&` prefix, inbound calls from the queue will fail.

**`AMPUSER/<ext>/cidname` + `/cidnum`** — caller ID shown on outbound
```
/AMPUSER/214/cidname     : Mariam Malichava
/AMPUSER/214/cidnum      : 214
```

**`AMPUSER/<ext>/followme/*`** — followme routing (required for inbound ringing through queue)
```
/AMPUSER/214/followme/grplist   : 214
/AMPUSER/214/followme/postdest  : ext-local,214,dest
/AMPUSER/214/followme/strategy  : ringallv2-prim
/AMPUSER/214/followme/grpconf   : DISABLED
/AMPUSER/214/followme/ddial     : EXTENSION
/AMPUSER/214/followme/changecid : default
/AMPUSER/214/followme/grptime   : 20
/AMPUSER/214/followme/prering   : 7
/AMPUSER/214/followme/ringing   : Ring
```

### Layer 5 — CRM's `TelephonyExtension` row
The CRM backend's `auto-sync` service checks extensions every 5 min and auto-links new ones. But for auto-link to work, the record needs `sipServer` and `sipPassword` populated (non-null). See `SIP password backfill` note in the main CLAUDE.md — fixed in PR #239.

---

## How to create a new extension correctly

**Always use the FreePBX web GUI.** This is the only path that populates all 5 layers in one pipeline.

1. Log into FreePBX: `https://<asterisk-host>/admin`
2. **Applications → Extensions → Add Extension**
3. Choose "Chan_PJSIP" (not chan_sip)
4. Fill in:
   - User Extension (e.g. `215`)
   - Display Name (e.g. `Employee Name`)
   - SIP Alias: (leave blank)
   - Outbound CID: (optional)
   - Secret: generate a strong random password — **copy this immediately, you can't see it later**
5. On the **Advanced** tab:
   - `Transport`: `0.0.0.0-wss`
   - `Enable AVPF`: Yes
   - `Enable Encryption`: Yes
   - `Enable ICE Support`: Yes
   - `Enable RTCP Mux`: Yes
   - `Enable WebRTC defaults`: Yes (this is a one-click convenience that sets several WebRTC flags)
6. **Submit** → **Apply Config**
7. Add the extension to queue 804 (or whatever queue the operator should be in) via **Applications → Queues → 804 → Queue Members**
8. On the CRM side, the next auto-sync cycle (within 5 minutes) will create the `TelephonyExtension` row and backfill `sipServer`/`sipPassword`. Verify:
   ```sql
   SELECT extension, "displayName", "sipServer", "sipPassword" IS NOT NULL as has_password
   FROM "TelephonyExtension" WHERE extension = '215';
   ```

## How to verify an existing extension is OK

Run this script on the Asterisk host (replace `EXT=214` with the extension you're checking):

```bash
EXT=214
echo "=== PJSIP endpoint ==="
asterisk -rx "pjsip show endpoint $EXT" | grep -E "webrtc|media_encryption|use_avpf|ice_support"

echo ""
echo "=== Auth password exists? ==="
asterisk -rx "pjsip show auth ${EXT}-auth" | grep password

echo ""
echo "=== Queue member? ==="
asterisk -rx "queue show 804" | grep "/$EXT@"

echo ""
echo "=== ASTDB Device entries (expect 5) ==="
asterisk -rx "database show DEVICE/$EXT" | grep -c "^/DEVICE"

echo ""
echo "=== ASTDB Hint (must include PJSIP/$EXT&) ==="
asterisk -rx "database get AMPUSER/$EXT hint"

echo ""
echo "=== Can dialplan build dial string? ==="
asterisk -rx "core show channels" > /dev/null  # reload
asterisk -rx "dialplan show dstring@macro-dial-one" | grep -A1 "Set(DEVICES=\${DB(AMPUSER/\${DEXTEN}/device)})" | head -3
```

If any check fails, the extension needs re-saving via the FreePBX GUI.

---

## Known issue: CLI `database put` is not persistent

Per CLAUDE.md: when someone clicks "Apply Config" in FreePBX, config files and potentially ASTDB get regenerated from FreePBX's MySQL tables. If the MySQL rows for an extension were incomplete when it was created (which is what happened here), Apply Config will re-write the bad config.

**The permanent fix** is to re-save each of the 8 extensions in the FreePBX GUI one time:
1. Applications → Extensions → click extension 206 → scroll down → Submit → Apply Config
2. Repeat for 208, 209, 210, 211, 212, 213, 214

This triggers FreePBX to write the MySQL rows correctly, which means future Apply Config calls won't wipe the ASTDB entries.
