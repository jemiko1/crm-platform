# ENVIRONMENT_AUDIT.md — CRM28 Development Environment

> Generated: 2026-03-24 | Machine: Jemiko-3070 (Windows 10)
> **DO NOT COMMIT** — contains infrastructure details

---

## 1. Local Machine CLIs

| Tool | Version | Installed | Purpose in Project |
|------|---------|-----------|-------------------|
| **gh** (GitHub CLI) | 2.87.3 | Yes | Create PRs, manage issues, repo operations (`gh pr create`, `gh pr list`) |
| **railway** | 4.30.5 | Yes | Deploy management, logs, env vars (`railway status`, `railway logs`) |
| **ssh** (OpenSSH) | OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2 | Yes | SSH into Asterisk/FreePBX server for telephony config |
| **docker** | 29.1.3 | Yes | Runs local PostgreSQL (`crm-prod-db` container on port 5433) |
| **node** | 24.12.0 | Yes | Runtime for backend (NestJS), frontend (Next.js), AMI Bridge |
| **pnpm** | 10.27.0 | Yes | Package manager for both backend and frontend |
| **npm** | 11.6.2 | Yes | Available as fallback; pnpm preferred |
| **npx** | 11.6.2 | Yes | Run Prisma CLI, tsx scripts, one-off commands |
| **git** | 2.52.0.windows.1 | Yes | Version control, branch management |
| **psql** | — | **NOT installed** | PostgreSQL CLI client not available locally. DB access is via Prisma or Docker exec only |

---

## 2. Remote Server Access

### Asterisk / FreePBX Server

| Property | Value |
|----------|-------|
| IP | `5.10.34.153` |
| SSH Port | 22 (default) |
| SSH User | `root` |
| Auth | SSH key (ed25519) — see SSH section below |
| VPN Required | **Yes** — OpenVPN must be connected to reach this IP |
| Purpose | FreePBX 16 / Asterisk PBX — handles all telephony (SIP trunks, queues, call routing) |
| AMI Port | 5038 (TCP) — AMI Bridge connects here |
| ARI Port | 8088 (HTTP) — REST interface for call control |

**How to connect:**
```powershell
# Ensure OpenVPN is connected first
ssh root@5.10.34.153
```

### AMI Bridge

| Property | Value |
|----------|-------|
| Runs on | A Windows VM on the same private network as Asterisk |
| Connects to | Asterisk AMI on port 5038 |
| Posts to | Railway CRM backend (`POST /v1/telephony/events`) |
| Runtime | Node.js + PM2 (production), or `pnpm dev` (development) |
| Code location | `ami-bridge/` in this repo |

**How to restart (on the VM):**
```bash
pm2 restart ami-bridge
# or
pm2 stop ami-bridge && pm2 start dist/main.js --name ami-bridge
```

**AMI Bridge .env requires:**
- `AMI_HOST` — Asterisk server IP (private network)
- `AMI_PORT` — 5038
- `AMI_USER` / `AMI_SECRET` — AMI credentials
- `CRM_BASE_URL` — Railway production backend URL
- `TELEPHONY_INGEST_SECRET` — must match Railway env

### Railway (Production Hosting)

| Property | Value |
|----------|-------|
| Auth | Logged in as `Jemiko Bodokia` (j.bodokia@gmail.com) |
| Token storage | Railway CLI manages its own token (`railway login` via browser OAuth) |
| Linked project | **CRM28**, environment: **production**, service: **crm-backend** |
| Deploy trigger | Auto-deploy on push to `master` branch |
| How to access | `railway status`, `railway logs`, `railway variables` |

**Common Railway commands:**
```powershell
railway status              # Current project/service/environment
railway logs                # Stream production logs
railway variables           # List env vars (redacted)
railway shell               # Open shell in production container
railway up                  # Manual deploy (rarely needed — auto-deploys from master)
```

### Production Database

| Property | Value |
|----------|-------|
| Provider | Railway-managed PostgreSQL |
| Access | Via Railway: `railway connect postgres` or through the Railway dashboard |
| Direct connection | Not exposed publicly. Use Railway proxy or dashboard SQL editor |
| Local equivalent | Docker `crm-prod-db` on `localhost:5433` |
| No psql locally | `psql` is not installed. Use `npx prisma studio` or `docker exec -it crm-prod-db psql -U postgres` for local DB access |

---

## 3. SSH Configuration

### Key Files

| File | Exists | Details |
|------|--------|---------|
| `C:\Users\Geekster PC\.ssh\id_ed25519` | Yes (464 bytes) | Private key — created 2026-03-01 |
| `C:\Users\Geekster PC\.ssh\id_ed25519.pub` | Yes (104 bytes) | Public key: `ssh-ed25519 AAAAC3...mjti jemiko-pc@Jemiko-3070` |
| `C:\Users\Geekster PC\.ssh\config` | **No** | No SSH config file exists. Connections use default settings. |
| `C:\Users\Geekster PC\.ssh\known_hosts` | Yes (187 bytes) | Contains 2 hosts — see below |
| `C:\Users\Geekster PC\.ssh\id_rsa` | **No** | No RSA key present. Only ed25519. |

### Known Hosts

| Host | Key Type |
|------|----------|
| `5.10.34.153` | ssh-ed25519 (Asterisk/FreePBX server) |
| `github.com` | ssh-ed25519 |

### PuTTY

No PuTTY saved sessions found in registry (`HKCU:\SOFTWARE\SimonTatham\PuTTY\Sessions` does not exist).

### Recommendation: Create SSH Config

Currently there's no `~/.ssh/config`. Creating one would simplify connections for Claude Code:

```
# C:\Users\Geekster PC\.ssh\config
Host asterisk
    HostName 5.10.34.153
    User root
    IdentityFile ~/.ssh/id_ed25519
    Port 22
```

Then: `ssh asterisk` instead of `ssh root@5.10.34.153`.

---

## 4. VPN Setup

### OpenVPN

| Property | Value |
|----------|-------|
| Software | OpenVPN (GUI + service) |
| Service status | **Running** (`OpenVPNServiceInteractive`) |
| Processes | `openvpn` (PID 19288), `openvpn-gui` (PID 14676), `openvpnserv` (PID 4636) |
| TAP adapter | `OpenVPN TAP-Windows6` — **Status: Up** |
| Wintun adapter | `OpenVPN Wintun` — Status: Disconnected (not used) |
| VPN assigned IP | `80.83.142.132/28` (subnet `80.83.142.128/28`) |
| Gateway | `80.83.142.129` |
| Connection type | **Always-on** (TAP adapter is Up, routes are active) |

### VPN Config Files

**Active profile:**
- `C:\Users\Geekster PC\OpenVPN\config\GN-VPN-UDP4-1194-jemiko-config-MostCLients\GN-VPN-UDP4-1194-jemiko-config-MostCLients.ovpn` (5,224 bytes)
- Protocol: UDP, port 1194 (based on filename)

**Legacy/backup profiles in `C:\Program Files\OpenVPN\config\`:**
- `ASG\` — contains `ASG.ovpn`, CA cert, client cert, client key
- `ASG2\` — contains `client.ovpn`, CA cert, client cert+key, DH params, TLS auth key

### VPN Behavior

The VPN tunnels traffic through `80.83.142.129` and provides access to the private network where the Asterisk server (`5.10.34.153`) resides. The OpenVPN GUI runs at startup and the connection appears to be always-on (TAP adapter is Up with an assigned IP and active routes).

---

## 5. Credentials & Tokens

> **No actual secrets are listed below — only locations and purposes.**

### GitHub

| Item | Location | Purpose |
|------|----------|---------|
| GitHub token | Windows Credential Manager (keyring) | `gh` CLI auth for `jemiko1` account |
| Token scopes | — | `gist`, `read:org`, `repo` |
| Git credential helper | `manager` (Windows Credential Manager) | HTTPS push/pull authentication |
| Git protocol | HTTPS | All git operations use HTTPS (not SSH) |

### Railway

| Item | Location | Purpose |
|------|----------|---------|
| Railway token | Railway CLI internal storage | Auth for `railway` commands. Logged in via browser OAuth as `j.bodokia@gmail.com` |

### SSH Keys

| Item | Location | Purpose |
|------|----------|---------|
| Private key (ed25519) | `C:\Users\Geekster PC\.ssh\id_ed25519` | SSH into Asterisk server (`root@5.10.34.153`) |
| Public key | `C:\Users\Geekster PC\.ssh\id_ed25519.pub` | Deployed to Asterisk server's `authorized_keys` |

### VPN Certificates

| Item | Location | Purpose |
|------|----------|---------|
| Active VPN config + certs | `C:\Users\Geekster PC\OpenVPN\config\GN-VPN-*\` | OpenVPN connection to private network |
| Legacy ASG VPN | `C:\Program Files\OpenVPN\config\ASG\` | Client cert + key + CA |
| Legacy ASG2 VPN | `C:\Program Files\OpenVPN\config\ASG2\` | Client cert + key + CA + TLS auth |

### Backend Environment Variables (secrets)

| Item | Location | Purpose |
|------|----------|---------|
| DATABASE_URL | `backend/crm-backend/.env` | PostgreSQL connection string (local) |
| JWT_SECRET | `backend/crm-backend/.env` | JWT signing key |
| VIBER_BOT_TOKEN | `backend/crm-backend/.env` | Viber bot for client chats |
| FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET | `backend/crm-backend/.env` | Facebook Messenger integration |
| TELEGRAM_BOT_TOKEN | `backend/crm-backend/.env` | Telegram bot for client chats |
| AMI credentials | `backend/crm-backend/.env` | AMI_USER, AMI_SECRET for Asterisk |
| ARI credentials | `backend/crm-backend/.env` | ARI_USER, ARI_PASSWORD for Asterisk REST |
| OPENAI_API_KEY | `backend/crm-backend/.env` | GPT-4o / Whisper for call quality reviews |
| TELEPHONY_INGEST_SECRET | `backend/crm-backend/.env` | Shared secret for AMI Bridge → CRM auth |

### AMI Bridge Environment Variables (secrets)

| Item | Location | Purpose |
|------|----------|---------|
| AMI_HOST, AMI_SECRET | `ami-bridge/.env` (on VM) | Asterisk AMI connection |
| CRM_BASE_URL | `ami-bridge/.env` (on VM) | Railway backend URL |
| TELEPHONY_INGEST_SECRET | `ami-bridge/.env` (on VM) | Must match backend value |

---

## 6. Network Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERNET                                    │
│                                                                     │
│   ┌──────────────┐         ┌──────────────────┐                     │
│   │   GitHub     │         │   Railway         │                    │
│   │  (jemiko1)   │         │  (CRM28 project)  │                    │
│   │              │         │                    │                    │
│   │  Repo:       │  auto   │  crm-backend      │                    │
│   │  crm-platform├────────▶│  crm-frontend     │                    │
│   │              │  deploy  │  PostgreSQL (prod) │                    │
│   └──────┬───────┘         └────────▲───────────┘                    │
│          │                          │                                │
│          │ HTTPS (push/pull)        │ HTTPS POST                     │
│          │                          │ /v1/telephony/events            │
└──────────┼──────────────────────────┼────────────────────────────────┘
           │                          │
           │                          │
┌──────────┼──────────────────────────┼────────────────────────────────┐
│          │           LOCAL PC       │      (Jemiko-3070)             │
│  ┌───────▼──────────────────────────┴──────────────────────────┐     │
│  │                                                              │    │
│  │  C:\CRM-Platform                                             │    │
│  │  ├── backend (NestJS, port 3000)                             │    │
│  │  ├── frontend (Next.js, port 4002)                           │    │
│  │  ├── ami-bridge (code, not running locally)                  │    │
│  │  └── crm-phone (Electron softphone)                          │    │
│  │                                                              │    │
│  │  Docker: crm-prod-db (PostgreSQL 16, port 5433)              │    │
│  │                                                              │    │
│  └──────────────────────────────────────────────────────────────┘    │
│          │                                                           │
│          │ OpenVPN TAP (UDP 1194)                                    │
│          │ VPN IP: 80.83.142.132/28                                  │
│          │ Gateway: 80.83.142.129                                    │
│          │                                                           │
└──────────┼───────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PRIVATE NETWORK (via VPN)                          │
│                                                                      │
│  ┌──────────────────────────┐     ┌──────────────────────────┐       │
│  │  Asterisk / FreePBX 16   │     │  Windows VM              │       │
│  │  IP: 5.10.34.153         │     │  (AMI Bridge host)       │       │
│  │                          │     │                          │       │
│  │  SSH: port 22 (root)     │     │  Runs: ami-bridge        │       │
│  │  AMI: port 5038 (TCP)    │────▶│  (Node.js + PM2)         │       │
│  │  ARI: port 8088 (HTTP)   │     │                          │       │
│  │  SIP: PJSIP (UDP/TCP)    │     │  Posts events to         │       │
│  │                          │     │  Railway backend ────────────────┘
│  │  Call recordings stored   │     │                          │
│  │  in /var/spool/asterisk/  │     └──────────────────────────┘
│  │  monitor/                 │
│  └──────────────────────────┘
│
└──────────────────────────────────────────────────────────────────────┘
```

### Connection Summary

| From | To | Protocol | Port | Auth | VPN Required |
|------|----|----------|------|------|-------------|
| Local PC | GitHub | HTTPS | 443 | Token (keyring) | No |
| Local PC | Railway | HTTPS | 443 | OAuth token | No |
| Local PC | Asterisk | SSH | 22 | ed25519 key | **Yes** |
| Local PC | Local PostgreSQL | TCP | 5433 | password (in .env) | No |
| AMI Bridge (VM) | Asterisk AMI | TCP | 5038 | AMI user/secret | Same network |
| AMI Bridge (VM) | Railway backend | HTTPS | 443 | Ingest secret header | No |
| CRM Phone (Electron) | Asterisk SIP | UDP/TCP | 5060/5061 | SIP credentials | **Yes** |
| GitHub | Railway | Webhook | 443 | Auto (Railway integration) | No |
