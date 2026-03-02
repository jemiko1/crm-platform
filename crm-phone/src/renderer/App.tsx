import React from "react";
import { useAuth } from "./hooks/useAuth";
import { usePhone } from "./hooks/usePhone";
import { LoginPage } from "./pages/LoginPage";
import { PhonePage } from "./pages/PhonePage";

export function App() {
  const auth = useAuth();
  const phone = usePhone();

  if (auth.loading) {
    return (
      <div style={styles.splash}>
        <div style={styles.spinner} />
        <p style={styles.splashText}>CRM Phone</p>
      </div>
    );
  }

  if (!auth.session) {
    return (
      <LoginPage
        onLogin={auth.login}
        loading={auth.loading}
        error={auth.error}
      />
    );
  }

  return (
    <PhonePage
      session={auth.session}
      sipRegistered={auth.sipRegistered}
      callState={phone.callState}
      activeCall={phone.activeCall}
      muted={phone.muted}
      onDial={phone.dial}
      onAnswer={phone.answer}
      onHangup={phone.hangup}
      onHold={phone.hold}
      onUnhold={phone.unhold}
      onDtmf={phone.dtmf}
      onToggleMute={phone.toggleMute}
      onLogout={auth.logout}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  splash: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#0f172a",
    gap: "1rem",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #334155",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  splashText: {
    color: "#64748b",
    fontSize: "0.9rem",
  },
};
