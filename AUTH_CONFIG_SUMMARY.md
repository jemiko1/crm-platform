# Authentication & CORS Configuration Summary

## CORS Configuration

**Location**: `backend/crm-backend/src/main.ts`

```typescript
app.enableCors({
  origin: "http://localhost:3002",
  credentials: true,
});
```

- **Origin**: `http://localhost:3002` (single origin, hardcoded)
- **Credentials**: `true` (required for cookie-based auth)

---

## Cookie Configuration

**Location**: `backend/crm-backend/src/auth/auth.controller.ts`

### Cookie Name
```typescript
const cookieName = process.env.COOKIE_NAME ?? "access_token";
```
- **Default**: `"access_token"`
- **Environment Variable**: `COOKIE_NAME`

### Cookie Flags (Login Endpoint)
```typescript
res.cookie(cookieName, accessToken, {
  httpOnly: true,
  sameSite: "lax",
  secure,  // from env: COOKIE_SECURE (default: false)
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
});
```

**Cookie Settings**:
- `httpOnly`: `true` (prevents JavaScript access)
- `sameSite`: `"lax"` (CSRF protection)
- `secure`: Dynamic from `process.env.COOKIE_SECURE` (default: `false`)
  - Set `COOKIE_SECURE=true` for HTTPS-only cookies
- `path`: `"/"` (available site-wide)
- `maxAge`: `604800000` ms = **7 days**

### Cookie Clear (Logout Endpoint)
```typescript
res.clearCookie(cookieName, { path: "/", sameSite: "lax", secure });
```

---

## Ports

### Backend
```typescript
await app.listen(process.env.PORT ?? 3000);
```
- **Default**: `3000`
- **Environment Variable**: `PORT`

### Frontend
**Location**: `frontend/crm-frontend/package.json`
```json
"dev": "next dev -p 3002",
"start": "next start -p 3002"
```
- **Port**: `3002` (hardcoded in scripts)

---

## Global Prefix

**Status**: ❌ **No global prefix set**

- No `app.setGlobalPrefix()` call in `main.ts`
- Routes are organized via module-level `@Controller()` decorators
- Example: `@Controller("auth")` → `/auth/*`
- Example: `@Controller("v1/positions")` → `/v1/positions/*`
- V1 API routes use `/v1/*` prefix at controller level, not globally

---

## Summary Table

| Setting | Value |
|---------|-------|
| **CORS Origin** | `http://localhost:3002` |
| **CORS Credentials** | `true` |
| **Cookie Name** | `access_token` (env: `COOKIE_NAME`) |
| **Cookie httpOnly** | `true` |
| **Cookie secure** | `false` (env: `COOKIE_SECURE`) |
| **Cookie sameSite** | `"lax"` |
| **Cookie path** | `"/"` |
| **Cookie maxAge** | `604800000` ms (7 days) |
| **Backend Port** | `3000` (env: `PORT`) |
| **Frontend Port** | `3002` |
| **Global Prefix** | None |

---

## Environment Variables

```bash
# Optional - defaults shown
COOKIE_NAME=access_token
COOKIE_SECURE=false  # Set to "true" for HTTPS-only
PORT=3000
```
