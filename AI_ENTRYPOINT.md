# AI Entrypoint – CRM Platform

**Purpose**: Single entry point for AI assistants (Cursor, Claude, Copilot) working on this codebase.  
**Do not delete existing docs.** This file links to them; it does not replace them.

---

## Section 1 – Start Here

**Read first (in order):**

1. [`docs/AI_WORKING_RULES.md`](docs/AI_WORKING_RULES.md) – Branch rules, commit standards, code standards
2. [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md) – Full doc index and reading order
3. [`AI_DEVELOPMENT_CONTEXT.md`](AI_DEVELOPMENT_CONTEXT.md) – Quick start, architecture, performance
4. [`DEVELOPMENT_GUIDELINES.md`](DEVELOPMENT_GUIDELINES.md) – Modal patterns, dynamic lists, implementation details

**Cursor rules (always applied):**

- [`.cursor/rules/git-branch-safety.mdc`](.cursor/rules/git-branch-safety.mdc) – Never touch master/staging; PRs target `dev`
- [`.cursor/rules/ai-branch-safety.mdc`](.cursor/rules/ai-branch-safety.mdc) – Branch workflow, commit format

---

## Section 2 – Documentation Sources & Overlap

| Source | Purpose |
|--------|---------|
| `.cursor/rules/` | Enforced rules (branch safety) – always applied |
| `docs/AI_WORKING_RULES.md` | AI rules: branches, commits, DB changes, files to never modify |
| `AI_DEVELOPMENT_CONTEXT.md` | Quick start, architecture, performance patterns |
| `DEVELOPMENT_GUIDELINES.md` | Modal patterns, dynamic lists, entity detail stack |
| `DOCUMENTATION_INDEX.md` | Master index, topic-based navigation |

**Overlap note:** Branch rules appear in both `.cursor/rules/` and `docs/AI_WORKING_RULES.md`. The `.cursor/rules` files are authoritative for Cursor; `AI_WORKING_RULES.md` is the canonical process doc. Both say: never commit to master/staging; all PRs target `dev`.

---

## Section 3 – Telephony Architecture

**Full guide:** [`docs/TELEPHONY_INTEGRATION.md`](docs/TELEPHONY_INTEGRATION.md)

**Summary:** Asterisk/FreePBX → AMI Bridge → CRM Backend → WebSocket → Call Center UI. Desktop app (CRM28 Phone) uses SIP.js over WSS to Asterisk PJSIP.

**Key components:**

- **Asterisk** – PJSIP, AMI (5038), ARI (8088), WSS (8089)
- **AMI Bridge** – Batches AMI events, POSTs to CRM `/v1/telephony/events`
- **CRM Backend** – `backend/crm-backend/src/telephony/`
- **CRM28 Phone** – Electron app, SIP.js in renderer, WebRTC audio

**Related:** `docs/CALL_CENTER.md`, `ami-bridge/README.md`

---

## Section 4 – Branch Workflow & PRs

- **Feature branches:** Create from `dev`: `git checkout -b feature/name dev`
- **PR target:** Always `dev` (`gh pr create --base dev`)
- **Sequential PRs:** One logical change per PR; avoid large multi-feature PRs
- **Review:** Run `pnpm lint` and `pnpm test:unit` before committing

See [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) for full process.

---

## Section 5 – Stop Conditions (AI Must Ask Before)

**AI must ask the user before:**

1. **Breaking changes** – API contract changes, removal of endpoints, incompatible behavior
2. **DB schema breaking changes** – Dropping columns, renaming without migration path, non-backward-compatible migrations
3. **Asterisk config changes** – Edits to `pjsip.*.conf`, `manager.conf`, `ari.conf`, or any FreePBX/Asterisk config
4. **Production deployments** – Triggering deploys, changing env vars in production, running migrations in production

**Rationale:** These can cause outages or data loss. Always confirm with the user first.

---

## Quick Reference

| Need | Document |
|------|----------|
| API endpoints | `API_ROUTE_MAP.md` |
| Frontend routes | `FRONTEND_ROUTE_MAP.md` |
| Auth & RBAC | `AUTH_CONFIG_SUMMARY.md` |
| Testing | `docs/TESTING.md` |
| CI/CD | `docs/CI_CD.md` |
| Release flow | `docs/RELEASE_CHECKLIST.md` |

---

**Last updated:** 2026-03-04
