import React, { useState, useEffect, useRef } from "react";
import type { AppSession, ActiveCall, CallState } from "../../shared/types";
import { IncomingCallPopup } from "./IncomingCallPopup";
import { SettingsPage } from "./SettingsPage";
import { startRingtone, stopRingtone } from "../ringtone";

interface Props {
  session: AppSession;
  sipRegistered: boolean;
  callState: CallState;
  activeCall: ActiveCall | null;
  muted: boolean;
  onDial: (number: string) => Promise<void>;
  onAnswer: () => Promise<void>;
  onHangup: () => Promise<void>;
  onHold: () => Promise<void>;
  onUnhold: () => Promise<void>;
  onDtmf: (tone: string) => Promise<void>;
  onToggleMute: () => Promise<void>;
  onLogout: () => Promise<void>;
}

const DTMF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function PhonePage(props: Props) {
  const {
    session, sipRegistered, callState, activeCall, muted,
    onDial, onAnswer, onHangup, onHold, onUnhold, onDtmf, onToggleMute, onLogout,
  } = props;
  const [dialNumber, setDialNumber] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const wasRinging = useRef(false);

  useEffect(() => {
    const ringing = callState === "ringing" && activeCall?.direction === "inbound";

    if (ringing && !wasRinging.current) {
      wasRinging.current = true;
      window.crmPhone.settings.get().then((s: any) => {
        if (!s.muteRingtone) startRingtone();
        if (s.overrideApps) window.crmPhone.window.setAlwaysOnTop(true);
      });
    }

    if (!ringing && wasRinging.current) {
      wasRinging.current = false;
      stopRingtone();
      window.crmPhone.window.setAlwaysOnTop(false);
    }
  }, [callState, activeCall]);

  const userName =
    (session.user.firstName ? `${session.user.firstName} ${session.user.lastName || ""}` : session.user.email).trim();
  const ext = session.telephonyExtension?.extension || "No ext";

  const handleDial = () => {
    if (dialNumber.trim()) {
      onDial(dialNumber.trim());
      setDialNumber("");
    }
  };

  const handleKeyPress = (key: string) => {
    if (callState === "connected") {
      onDtmf(key);
    } else {
      setDialNumber((prev) => prev + key);
    }
  };

  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />;
  }

  if ((callState === "ringing" || callState === "connecting") && activeCall?.direction === "inbound") {
    return (
      <IncomingCallPopup
        call={activeCall}
        callState={callState}
        onAnswer={onAnswer}
        onReject={onHangup}
      />
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.titleBar}>
        <span style={styles.titleText}>CRM28 Phone</span>
        <div style={{ display: "flex", gap: "0.5rem", WebkitAppRegion: "no-drag" as any }}>
          <button onClick={() => setShowSettings(true)} style={styles.headerBtn} title="Settings">⚙</button>
          <button onClick={() => window.crmPhone.app.hide()} style={styles.headerBtn} title="Minimize to tray">—</button>
          <button onClick={() => window.crmPhone.app.hide()} style={styles.closeBtn} title="Close to tray">✕</button>
        </div>
      </div>

      <div style={styles.statusBar}>
        <div style={styles.userInfo}>
          <span style={styles.userName}>{userName}</span>
          <span style={styles.extLabel}>Ext {ext}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{
            ...styles.sipDot,
            background: sipRegistered ? "#22c55e" : "#ef4444",
          }} />
          <span style={styles.sipText}>
            {sipRegistered ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {callState !== "idle" && activeCall && (
        <div style={styles.callDisplay}>
          <span style={styles.callDirection}>
            {activeCall.direction === "inbound" ? "Incoming" : "Outgoing"}
          </span>
          <span style={styles.callNumber}>
            {activeCall.remoteName || activeCall.remoteNumber}
          </span>

          {callState === "connecting" ? (
            <div style={styles.connectingWrap}>
              <div style={styles.connectingSpinner} />
              <span style={styles.connectingText}>Connecting...</span>
            </div>
          ) : (
            <span style={styles.callStatus}>
              {callState === "dialing" ? "Dialing..." :
               callState === "connected" ? "Connected" :
               callState === "hold" ? "On Hold" : callState}
            </span>
          )}

          <div style={styles.callActions}>
            {(callState === "connected" || callState === "hold") && (
              <>
                <button
                  onClick={onToggleMute}
                  style={muted ? styles.activeActionBtn : styles.actionBtn}
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  onClick={callState === "hold" ? onUnhold : onHold}
                  style={callState === "hold" ? styles.activeActionBtn : styles.actionBtn}
                >
                  {callState === "hold" ? "Resume" : "Hold"}
                </button>
              </>
            )}
            <button onClick={onHangup} style={styles.hangupBtn}>
              Hang Up
            </button>
          </div>
        </div>
      )}

      {callState === "idle" && (
        <>
          <div style={styles.dialInput}>
            <input
              type="text"
              value={dialNumber}
              onChange={(e) => setDialNumber(e.target.value)}
              placeholder="Enter number..."
              style={styles.numberInput}
              onKeyDown={(e) => e.key === "Enter" && handleDial()}
            />
          </div>

          <div style={styles.dialPad}>
            {DTMF_KEYS.map((key) => (
              <button key={key} onClick={() => handleKeyPress(key)} style={styles.dialKey}>
                {key}
              </button>
            ))}
          </div>

          <button
            onClick={handleDial}
            disabled={!sipRegistered || !dialNumber.trim()}
            style={{
              ...styles.callBtn,
              opacity: !sipRegistered || !dialNumber.trim() ? 0.5 : 1,
            }}
          >
            Call
          </button>
        </>
      )}

      {(callState === "connected" || callState === "hold") && (
        <div style={styles.dialPad}>
          {DTMF_KEYS.map((key) => (
            <button key={key} onClick={() => handleKeyPress(key)} style={styles.dialKey}>
              {key}
            </button>
          ))}
        </div>
      )}

      <div style={styles.footer}>
        {!session.telephonyExtension && (
          <div style={styles.noExtWarning}>
            No extension assigned. Contact admin.
          </div>
        )}
        <button onClick={onLogout} style={styles.logoutBtn}>
          Log Out
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
  },
  titleBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 1rem",
    background: "#020617",
    WebkitAppRegion: "drag" as any,
  },
  titleText: { fontSize: "0.8rem", fontWeight: 600, color: "#94a3b8" },
  headerBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: "0.9rem",
    cursor: "pointer",
    padding: "2px 6px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: "0.85rem",
    cursor: "pointer",
    padding: "2px 6px",
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid #1e293b",
  },
  userInfo: { display: "flex", flexDirection: "column" },
  userName: { fontSize: "0.875rem", fontWeight: 600, color: "#f1f5f9" },
  extLabel: { fontSize: "0.75rem", color: "#64748b" },
  sipDot: { width: 8, height: 8, borderRadius: "50%" },
  sipText: { fontSize: "0.75rem", color: "#94a3b8" },
  callDisplay: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "2rem 1rem",
    gap: "0.5rem",
    flex: 1,
    justifyContent: "center",
  },
  callDirection: { fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" as const },
  callNumber: { fontSize: "1.5rem", fontWeight: 700, color: "#f1f5f9" },
  callStatus: { fontSize: "0.875rem", color: "#60a5fa" },
  connectingWrap: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "0.25rem",
  },
  connectingSpinner: {
    width: 18,
    height: 18,
    border: "2px solid #334155",
    borderTopColor: "#60a5fa",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  connectingText: {
    fontSize: "0.875rem",
    color: "#60a5fa",
  },
  callActions: { display: "flex", gap: "0.75rem", marginTop: "1.5rem" },
  actionBtn: {
    padding: "0.6rem 1.2rem",
    borderRadius: "0.5rem",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  activeActionBtn: {
    padding: "0.6rem 1.2rem",
    borderRadius: "0.5rem",
    border: "1px solid #f59e0b",
    background: "#78350f",
    color: "#fbbf24",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  hangupBtn: {
    padding: "0.6rem 1.5rem",
    borderRadius: "0.5rem",
    border: "none",
    background: "#dc2626",
    color: "#fff",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  dialInput: { padding: "1rem", paddingBottom: "0.5rem" },
  numberInput: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f1f5f9",
    fontSize: "1.25rem",
    textAlign: "center" as const,
    outline: "none",
    letterSpacing: "0.1em",
  },
  dialPad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.5rem",
    padding: "0.5rem 1.5rem",
  },
  dialKey: {
    padding: "0.75rem",
    borderRadius: "0.75rem",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f1f5f9",
    fontSize: "1.25rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center" as const,
  },
  callBtn: {
    margin: "0.5rem 1.5rem",
    padding: "0.75rem",
    borderRadius: "0.75rem",
    border: "none",
    background: "#22c55e",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  footer: {
    padding: "0.75rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginTop: "auto",
  },
  noExtWarning: {
    padding: "0.5rem",
    borderRadius: "0.375rem",
    background: "#78350f33",
    border: "1px solid #d97706",
    color: "#fbbf24",
    fontSize: "0.75rem",
    textAlign: "center" as const,
  },
  logoutBtn: {
    width: "100%",
    padding: "0.5rem",
    borderRadius: "0.375rem",
    border: "1px solid #334155",
    background: "transparent",
    color: "#94a3b8",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
};
