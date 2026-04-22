import React, { useState } from "react";
import { WindowControls, WINDOW_CONTROLS_WIDTH } from "../components/WindowControls";
import type { ActiveCall, CallState, CallerLookupResult } from "../../shared/types";
import {
  BORDER_SOFT,
  BRAND,
  SHADOW_CARD,
  SHADOW_CTA,
  SHADOW_DANGER,
  SURFACE_CARD,
  SURFACE_GRADIENT,
  TEXT_MUTED,
  TEXT_STRONG,
} from "../theme";

interface Props {
  call: ActiveCall;
  callState: CallState;
  lookup: CallerLookupResult | null;
  onAnswer: () => void;
  onReject: () => void;
}

export function IncomingCallPopup({ call, callState, lookup, onAnswer, onReject }: Props) {
  const [answerPressed, setAnswerPressed] = useState(false);
  const isConnecting = callState === "connecting" || answerPressed;

  const handleAnswer = () => {
    if (answerPressed) return;
    setAnswerPressed(true);
    onAnswer();
  };

  const displayName = lookup?.client?.name || call.remoteName || "Unknown Caller";
  const displayNumber = call.remoteNumber;
  const buildings = lookup?.client?.buildings ?? [];

  return (
    <div style={styles.overlay}>
      <div style={styles.titleBar}>
        <WindowControls />
        <span style={styles.titleText}>CRM28 Softphone</span>
        <div style={{ width: WINDOW_CONTROLS_WIDTH }} />
      </div>

      <div style={styles.body}>
        <div style={styles.headerLabel}>
          {isConnecting ? "Connecting…" : "Incoming Call"}
        </div>

        {/* Avatar with expanding ripple rings — three concentric
            circles with staggered animation delays so the ring
            appears to breathe outward from the avatar. */}
        <div style={styles.avatarWrap}>
          {!isConnecting && (
            <>
              <span style={{ ...styles.ripple, animationDelay: "0s" }} />
              <span style={{ ...styles.ripple, animationDelay: "0.6s" }} />
              <span style={{ ...styles.ripple, animationDelay: "1.2s" }} />
            </>
          )}
          <div style={styles.avatar} aria-hidden="true">
            <PersonIcon />
          </div>
        </div>

        <div style={styles.callerName}>{displayName}</div>
        <div style={styles.callerNumber}>{displayNumber}</div>

        {buildings.length > 0 && (
          <div style={styles.contextLine}>
            {buildings.map((b) => b.name).join(", ")}
          </div>
        )}
        {lookup?.openIncidents && lookup.openIncidents.length > 0 && (
          <div style={styles.contextLine}>
            {lookup.openIncidents.length} open incident
            {lookup.openIncidents.length > 1 ? "s" : ""}
          </div>
        )}

        {isConnecting ? (
          <div style={styles.connectingDots}>
            <span style={{ ...styles.dot, animationDelay: "0s" }} />
            <span style={{ ...styles.dot, animationDelay: "0.2s" }} />
            <span style={{ ...styles.dot, animationDelay: "0.4s" }} />
          </div>
        ) : (
          <div style={styles.actions}>
            <button
              onClick={handleAnswer}
              style={styles.answerBtn}
              aria-label="Answer call"
              title="Answer"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
            <button
              onClick={onReject}
              style={styles.rejectBtn}
              aria-label="Decline call"
              title="Decline"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(135deg)" }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke={BRAND}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: SURFACE_GRADIENT,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: TEXT_STRONG,
  },
  titleBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 0.85rem",
    WebkitAppRegion: "drag" as any,
    flexShrink: 0,
  },
  titleText: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: TEXT_STRONG,
  },
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem 1.5rem 2rem",
    gap: "0.5rem",
    overflow: "auto",
  },
  headerLabel: {
    fontSize: "0.9rem",
    color: BRAND,
    fontWeight: 600,
    marginBottom: "0.75rem",
    letterSpacing: "0.02em",
  },
  avatarWrap: {
    position: "relative",
    width: 170,
    height: 170,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "0.5rem",
  },
  ripple: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    border: `2px solid rgba(8, 117, 56, 0.25)`,
    animation: "ringRipple 1.8s ease-out infinite",
  },
  avatar: {
    width: 130,
    height: 130,
    borderRadius: "50%",
    background: SURFACE_CARD,
    border: `1px solid ${BORDER_SOFT}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0 10px 30px rgba(15, 60, 40, 0.12), 0 1px 2px rgba(15, 60, 40, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
    zIndex: 1,
  },
  callerName: {
    fontSize: "1.4rem",
    fontWeight: 600,
    color: TEXT_STRONG,
    textAlign: "center" as const,
    lineHeight: 1.25,
    padding: "0 0.5rem",
    marginTop: "0.5rem",
  },
  callerNumber: {
    fontSize: "0.95rem",
    color: TEXT_MUTED,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.04em",
  },
  contextLine: {
    fontSize: "0.78rem",
    color: TEXT_MUTED,
    textAlign: "center" as const,
  },
  actions: {
    display: "flex",
    gap: "2.5rem",
    marginTop: "1.75rem",
    justifyContent: "center",
  },
  answerBtn: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    border: "none",
    background: BRAND,
    color: "white",
    cursor: "pointer",
    boxShadow: SHADOW_CTA,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtn: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    boxShadow: SHADOW_DANGER,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  connectingDots: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "1.75rem",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: BRAND,
    animation: "dotBounce 1s ease-in-out infinite",
  },
};
