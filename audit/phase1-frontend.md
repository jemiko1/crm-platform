# Phase 1 — Frontend Operator/Manager UX Audit

Scope: frontend surfaces used by Operators and Managers on Monday — `/app/call-center/**`, `/app/client-chats/**`, global floating messenger, softphone bridge hook. Read-only audit. Cross-referenced with INVENTORY.md §4, THREAT_MODEL.md §10 (F1–F6), KNOWN_FINDINGS_CARRIED_FORWARD.md (#4, #51–#57).

Verified at commit `33de993` on branch `fix/telephony-deep-fix`. Frontend typecheck (`pnpm typecheck`) passes with no errors.

---

## Summary table

| # | Check | Verdict | Severity | Fix scope (before Monday?) |
|---|---|---|---|---|
| 1 | Inline modals in conversation-header.tsx (F2 / #55) | **FIXED** | — | No action — already uses `createPortal` |
| 2 | Raw `fetch()` callers (F3 / #4) | **PARTIAL** | P2 | Not P0; 5 remaining callers are bridge/login (all intentional) but missing 401 handling in two of them |
| 3 | 10-min inactivity alert timing (F4) | **STILL PRESENT** | P2 | UX bug — timer fires on operator's "last sent" regardless of whether they're typing |
| 4 | Socket + polling dedup with missing ID (F5) | **STILL PRESENT** | P2 | Edge-case risk on WebChat without `id`; low real-world probability |
| 5 | Date/time formatting without locale (F6 / #57) | **PARTIAL** | P3 | `call-report-modal.tsx:225`, `reports/page.tsx:194`, `message-bubble.tsx:92`, `conversation-panel.tsx:320` use empty/no locale |
| 6 | Permission guards on call-center routes (#51) | **FIXED** | — | Layout wraps all children in `<PermissionGuard permission="call_center.menu">` and gates per-tab via `canAccessCurrentTab` |
| 7 | Call-center layout tab wiring (F1-adjacent) | **OK** | — | All tabs have permission strings; `visibleTabs` filter hides hrefs from DOM |
| 8 | Client-chats manager view toggle | **OK** | — | Toggle only renders when `hasPermission("client_chats.manage")`; backend enforces permission on Manager endpoints independently |
| 9 | Softphone localhost bridge | **STILL PRESENT** | **P1** | **CORS substring check on `"localhost"` is spoofable**; bridge `/dial` has no CSRF; `/status` leaks user name/extension to any same-host process |
| 10 | Permission cache staleness | **STILL PRESENT** | P2 | Cache is module-global; admin change requires logout/login to take effect |
| 11 | Call report modal deep-link `?openReport=true` | **OK** | — | Harmless UI state — just opens modal; modal itself is gated by `call_center.reports` |
| 12 | Error boundaries | **OK** | — | `error.tsx` exists at `/app/app`, `/app/app/call-center`, `/app/app/client-chats` — Next.js App Router catches render throws per-segment |
| 13 | TypeScript errors | **OK** | — | `pnpm typecheck` passes clean |
| 14 | Send-failure UX in reply-box | **OK (partial UX)** | P3 | Text stays in input on error; no toast, no retry indicator |

**P0 blockers for Monday:** None in frontend scope.
**P1 ship-stopper candidate:** #9 Softphone bridge CORS-spoofing + no CSRF on `/dial`. Confirm with owner whether phishing-via-localhost is in threat model.
**P2 fix-by-next-week list:** #3, #4, #5, #10.

---

## 1. F2 / #55 — Inline modals in `conversation-header.tsx`

**Evidence:** `frontend/crm-frontend/src/app/app/client-chats/components/conversation-header.tsx`
- Line 4: `import { createPortal } from "react-dom";`
- Line 30–31: `const [mounted, setMounted] = useState(false); useEffect(() => { setMounted(true); }, []);`
- Line 340: reopen modal wrapped in `{mounted && showReopenModal && createPortal(... , document.body)}`, closing on line 374
- Line 377: delete-confirm modal wrapped in `{mounted && showDeleteConfirm && createPortal(... , document.body)}`, closing on line 404

The line numbers referenced in the finding (336, 372) now map to the closing `)}` of the "Link Client" inline popover (a small dropdown with a search input, not a modal — this is a popover attached to a button, z-20, acceptable).

**Verdict:** **FIXED.** Both real modals (reopen, delete) already use `createPortal` with mount-guard and z-`50000`, matching the CLAUDE.md convention. The remaining inline elements (showAssign @ L248, showLink @ L313) are popovers/dropdowns, not modals — correct pattern.

**Regression test:** Cypress or Playwright — open a conversation with a reopen-request pending, click "Approve Reopen" and confirm the modal renders over the page sidebar with backdrop, then click outside to dismiss.

---

## 2. F3 / #4 — Raw `fetch()` callers

**Evidence:** `Grep "fetch(" frontend/crm-frontend/src`.

In `*.tsx`:
| File | Line | Purpose | 401 handled? | 204 handled? | credentials? |
|---|---|---|---|---|---|
| `app/login/page.tsx` | 60 | `GET ${BRIDGE_URL}/status` | N/A — softphone bridge, no JWT | N/A | no credentials needed |
| `app/login/page.tsx` | 83 | `POST ${BRIDGE_URL}/switch-user` | N/A | N/A | no credentials needed |
| `app/login/page.tsx` | 105 | `POST ${API_BASE}/auth/login` | N/A — login page itself, no redirect loop | OK (body parsed) | **includes `credentials: "include"`** — verify inline |
| `components/click-to-call.tsx` | 24 | `POST ${BRIDGE_URL}/dial` | N/A | N/A | none |
| `app/app/header-settings.tsx` | 34 | `GET ${BRIDGE_URL}/status` | N/A | N/A | none |

In `*.ts`:
| File | Line | Purpose | 401 handled? | 204 handled? | credentials? |
|---|---|---|---|---|---|
| `hooks/useDesktopPhone.ts` | 34, 71, 88 | Bridge status/switch/dial | N/A | N/A | no |
| `lib/api.ts` | 73, 96 | Central wrapper | **Yes** — `handleResponse` redirects to `/login?expired=1&next=...` on 401 | **Yes** — non-JSON → `undefined as T` | **Yes** — `credentials: "include"` |

**Finding:** Only 5 raw `fetch()` callers remain in scope — all are intentional (softphone localhost bridge + login page bootstrap). The "~37" number in the historical finding is stale; the migration to `apiGet/apiPost` is complete for all application code.

**Verdict:** **PARTIAL (effectively FIXED for operator/manager flows).** All call-center and client-chats UI runs through `apiGet/apiPost`, which handles 401 redirect and 204 empties. Bridge fetches are correctly bypassing the JWT cookie.

**Gap:** `app/login/page.tsx:105` does not parse 204 correctly if the backend ever returns empty login response (it expects JSON). Low risk — backend always returns `{ user, ... }`.

**Regression test:** Kill backend while client-chats is open, send a reply, confirm browser navigates to `/login?expired=1&next=/app/client-chats`. Also: delete session cookie in DevTools, click any button, confirm redirect.

---

## 3. F4 — 10-minute inactivity alert timer

**Evidence:** `conversation-panel.tsx:93–113`
```tsx
useEffect(() => {
  if (!conversation || conversation.status !== "LIVE") return;
  if (!messages.length) return;
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg) return;
  if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
  setShowInactivityAlert(false);
  if (lastMsg.direction === "OUT") {
    inactivityTimerRef.current = setTimeout(() => {
      setShowInactivityAlert(true);
    }, 10 * 60 * 1000);
  }
  return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
}, [messages, conversation]);
```

The effect fires when `messages` changes. Timer arms only when `lastMsg.direction === "OUT"` — i.e., only after the operator sends. That part is correct per THREAT_MODEL F4 description.

**But:** If the operator is typing a long reply and takes more than 10 minutes to hit Send, the timer will NOT fire during typing — because `lastMsg` is still the last inbound OUT direction and the effect only re-arms on `messages` change. Actually — the previous send will arm the timer; if the operator sends a reply, then spends 10 minutes composing the next reply, the alert fires on the *previous* send. That's intended behavior ("10 minutes since your last reply"), but the UX reads as "alert while I'm still working."

**A worse edge case:** If the operator sends a reply, then drafts another message for 9 minutes 50 seconds, the alert will fire 10 seconds into reading it — interrupting them.

**Verdict:** **STILL PRESENT.** Algorithm is literal but the UX is bad. Recommend either (a) detect focus on the reply-box textarea and snooze the timer, or (b) use server-side `lastActivityAt` signals that include typing events.

**Fix scope:** Not a Monday blocker — operators can dismiss the alert. Document and defer.

**Regression test:** Open LIVE conversation, send a reply, wait 10 minutes without typing → alert appears with "Close? Wait more?" options. Then repeat with typing in the textarea — alert still fires (that's the bug).

---

## 4. F5 — Socket + polling dedup

**Evidence:** `conversation-panel.tsx:161–168`
```tsx
const handleNewMessage = (data: { conversationId: string; message: any }) => {
  if (data.conversationId !== conversationId) return;
  setMessages((prev) => {
    if (prev.some((m) => m.id === data.message.id)) return prev;
    return [...prev, data.message];
  });
  fetchConversation();
};
```

Dedup uses `prev.some(m => m.id === data.message.id)`.

**Edge case:** If `data.message.id` is `undefined` or `null` (e.g., a malformed socket payload, or a WebChat fallback path that emits before persistence), `some()` returns false and the message is appended. Next poll (every 5–15s) will return the persisted copy with a real ID, and dedup fails because the first copy has no ID. Result: duplicate in UI, both with the same text but one with `id = undefined`.

**In practice:** `clientchats-core.service.ts` follows `dedup → upsert → save → match → emit` per CLAUDE.md silent-override #11, so socket emissions always have a persisted ID. The edge case requires a bug in the backend emit path.

**Verdict:** **STILL PRESENT but low probability.** The dedup logic would benefit from a composite key fallback — e.g., `m.id === data.message.id || (m.sentAt === data.message.sentAt && m.direction === data.message.direction && m.body === data.message.body)`.

**Regression test:** Kill socket connection briefly during an inbound message burst, let polling pick up, restore socket — verify no duplicates in transcript.

---

## 5. F6 / #57 — Date formatting without locale arg

**Evidence from Grep** (in-scope call-center + client-chats only):

| File | Line | Call | Locale? |
|---|---|---|---|
| `call-center/callbacks/page.tsx` | 27 | `toLocaleString("en-GB", {...})` | Hard-coded EN-GB |
| `call-center/logs/page.tsx` | 62 | `toLocaleString("en-GB", {...})` | Hard-coded EN-GB |
| `call-center/missed/page.tsx` | 83 | `toLocaleString("en-GB", {...})` | Hard-coded EN-GB |
| `call-center/reports/call-report-modal.tsx` | 225 | `toLocaleTimeString()` | **No locale — uses browser default** |
| `call-center/reports/page.tsx` | 194 | `toLocaleDateString()` | **No locale — uses browser default** |
| `client-chats/components/conversation-panel.tsx` | 320 | `toLocaleDateString()` | **No locale — uses browser default** |
| `client-chats/components/message-bubble.tsx` | 92 | `toLocaleTimeString([], { hour, minute })` | Empty array → browser default |

**Finding:** Mixed policy — callbacks/logs/missed hard-code `"en-GB"` (stable but English), while reports pages and client-chats use browser default (locale drift, inconsistent with the rest of the surface). A Georgian operator will see `4/17/2026` in reports but `17 Apr` in logs — inconsistent.

**Verdict:** **STILL PRESENT.** P3 cosmetic, but visible to managers daily.

**Fix scope:** Centralize a `formatDate(iso, style)` utility that reads `language` from `useI18n()`. Replace all 4 raw calls. Not a Monday blocker.

**Regression test:** Switch language to Georgian in header settings → confirm all dates on call-center/reports, client-chats render in Georgian month names (or at least consistent format).

---

## 6. #51 — Permission guards on call-center routes

**Evidence:** `frontend/crm-frontend/src/app/app/call-center/layout.tsx`
- Line 46: entire children wrapped in `<PermissionGuard permission="call_center.menu">`
- Line 26–30: `visibleTabs = TABS.filter(...)` removes tab Link elements the user can't access — they don't render in the DOM at all
- Line 40–43: `canAccessCurrentTab` gates children rendering even for direct URL access (e.g., typing `/app/call-center/quality` without `call_center.quality`)
- Line 84–97: fallback "Insufficient Permissions" panel renders when current tab's permission fails

Individual page files (e.g., `call-center/reports/page.tsx:100`) additionally have inline `if (!permLoading && !hasPermission("call_center.reports"))` checks for defense in depth.

**Verdict:** **FIXED** per commit 0282280/eeda9b1. No Monday concern.

**Edge case — tab DOM visibility with OS keyboard TAB key:** `visibleTabs = TABS.filter(...)` removes unauthorized tabs from the `TABS.map()` entirely — they are not in the DOM. Tab-key keyboard navigation cannot reach hidden tabs because there is no `<Link>` element to tab to. Good.

**Regression test:** Login as an operator with only `call_center.statistics` and `call_center.live` → confirm only those two tabs visible, direct-URL to `/app/call-center/quality` shows the rose-colored "Insufficient Permissions" panel.

---

## 7. Call-center layout permission wiring

**Cross-check against INVENTORY.md §4.1:**

| Tab | Layout `permission` | INVENTORY.md required | Match? |
|---|---|---|---|
| Overview | `call_center.statistics` | `call_center.statistics` | Yes |
| Call Logs | `anyPermission: call_logs.{own,department,department_tree,all}` | `call_logs.{own,department,department_tree,all}` | Yes |
| Missed Calls | `missed_calls.access` | `missed_calls.access` | Yes |
| Live Monitor | `call_center.live` | `call_center.live` | Yes |
| Reports | `call_center.reports` | `call_center.reports` | Yes |
| Quality | `call_center.quality` | `call_center.quality` | Yes |
| Statistics | `call_center.statistics` | `call_center.statistics` | Yes |

No `agents` or `callbacks` entry in `TABS` array — INVENTORY.md notes those as TBD. **Gap confirmed:** `/app/call-center/callbacks` page exists (directory present, `callbacks/page.tsx` uses `toLocaleString` at line 27) but is not listed in `TABS`, so it has no tab-link and no per-page permission check derived from layout. Verify inside the page.

**Verdict:** **OK for primary tabs. Minor gap on callbacks page** — confirm it has its own inline permission check or is intentionally hidden.

**Regression test:** Audit `callbacks/page.tsx` for `hasPermission` or `PermissionGuard`; if missing, add.

---

## 8. Client-chats manager view toggle

**Evidence:** `client-chats/page.tsx:23`
```tsx
{isManager && (
  <div className="...">
    <button onClick={() => setView("inbox")}>Inbox</button>
    <button onClick={() => setView("dashboard")}>Manager Dashboard</button>
  </div>
)}
```

- Toggle renders only when `hasPermission("client_chats.manage")` is true.
- State `view` is only mutatable via these buttons — a non-manager cannot construct a `setView("dashboard")` call from their own UI.
- `ManagerDashboard` component rendered at line 102 is also only reachable when `view === "dashboard"` → set by same gated toggle.
- **Backend** — all Manager APIs (`/v1/clientchats/queue/*`) have `@RequirePermission("client_chats.manage")`. Even if a non-manager somehow rendered the dashboard (they can't via the UI), every API call returns 403. Defense in depth is in place.

**Verdict:** **OK.** No client-side-only bypass path.

**Regression test:** Login as non-manager operator, DevTools run `document.querySelectorAll('button')` looking for "Manager Dashboard" — confirm it's not in DOM.

---

## 9. Softphone polling bridge — `useDesktopPhone.ts`

**Evidence:** `hooks/useDesktopPhone.ts:7` polls `http://127.0.0.1:19876/status` every `60_000` ms.

### Bridge-down behavior
On `fetch` error (line 43–45): `setStatus(null)`, `appDetected = false`. No banner shown from this hook directly. The Manager-UI `header-settings.tsx:34–49` shows `detected: false` state in the user dropdown. The `click-to-call.tsx` component silently no-ops. **There is no global toast or banner warning the operator that the bridge is down.** An operator may click Dial repeatedly on a dead bridge without visual feedback beyond the button's lack of response.

### Security — localhost bridge
`crm-phone/src/main/local-server.ts` listens on `127.0.0.1:19876` only (not 0.0.0.0), so **remote** hosts cannot hit it. But **any local process on the same Windows machine** can:

**Finding A — CORS origin substring check is spoofable:**
```ts
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.includes("crm28.asg.ge") ||
        origin.includes("localhost") || origin.includes("127.0.0.1")) {
      cb(null, true);
```
`origin.includes("localhost")` matches any URL containing the substring — e.g., `https://evil-localhost.example.com` or `https://example.com/localhost-is-fine`. A phishing page loaded in the operator's browser can pass this check and POST to `/dial`.

**Finding B — `/dial` has no CSRF / no origin-pinned token:**
Anyone on the same host (browser tab on any site, malicious extension, another app) can POST `{ "number": "+995577123456" }` to `http://127.0.0.1:19876/dial` and trigger a call from the operator's extension. The only precondition is that a user is logged in (`getSession()`).

**Finding C — `/status` leaks identity:**
A malicious localhost-resident tool can read the logged-in user's name + extension + SIP-registered state without authentication.

**Verdict:** **STILL PRESENT. P1.** This is a local privilege/attack-surface issue, not a remote RCE, but it violates least privilege and aligns with THREAT_MODEL F3 concerns about the bridge.

**Fix scope:** 
- Replace `origin.includes(...)` with exact-match list (`"https://crm28.asg.ge"`, `"http://localhost:4002"`, `"http://127.0.0.1:4002"`).
- Add a bridge-session handshake: frontend calls `apiPost("/auth/device-token")` → gets short-lived handshake token → posts `X-Bridge-Token` header on every `/dial`.
- Rate-limit `/dial` on the bridge (max 10/min) to cap blast radius.

**Monday decision:** Triage with owner — if operators can only dial numbers already on-screen (not arbitrary digits) then blast radius is small. Still recommend hardening the CORS check this week.

**Regression test:** In operator's browser DevTools console:
```js
fetch("http://127.0.0.1:19876/dial", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({number:"+995500000000"})})
```
Confirm current code permits it. After fix: confirm `403 Blocked by CORS` unless Origin matches exact allow-list.

---

## 10. Permission cache staleness — `use-permissions.ts`

**Evidence:** `frontend/crm-frontend/src/lib/use-permissions.ts`
- Line 6–7: `let permissionsCache: string[] | null = null; let permissionsPromise: Promise<string[]> | null = null;` — module-level globals, shared across all hook consumers.
- Line 37: permissions fetched from `/v1/permissions/my-effective-permissions` once per session.
- Line 81–85: `clearCache()` + line 101 `clearPermissionsCache()` — exposed functions.
- Called from `app/app/logout-button.tsx:18` and `app/app/profile-menu.tsx:184` (logout paths).

**Finding:** Cache is invalidated **only** on logout. If an admin revokes or grants a permission mid-session, the user sees stale permissions until they log out and back in. No automatic refresh on socket event, no refresh-on-focus, no TTL.

**Operator impact:** Low — permissions change infrequently for a given user. Manager impact: medium — promoting an operator during the shift requires the user to log out manually.

**Verdict:** **STILL PRESENT.** P2. Not a Monday blocker.

**Fix scope:** Emit a `permissions:updated` Socket.IO event from the backend when a user's RoleGroup changes. Frontend listener calls `clearPermissionsCache()` + triggers a re-fetch. Alternative: 60s TTL + refresh on window focus.

**Regression test:** Login as operator, have admin add `call_center.quality` to the operator's position, reload operator browser → Quality tab appears. Without reload → not visible (current bug).

---

## 11. Call-report modal deep-linking

**Evidence:** `call-center/reports/page.tsx:93–98`
```tsx
useEffect(() => {
  if (searchParams.get("openReport") === "true") {
    setShowModal(true);
  }
}, [searchParams]);
```

**Assessment:** Pure UI state change. The URL parameter just flips a boolean that controls a modal's visibility. The modal contents (form fields, list of call sessions) are still fetched via `apiGet` with cookie-based JWT — so a non-permission user can't submit anything.

The page itself is gated by `call_center.reports` at line 100 (inline check) AND by the layout (`canAccessCurrentTab`). If a user lacks the permission, the outer guard blocks render before the modal effect fires.

**CSRF angle:** Opening a modal via URL param is not a state-changing action. No CSRF token required. The modal form's POST (`/v1/call-reports`) uses cookie-based JWT + SameSite defaults for CSRF protection at the backend layer.

**Verdict:** **OK.** No concern.

**Regression test:** As an operator lacking `call_center.reports`, visit `/app/call-center/reports?openReport=true` → confirm "Insufficient Permissions" panel, no modal flash.

---

## 12. Error boundaries

**Evidence:** `find src -name "error.tsx"`:
- `src/app/app/error.tsx` — top-level `/app` segment boundary
- `src/app/app/call-center/error.tsx` — call-center segment
- `src/app/app/client-chats/error.tsx` — client-chats segment
- `src/app/app/admin/error.tsx`, `inventory/error.tsx`, `sales/error.tsx` — other segments

Next.js App Router per-segment `error.tsx` catches render errors in that segment. Reviewed `client-chats/error.tsx` — renders a friendly panel with reset button; uses only static JSX (no contexts that could cascade-fail).

**CLAUDE.md warning:** "If MessengerContext, ModalStackContext, or I18nContext throws on init, entire app goes blank." Those contexts mount in `app/app/layout.tsx`, ABOVE the call-center/client-chats error boundaries. The per-segment boundaries do NOT catch provider-init failures in the layout itself.

**Verdict:** **OK for call-center/client-chats render errors.** Provider init failures still cascade globally — that's a pre-existing finding (F1, CLAUDE.md warning). Not introduced by frontend code in this audit.

**Regression test:** Inject `throw new Error("test")` inside `ConversationPanel` render, confirm client-chats error boundary catches it and shows "Try again" button rather than blanking the whole app.

---

## 13. TypeScript typecheck

**Command:** `cd frontend/crm-frontend && pnpm typecheck`
**Result:** Exit 0, no output (clean).

**Verdict:** **OK.** No typecheck errors on current branch `fix/telephony-deep-fix` at commit `33de993`.

---

## 14. Chat message send-failure UX

**Evidence:** `reply-box.tsx:163–186` (handleSend).

```tsx
async function handleSend() {
  if ((!text.trim() && !file) || sending) return;
  setSending(true);
  try {
    if (file) { /* FormData POST */ }
    else { await apiPost(.../reply, { text: text.trim() }); }
    setText('');
    clearFile();
    onSent();
  } catch {
    // keep text for retry
  } finally {
    setSending(false);
  }
}
```

**Behavior on 500:** `apiPost` throws `ApiError`, `catch {}` swallows it, text **stays in the textarea** (because `setText('')` is inside the try block after the await), file stays attached. `setSending(false)` runs in `finally`, so the button returns to "Send" label. **No toast, no banner, no inline error message** — the operator's only clue is that the message didn't appear in the transcript above.

**Behavior on 401:** `apiPost` → `handleResponse` → browser navigates to `/login?expired=1&next=...` → never resolves. Text is preserved (it's in the form state until the navigation destroys the DOM). After login, user returns to client-chats but the text is gone.

**Verdict:** **OK for 500 (fails safely), WEAK UX.** No visual feedback on failure is a minor gap.

**Fix scope:** Add a red dot or "Failed to send — retry?" banner when `apiPost` throws. Small fix; can wait.

**Regression test:** Disconnect network in DevTools offline mode, type a reply, click Send — expect: text remains in box, button re-enables, red error banner appears. Current code: first two pass, third doesn't.

---

## Cross-cutting observations

1. **`PermissionButton` unused** (#56) — confirmed in prior audits, not re-investigated here. Not in the operator/manager critical path; defer.
2. **`useListItems()` usage** (#54) — not spot-checked in this audit. Client-chats and call-center code primarily display server-provided data; fewer dropdown offenders. Defer to a dedicated sweep.
3. **Softphone polling interval 60s** is acceptable for desktop-status banner, but the `click-to-call` dial is a user-triggered fetch (not polled), so bridge-down feedback lag is 60s max on the banner but ≤3s on a dial attempt (via `AbortSignal.timeout(3000)`).
4. **No error-state UI in `conversation-panel.tsx`** when `apiGet` throws non-401 — `catch { setConversation(null) }` silently empties the panel. Operator sees "loading..." or empty state with no diagnostic. Minor UX gap, P3.

---

## P0 / P1 list for Monday

**P0 (block deploy):** None in frontend scope.

**P1 (fix this week):**
- #9 Softphone bridge CORS substring match + no CSRF on `/dial`. Triage with owner; at minimum tighten origin allow-list to exact strings.

**P2 (fix next week):**
- #3 Inactivity alert fires while operator is typing a draft.
- #4 Dedup vulnerable to missing message ID on edge cases.
- #5 Inconsistent date formatting (mixed `en-GB` hardcode vs browser default).
- #10 Permission cache staleness requires logout to pick up admin changes.
- #14 No visual feedback on message send failure.

**P3 / cosmetic:**
- Callbacks page lacks tab-level gating in the layout TABS array (verify inline guard).
- `ConversationPanel` swallows non-401 fetch errors silently.
