import React, { useEffect, useState } from "react";
import { WindowControls } from "../components/WindowControls";
import type { BreakSession } from "../../shared/types";
import {
  BORDER_SOFT,
  BRAND,
  SHADOW_CARD,
  SHADOW_CTA,
  SURFACE_CARD,
  SURFACE_GRADIENT,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_STRONG,
  TEXT_SUBTLE,
} from "../theme";

interface Props {
  session: BreakSession;
  onResume: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Fullscreen overlay shown while the operator is on break. SIP is
 * unregistered at this point — dial / answer are unreachable. The
 * elapsed counter ticks every second.
 *
 * v1.11.0 design change: Log Out is removed from this screen. The
 * only action here is **Resume**. Operators who want to log out
 * resume the break first (one extra tap, but avoids the ambiguity of
 * "did my break session close cleanly on logout?"). If an operator
 * is stuck unable to resume, closing the app + reopening will
 * cold-start into a fresh break modal via the `GET /breaks/my-current`
 * restore path; from there the modal still only offers Resume.
 *
 * Auto-close safety net stays in place: the backend cron closes stale
 * breaks at COMPANY_WORK_END_HOUR (default 19:00) and after 12h, so an
 * operator who closes the app without resuming does NOT get stuck on
 * break forever.
 */
export function BreakModal(props: Props) {
  const { session, onResume, loading, error } = props;
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
        <span style={styles.titleText}>On Break</span>
        <WindowControls />
      </div>

      <div style={styles.body}>
        <div style={styles.iconCircle} aria-hidden="true">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke={BRAND}
            strokeWidth="1.8"
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
          You're unregistered. Resume when you're ready to take calls again.
        </div>
        <div style={styles.subCaption}>Extension {session.extension}</div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          onClick={onResume}
          disabled={loading}
          style={{
            ...styles.resumeBtn,
            opacity: loading ? 0.65 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Resuming…" : "Resume"}
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
    background: SURFACE_GRADIENT,
    color: TEXT_STRONG,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  titleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 34,
    paddingLeft: "0.85rem",
    WebkitAppRegion: "drag" as any,
    flexShrink: 0,
  },
  titleText: {
    color: TEXT_MUTED,
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: "1.5rem 1.25rem 1.5rem",
    gap: "0.85rem",
    overflowY: "auto",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: SURFACE_CARD,
    border: `1px solid ${BORDER_SOFT}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: SHADOW_CARD,
    marginTop: "0.25rem",
  },
  elapsed: {
    color: BRAND,
    fontSize: "3rem",
    fontWeight: 300,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
    lineHeight: 1,
    marginTop: "0.25rem",
  },
  caption: {
    color: TEXT_BODY,
    fontSize: "0.88rem",
    textAlign: "center",
    lineHeight: 1.5,
    maxWidth: 280,
  },
  subCaption: {
    color: TEXT_MUTED,
    fontSize: "0.72rem",
    letterSpacing: "0.05em",
  },
  error: {
    color: "#b91c1c",
    fontSize: "0.78rem",
    background: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    padding: "0.55rem 0.8rem",
    borderRadius: 8,
    maxWidth: 280,
    textAlign: "center",
  },
  resumeBtn: {
    marginTop: "0.75rem",
    padding: "0.85rem 2.5rem",
    background: BRAND,
    color: "white",
    border: "none",
    borderRadius: 999,
    fontSize: "0.95rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    minWidth: 220,
    boxShadow: SHADOW_CTA,
  },
  footNote: {
    color: TEXT_SUBTLE,
    fontSize: "0.68rem",
    marginTop: "0.75rem",
    textAlign: "center",
    letterSpacing: "0.04em",
  },
};
