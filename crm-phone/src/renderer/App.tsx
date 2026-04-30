import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { usePhone } from "./hooks/usePhone";
import { useBreak } from "./hooks/useBreak";
import { useDnd } from "./hooks/useDnd";
import { useExtensionRebind } from "./hooks/useExtensionRebind";
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
  // Subscribes to backend `extension:changed` events. When admin re-links
  // the operator, the softphone unregisters old SIP, refreshes the
  // session via /auth/me, and registers with new credentials. Soft-defers
  // if on an active call — never drops one. The userId dep ensures the
  // listener resets on user switch — no stale pending state leaks across
  // logout/login.
  useExtensionRebind(auth.session?.user?.id ?? null);

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
   * Logout flow. DND is reset before calling auth.logout() so a stale
   * DND toggle doesn't survive a re-login into a different account.
   *
   * v1.11.0: Log Out is no longer available on the Break screen — the
   * operator must Resume first. This avoids the ambiguity of "did the
   * break close cleanly on the way out?" and keeps the break modal a
   * single-purpose pause surface. If the operator closes the app
   * without resuming, the backend's auto-close cron still takes care
   * of the stale break session at end-of-business or after 12h.
   */
  const handleLogout = useCallback(async () => {
    dndState.reset();
    breakState.reset();
    await auth.logout();
  }, [auth, breakState, dndState]);

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
      onLogout={handleLogout}
      prefillNumber={prefillNumber}
      onPrefillConsumed={() => setPrefillNumber(null)}
      breakStarting={breakState.loading}
      breakError={breakState.error}
      onBreakStart={breakState.start}
      dndEnabled={dndState.enabled}
      dndLoading={dndState.loading}
      dndError={dndState.error}
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
    height: "100%",
    // Match PhonePage / BreakModal so there's no jarring dark→light flash
    // while the session is restoring.
    background:
      "linear-gradient(180deg, #f4faf7 0%, #e9f3ee 100%)",
    gap: "1rem",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid rgba(15, 60, 40, 0.12)",
    borderTopColor: "rgb(8, 117, 56)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  splashText: {
    color: "#6b8a7a",
    fontSize: "0.9rem",
    letterSpacing: "0.02em",
  },
};
