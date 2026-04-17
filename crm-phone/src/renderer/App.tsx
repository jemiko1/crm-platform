import React, { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { usePhone } from "./hooks/usePhone";
import { LoginPage } from "./pages/LoginPage";
import { PhonePage } from "./pages/PhonePage";

export function App() {
  const auth = useAuth();
  const phone = usePhone();
  // Number requested by an external dial (e.g., user clicked a phone number
  // in the CRM web UI which POSTed to the softphone's local HTTP bridge).
  // PhonePage picks this up via its `prefillNumber` prop and loads it into
  // the dial input. We deliberately do NOT auto-dial — the operator must
  // press the Call button. This prevents accidental or cancellable dials
  // from counting as real attempts on the missed-calls worklist.
  const [prefillNumber, setPrefillNumber] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.crmPhone?.phone?.onDialRequest?.((number: string) => {
      window.crmPhone?.log?.("info", "[dial] external dial request:", number);
      // Force a change even if the same number comes back twice — use a fresh
      // string identity so the downstream useEffect sees a new reference.
      setPrefillNumber(String(number));
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (auth.loading) {
    return (
      <div style={styles.splash}>
        <div style={styles.spinner} />
        <p style={styles.splashText}>CRM28 Phone</p>
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
      prefillNumber={prefillNumber}
      onPrefillConsumed={() => setPrefillNumber(null)}
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
