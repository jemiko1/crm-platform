import React, { useEffect, useState } from "react";
import type { ActiveCall, CallState, ContactLookupResult } from "../../shared/types";

interface Props {
  call: ActiveCall;
  callState: CallState;
  onAnswer: () => void;
  onReject: () => void;
}

export function IncomingCallPopup({ call, callState, onAnswer, onReject }: Props) {
  const [contact, setContact] = useState<ContactLookupResult | null>(null);
  const [answerPressed, setAnswerPressed] = useState(false);

  useEffect(() => {
    window.crmPhone.contact
      .lookup(call.remoteNumber)
      .then((result: ContactLookupResult | null) => {
        if (result) setContact(result);
      });
  }, [call.remoteNumber]);

  const isConnecting = callState === "connecting" || answerPressed;

  const handleAnswer = () => {
    if (answerPressed) return;
    setAnswerPressed(true);
    onAnswer();
  };

  const displayName = contact?.name || call.remoteName || "Unknown Caller";
  const displayNumber = call.remoteNumber;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {!isConnecting && <div style={styles.pulseRing} />}

        {isConnecting ? (
          <div style={styles.connectingIcon}>
            <div style={styles.connectingRing} />
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.81.7A2 2 0 0 1 22 16.92Z"
                stroke="#60a5fa"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" style={styles.icon}>
            <path
              d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.81.7A2 2 0 0 1 22 16.92Z"
              stroke="#22c55e"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}

        <h2 style={styles.callerName}>{displayName}</h2>
        <p style={styles.callerNumber}>{displayNumber}</p>

        {contact?.company && (
          <p style={styles.company}>{contact.company}</p>
        )}
        {contact?.lastInteraction && (
          <p style={styles.lastCall}>Last contact: {contact.lastInteraction}</p>
        )}

        {isConnecting ? (
          <div style={styles.connectingArea}>
            <div style={styles.connectingDots}>
              <span style={{ ...styles.dot, animationDelay: "0s" }} />
              <span style={{ ...styles.dot, animationDelay: "0.2s" }} />
              <span style={{ ...styles.dot, animationDelay: "0.4s" }} />
            </div>
            <span style={styles.connectingLabel}>Connecting</span>
          </div>
        ) : (
          <div style={styles.actions}>
            <button onClick={onReject} style={styles.rejectBtn}>
              Decline
            </button>
            <button onClick={handleAnswer} style={styles.answerBtn}>
              Answer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    padding: "2rem",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "2rem",
    borderRadius: "1.5rem",
    background: "#1e293b",
    border: "1px solid #334155",
    width: "100%",
    maxWidth: "320px",
    position: "relative",
  },
  pulseRing: {
    position: "absolute",
    top: "-20px",
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    border: "2px solid #22c55e44",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  icon: { marginBottom: "1rem" },
  connectingIcon: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    marginBottom: "1rem",
  },
  connectingRing: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: "3px solid #1e3a5f",
    borderTopColor: "#60a5fa",
    animation: "spin 1s linear infinite",
  },
  callerName: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "#f1f5f9",
    textAlign: "center" as const,
  },
  callerNumber: {
    fontSize: "1rem",
    color: "#94a3b8",
    marginTop: "0.25rem",
    letterSpacing: "0.05em",
  },
  company: {
    fontSize: "0.85rem",
    color: "#60a5fa",
    marginTop: "0.5rem",
  },
  lastCall: {
    fontSize: "0.75rem",
    color: "#64748b",
    marginTop: "0.25rem",
  },
  connectingArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
    marginTop: "2rem",
  },
  connectingDots: {
    display: "flex",
    gap: "0.5rem",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#60a5fa",
    animation: "dotBounce 1s ease-in-out infinite",
  },
  connectingLabel: {
    fontSize: "0.9rem",
    color: "#60a5fa",
    fontWeight: 600,
    letterSpacing: "0.05em",
  },
  actions: {
    display: "flex",
    gap: "1rem",
    marginTop: "2rem",
    width: "100%",
  },
  rejectBtn: {
    flex: 1,
    padding: "0.875rem",
    borderRadius: "0.75rem",
    border: "none",
    background: "#dc2626",
    color: "#fff",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  answerBtn: {
    flex: 1,
    padding: "0.875rem",
    borderRadius: "0.75rem",
    border: "none",
    background: "#22c55e",
    color: "#fff",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};
