# CRM28 Phone — local dev loop

Iterate on the softphone UI without rebuilding the installer or merging
to master each time. Use this during the Glass-UI polish phase (and any
future UI work).

## One-time setup

```powershell
cd C:\CRM-Platform\crm-phone
pnpm install
```

If you've never run dev mode before, that's all. Your existing prod
install of CRM28 Phone (v1.10.2 at time of writing) is completely
separate from dev mode — they don't conflict.

## The iteration loop

**Two terminals.** Keep them both open while you work.

**Terminal A — watcher + dev server** (start first):

```powershell
cd C:\CRM-Platform\crm-phone
pnpm run dev
```

This starts two watchers via `concurrently`:
- `tsc --watch` for the main process (rebuilds `dist/main/*.js` on save)
- `vite` for the renderer (serves on `http://localhost:5173` with HMR)

Leave this running. First build takes ~5s.

**Terminal B — Electron app** (start after Terminal A says both are ready):

```powershell
cd C:\CRM-Platform\crm-phone
pnpm start
```

This launches the Electron app, which loads the renderer from vite's
`http://localhost:5173` (so you get hot-module-replacement for free)
and the main process from `dist/main/index.js`.

When you log in, use the **production** CRM at `crm28.asg.ge` — the
dev softphone talks to the real backend by default, so your calls and
state are real. **No separate backend setup required.**

## What changes and when

| You edit | What reloads | Restart needed? |
|---|---|---|
| Any file under `src/renderer/**` | Vite HMR pushes the update to the running Electron window | No |
| Any file under `src/main/**` | tsc re-emits, but Electron doesn't know | **Yes** — Ctrl+C in Terminal B, then `pnpm start` again |
| Any file under `src/shared/**` | Both main and renderer get the update, HMR where applicable | Restart if the types changed what main does |
| `package.json`, `electron-builder.yml`, `.npmrc` | Nothing until reinstall/repack | `pnpm install` + full restart |

## Pulling my changes

When I push to `feat/softphone-glass-ui-polish`:

```powershell
cd C:\CRM-Platform\crm-phone
git pull origin feat/softphone-glass-ui-polish
```

Renderer-only changes → you'll see them immediately in the running
Electron window (HMR). Main-process changes → close and relaunch
Terminal B (`Ctrl+C`, then `pnpm start`).

If `pnpm-lock.yaml` changed (rare — I'll call it out), also run `pnpm
install` before `pnpm start`.

## Feedback cycle

1. I push a commit to the branch with a short "here's what I changed"
   message.
2. You pull + see the change in the already-open Electron window.
3. You tell me what to tweak (colors, spacing, any state that's off,
   anything that broke).
4. I push a follow-up commit.
5. Repeat until it feels right.
6. When we're done, I bump `version` in `package.json`, build the
   installer, merge to master, and upload to the VM + GitHub release
   as a single final cut (e.g. v1.11.0).

No PR merge needed between iterations. The branch just keeps growing
until we're happy.

## Gotchas

- **Ad-blocker/VPN weirdness on `localhost:5173`** — if Electron opens
  to a blank window, make sure your VPN / proxy isn't intercepting
  localhost. Fix is always "turn off the VPN briefly, or add a
  localhost bypass."
- **Stale `dist/main/` from a prior prod pack** — if you packed an
  installer recently (`pnpm run pack`), the prod bundle sits in
  `dist/main/`. Running `pnpm dev` in Terminal A overwrites those
  files with the unbundled tsc output, which is what you want.
  Electron will load the unbundled version fine — all externals are
  hoisted to top-level `node_modules/` by `.npmrc`
  `shamefully-hoist=true`.
- **SIP doesn't register in dev** — it does. The only difference from
  prod is that the renderer is served from vite instead of from
  `file://`. SIP, IPC, auto-update-check, everything else is identical.
- **Auto-updater check fires** — in dev, the auto-updater logs its
  check but can't actually install since `app.isPackaged === false`.
  Safe to ignore.
- **Don't close Terminal A first** — if you kill vite while Electron is
  running, the window goes blank until you relaunch. Close Terminal B
  (Electron) first, then Terminal A.

## When we're done

I'll do this as the final step — you don't need to:
- Bump version in `package.json`
- Run `pnpm run pack` to build the installer
- Upload installer + blockmap + `latest.yml` to VM
- Overwrite stable `CRM28-Phone-Setup.exe` pointer
- Create GitHub release
- Merge the branch to master

You keep your production install on v1.10.2 during iteration. The final
install swap happens once, at the end.
