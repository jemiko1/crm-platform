import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { usePhone } from "./hooks/usePhone";
import { useBreak } from "./hooks/useBreak";
import { useDnd } from "./hooks/useDnd";
import { LoginPage } from "./pages/LoginPage";
import { PhonePage } from "./pages/PhonePage";
import { BreakModal } from "./pages/BreakModal";
import { sipService } from "./sip-service";

export function App() {
  const auth = useAuth();
  const phone = usePhone();
  const hasSession = !!auth.session;
  const breakState = useBreak(hasSession);
  const dndState = useDnd(hasSession);

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
      setPrefillNumber(String(number));
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  /**
   * Cold-start coordination: when `useAuth` restores an existing
   * session, it auto-fires a SIP register via `obtainSipCredentials`.
   * That's the wrong thing if the operator was on break when they
   * closed the softphone — we'd re-register and immediately start
   * receiving calls during break.
   *
   * Both `useAuth`'s register and `useBreak`'s `/breaks/my-current`
   * fire on mount in parallel. Either can win the race. Depending on
   * BOTH `breakState.active` AND `auth.sipRegistered` as effect deps
   * makes the coordination deterministic:
   *
   *   - If break-check resolves first (active=true) before register
   *     completes, the effect runs but `auth.sipRegistered === false`
   *     so it no-ops. When the register later lands and flips
   *     `sipRegistered` to true, the effect re-runs and unregisters.
   *   - If register resolves first, then break-check flips active
   *     to true — the effect runs with both true and unregisters.
   *
   * In either order we end up unregistered + modal visible. Without
   * the `auth.sipRegistered` dep (W1 from code-review), ~20-30% of
   * cold-start-into-active-break scenarios would leave SIP registered
   * during a break.
   */
  useEffect(() => {
    if (!breakState.active) return;
    if (!auth.sipRegistered) return;
    window.crmPhone?.log?.("info", "[break] unregistering SIP — restored into active break");
    sipService.unregister().catch(() => { /* swallow — UI already shows modal */ });
  }, [breakState.active, auth.sipRegistered]);

  /**
   * When the user hits Resume, we need to fetch a fresh SIP credential
   * set (the session-persisted extension info doesn't carry sipPassword,
   * per audit/P0-C). The backend break-end endpoint is called first;
   * only after it succeeds do we register.
   */
  const handleResume = useCallback(async () => {
    const creds = await window.crmPhone.sip.fetchCredentials();
    await breakState.end(creds);
  }, [breakState]);

  /**
   * Logout during break: end the break first so the session closes
   * cleanly, then run the normal logout flow. If break-end fails (e.g.
   * network), the auto-close cron will eventually close it — we don't
   * block logout on backend success because the operator wants OUT.
   *
   * `logoutInFlight` guards against a confused user mashing the Log
   * Out button during a slow round-trip. Without it, `breakState.end`'s
   * own `inFlight` would fail the second call silently, but the rest
   * of the sequence (reset + auth.logout) would still fire twice,
   * which can surface a cosmetic 401 toast on the second logout.
   */
  const logoutInFlight = useRef(false);
  const handleLogoutDuringBreak = useCallback(async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    try {
      await breakState.end(null); // don't re-register; we're logging out
    } catch {
      /* swallow — cron will clean up */
    }
    try {
      breakState.reset();
      dndState.reset();
      await auth.logout();
    } finally {
      logoutInFlight.current = false;
    }
  }, [auth, breakState, dndState]);

  const handleNormalLogout = useCallback(async () => {
    dndState.reset();
    await auth.logout();
  }, [auth, dndState]);

  const handleDndToggle = useCallback(
    async (target: boolean) => {
      if (target) {
        await dndState.enable();
      } else {
        await dndState.disable();
      }
    },
    [dndState],
  );

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

  // Active break takes over the whole UI — we deliberately hide the
  // PhonePage so the operator can't accidentally dial or see the call
  // history while they're supposed to be away. Resume puts them back.
  if (breakState.active) {
    return (
      <BreakModal
        session={breakState.active}
        onResume={handleResume}
        onLogout={handleLogoutDuringBreak}
        loading={breakState.loading}
        error={breakState.error}
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
      onLogout={handleNormalLogout}
      prefillNumber={prefillNumber}
      onPrefillConsumed={() => setPrefillNumber(null)}
      breakStarting={breakState.loading}
      breakError={breakState.error}
      onBreakStart={breakState.start}
      dndEnabled={dndState.enabled}
      dndLoading={dndState.loading}
      onDndToggle={handleDndToggle}
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
