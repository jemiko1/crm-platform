# Railway Production Deployment Plan — crm28.asg.ge

This guide covers deploying the CRM to production on Railway with domain **crm28.asg.ge**.

---

## 1. Prerequisites

- Railway account
- Domain `crm28.asg.ge` (or subdomain) pointed to Railway
- Git branch: merge your changes to `staging` or `master` per your workflow

---

## 2. Railway Project Structure

| Service    | Root Directory       | Build Command                                      | Start Command     |
|------------|----------------------|----------------------------------------------------|-------------------|
| **postgres** | — (plugin)          | —                                                  | —                 |
| **backend**  | `backend/crm-backend` | `pnpm install --frozen-lockfile && pnpm build`     | `pnpm start:railway` |
| **frontend** | `frontend/crm-frontend` | `pnpm install --frozen-lockfile && pnpm build`   | `pnpm start`      |

---

## 3. Domain & URL Configuration

For **crm28.asg.ge** you have two common setups:

### Option A: Single domain (frontend + API on same host)

- Frontend: `https://crm28.asg.ge`
- API: `https://crm28.asg.ge` (via Next.js rewrites to backend)

**Backend env:**
```
CLIENTCHATS_WEBHOOK_BASE_URL=https://crm28.asg.ge
CORS_ORIGINS=https://crm28.asg.ge
```

**Frontend env:**
```
API_BACKEND_URL=https://crm28.asg.ge
```

### Option B: Separate API subdomain (recommended for webhooks)

- Frontend: `https://crm28.asg.ge`
- API: `https://api.crm28.asg.ge`

**Backend env:**
```
CLIENTCHATS_WEBHOOK_BASE_URL=https://api.crm28.asg.ge
CORS_ORIGINS=https://crm28.asg.ge
```

**Frontend env:**
```
API_BACKEND_URL=https://api.crm28.asg.ge
NEXT_PUBLIC_API_BASE=https://api.crm28.asg.ge
```

---

## 4. Backend Environment Variables

| Variable | Production value | Notes |
|----------|------------------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference Railway Postgres |
| `JWT_SECRET` | (64+ char random string) | Unique per environment |
| `JWT_EXPIRES_IN` | `15m` or `24h` | Token lifetime |
| `CORS_ORIGINS` | `https://crm28.asg.ge` | Frontend origin(s) |
| `COOKIE_SECURE` | `true` | Required in production |
| `CLIENTCHATS_WEBHOOK_BASE_URL` | `https://api.crm28.asg.ge` or `https://crm28.asg.ge` | Public backend URL for webhooks |

### Optional (Client Chats channels)

| Variable | When used |
|----------|-----------|
| `TELEGRAM_BOT_TOKEN` | Telegram |
| `VIBER_BOT_TOKEN` | Viber |
| `FB_PAGE_ACCESS_TOKEN` | Facebook Messenger |
| `FB_APP_SECRET` | Facebook / WhatsApp |
| `FB_VERIFY_TOKEN` | Facebook / WhatsApp |
| `WA_ACCESS_TOKEN` | WhatsApp Business |
| `WA_PHONE_NUMBER_ID` | WhatsApp Business |
| `WA_VERIFY_TOKEN` | WhatsApp webhook |
| `WA_APP_SECRET` | WhatsApp signature verification |

---

## 5. Frontend Environment Variables

| Variable | Production value |
|----------|------------------|
| `API_BACKEND_URL` | `https://api.crm28.asg.ge` (or `https://crm28.asg.ge` if same host) |
| `NEXT_PUBLIC_API_BASE` | Same as `API_BACKEND_URL` if used |
| `PORT` | (Railway sets automatically) |

---

## 6. Deployment Steps

### Step 1: Merge and push

```bash
git checkout dev
git pull
# Ensure all changes are committed
git push origin dev
# Merge to staging or master per your workflow
```

### Step 2: Railway dashboard

1. Open your Railway project.
2. Confirm Postgres, backend, and frontend services exist.
3. Add custom domains:
   - Frontend: `crm28.asg.ge`
   - Backend (if separate): `api.crm28.asg.ge`

### Step 3: Set environment variables

1. **Backend**  
   Set all variables from Section 4.  
   Set `CLIENTCHATS_WEBHOOK_BASE_URL` to the public backend URL.

2. **Frontend**  
   Set `API_BACKEND_URL` (and `NEXT_PUBLIC_API_BASE` if used) to the backend URL.

### Step 4: Deploy

1. Deploy **backend** first (runs `prisma migrate deploy`).
2. Deploy **frontend** after backend is up.
3. Check logs for both services.

### Step 5: Re-register webhooks

After deploy, webhook URLs change. In **Admin → Client Chats Configuration**:

1. **Telegram**: Click **Register Webhook**.
2. **Viber**: Click **Register Webhook**.
3. **Facebook**: Update webhook URL in Meta Developer Console.
4. **WhatsApp**: Update webhook URL in Meta Developer Console.

---

## 7. Webhook URLs (production)

| Channel | Webhook path | Full URL |
|---------|--------------|----------|
| Telegram | `/public/clientchats/webhook/telegram` | `{CLIENTCHATS_WEBHOOK_BASE_URL}/public/clientchats/webhook/telegram` |
| Viber | `/public/clientchats/webhook/viber` | `{CLIENTCHATS_WEBHOOK_BASE_URL}/public/clientchats/webhook/viber` |
| Facebook | `/public/clientchats/webhook/facebook` | `{CLIENTCHATS_WEBHOOK_BASE_URL}/public/clientchats/webhook/facebook` |
| WhatsApp | `/public/clientchats/webhook/whatsapp` | `{CLIENTCHATS_WEBHOOK_BASE_URL}/public/clientchats/webhook/whatsapp` |

---

## 8. Post-deploy checklist

- [ ] Backend health check responds
- [ ] Frontend loads at `https://crm28.asg.ge`
- [ ] Login works
- [ ] Client Chats page loads
- [ ] Admin → Client Chats Config shows connection status for each channel
- [ ] Webhooks re-registered (Telegram, Viber)
- [ ] Meta webhooks updated (Facebook, WhatsApp)
- [ ] Test message received in Client Chats

---

## 9. Troubleshooting

| Issue | Action |
|-------|--------|
| CORS errors | Ensure `CORS_ORIGINS` includes `https://crm28.asg.ge` |
| Webhooks not receiving | Check `CLIENTCHATS_WEBHOOK_BASE_URL` and re-register webhooks |
| 502 Bad Gateway | Check backend logs; ensure migrations ran |
| API 404 | Confirm `API_BACKEND_URL` and Next.js rewrites |

---

## 10. Migration note

The new `WHATSAPP` channel adds a migration. It runs automatically on deploy via `pnpm start:railway` (`prisma migrate deploy`).
