import React, { useEffect, useState } from "react";
import type { BreakSession } from "../../shared/types";
import { GLASS } from "../theme";

interface Props {
  session: BreakSession;
  onResume: () => Promise<void>;
  onLogout: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Fullscreen overlay shown while the operator is on break. SIP is
 * unregistered at this point — dial / answer are unreachable, so we
 * make that obvious by replacing the entire PhonePage. The elapsed
 * counter ticks every second. The only actions available are
 * "Resume" (end break + re-register SIP) and "Log Out" (end break +
 * logout). Logout also calls `onResume` first via the parent — we
 * don't block logout during break.
 *
 * Auto-close: the backend closes stale breaks at COMPANY_WORK_END_HOUR
 * (default 19:00) and after 12h. If that fires while the softphone is
 * running, the break session is closed on the backend but the modal
 * stays up (no push from backend yet). The user clicks Resume and gets
 * a successful (idempotent) response — the cron already did the work.
 */
export function BreakModal(props: Props) {
  const { session, onResume, onLogout, loading, error } = props;
  // Re-render every second to keep the elapsed counter live. We don't
  // mutate state inside every tick — just bump a counter to trigger
  // render. Cheaper than recomputing from Date.now on a data prop.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const startedAtMs = new Date(session.startedAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const elapsedText = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return (
    <div style={styles.container}>
      <div style={styles.titleBar}>
        <div style={styles.titleText}>On Break</div>
      </div>

      <div style={styles.body}>
        <div style={styles.iconCircle}>
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
            <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
            <line x1="6" y1="1" x2="6" y2="4" />
            <line x1="10" y1="1" x2="10" y2="4" />
            <line x1="14" y1="1" x2="14" y2="4" />
          </svg>
        </div>

        <div style={styles.elapsed}>{elapsedText}</div>
        <div style={styles.caption}>
          SIP unregistered — you won't receive calls until you resume.
        </div>
        <div style={styles.subCaption}>
          Extension {session.extension}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          onClick={onResume}
          disabled={loading}
          style={{
            ...styles.resumeBtn,
            opacity: loading ? 0.5 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Resuming…" : "Resume"}
        </button>

        <button
          onClick={onLogout}
          disabled={loading}
          style={{
            ...styles.logoutBtn,
            opacity: loading ? 0.5 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Log Out
        </button>

        <div style={styles.footNote}>
          Auto-closes at end of business hours or after 12h.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    // Same Glass backdrop as PhonePage but with an amber glow swapped
    // in for the cyan one, signaling "paused state" without leaving
    // the visual language. The purple stays so the modal still feels
    // like the same app, not a separate screen.
    background: [
      "radial-gradient(at 20% 10%, rgba(251, 191, 36, 0.22), transparent 45%)",
      "radial-gradient(at 80% 90%, rgba(139, 92, 246, 0.22), transparent 45%)",
      "#0b1120",
    ].join(", "),
    color: GLASS.textStrong,
    backgroundAttachment: "fixed",
  },
  titleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    WebkitAppRegion: "drag" as any,
    background: "rgba(2, 6, 23, 0.45)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
  },
  titleText: {
    color: "#fcd34d",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  body: {
    // At the softphone's minimum window size (340x500) the previous
    // `justifyContent: center` + 2rem padding caused the Log Out
    // button and footNote to overflow off-screen. Keep
    // `justifyContent: flex-start` + scroll overflow so the modal
    // stays usable at any window size.
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: "1.5rem 1.25rem 1.25rem",
    gap: "0.85rem",
    overflowY: "auto",
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: "50%",
    background: "rgba(251, 191, 36, 0.16)",
    border: "1px solid rgba(251, 191, 36, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "0.25rem",
    flexShrink: 0,
    boxShadow:
      "0 8px 24px rgba(251, 191, 36, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.06) inset",
  },
  elapsed: {
    // Gradient clip-text — amber → orange. The background is painted
    // only onto the text, giving a premium look without adding another
    // element. Fallback `color` keeps the text readable if the browser
    // ever drops support for background-clip: text (not an issue in
    // Chromium, but defensive).
    background: GLASS.amberGradient,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    fontSize: "3rem",
    fontWeight: 300,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
    lineHeight: 1,
    marginTop: "0.25rem",
  },
  caption: {
    color: GLASS.textBody,
    fontSize: "0.85rem",
    textAlign: "center",
    lineHeight: 1.5,
    maxWidth: 260,
  },
  subCaption: {
    color: GLASS.textMuted,
    fontSize: "0.7rem",
    marginTop: "-0.25rem",
    letterSpacing: "0.05em",
  },
  error: {
    color: "#fca5a5",
    fontSize: "0.78rem",
    background: "rgba(220, 38, 38, 0.16)",
    border: "1px solid rgba(220, 38, 38, 0.35)",
    padding: "0.55rem 0.8rem",
    borderRadius: 8,
    maxWidth: 280,
    textAlign: "center",
  },
  resumeBtn: {
    marginTop: "0.75rem",
    padding: "0.85rem 2.5rem",
    background: GLASS.successGradient,
    color: "white",
    border: "none",
    borderRadius: 999,
    fontSize: "0.95rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
    cursor: "pointer",
    minWidth: 220,
    boxShadow: GLASS.successShadow,
  },
  logoutBtn: {
    padding: "0.55rem 1.5rem",
    ...GLASS.glassCard,
    color: GLASS.textMuted,
    borderRadius: 999,
    fontSize: "0.8rem",
    cursor: "pointer",
    minWidth: 220,
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
  footNote: {
    color: GLASS.textSubtle,
    fontSize: "0.68rem",
    marginTop: "0.75rem",
    textAlign: "center",
    letterSpacing: "0.04em",
  },
};
