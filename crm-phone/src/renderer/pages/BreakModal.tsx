import React, { useEffect, useState } from "react";
import type { BreakSession } from "../../shared/types";

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
    background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
  },
  titleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    WebkitAppRegion: "drag" as any,
    background: "rgba(0,0,0,0.3)",
  },
  titleText: {
    color: "#fbbf24",
    fontSize: "0.85rem",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  body: {
    // At the softphone's minimum window size (340x500) the previous
    // `justifyContent: center` + 2rem padding caused the Log Out
    // button and footNote to overflow off-screen. Switch to
    // `justifyContent: flex-start` + scroll overflow so the modal
    // stays usable at any window size the user drags to (v1.10.2).
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: "1.25rem 1.25rem 1rem",
    gap: "0.75rem",
    overflowY: "auto",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "rgba(245, 158, 11, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "0.5rem",
    flexShrink: 0,
  },
  elapsed: {
    color: "#fef3c7",
    fontSize: "2.75rem",
    fontWeight: 300,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
    lineHeight: 1,
  },
  caption: {
    color: "#cbd5e1",
    fontSize: "0.9rem",
    textAlign: "center",
    lineHeight: 1.4,
    maxWidth: 260,
  },
  subCaption: {
    color: "#94a3b8",
    fontSize: "0.75rem",
    marginTop: "-0.25rem",
  },
  error: {
    color: "#fca5a5",
    fontSize: "0.8rem",
    background: "rgba(220, 38, 38, 0.15)",
    border: "1px solid rgba(220, 38, 38, 0.35)",
    padding: "0.5rem 0.75rem",
    borderRadius: 6,
    maxWidth: 280,
    textAlign: "center",
  },
  resumeBtn: {
    marginTop: "0.75rem",
    padding: "0.75rem 2.5rem",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    minWidth: 200,
  },
  logoutBtn: {
    padding: "0.55rem 1.5rem",
    background: "transparent",
    color: "#94a3b8",
    border: "1px solid #475569",
    borderRadius: 6,
    fontSize: "0.85rem",
    cursor: "pointer",
    minWidth: 200,
  },
  footNote: {
    color: "#64748b",
    fontSize: "0.7rem",
    marginTop: "0.75rem",
    textAlign: "center",
  },
};
