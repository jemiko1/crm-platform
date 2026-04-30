import { useEffect } from "react";
import { sipService } from "../sip-service";

declare global {
  interface Window {
    crmPhone: any;
  }
}

/**
 * Auto-rebind SIP when the backend signals an extension change.
 *
 * Flow:
 *   1. Backend's TelephonyGateway.notifyExtensionChanged() fires
 *      `extension:changed` over the /telephony Socket.IO namespace.
 *   2. Softphone main process forwards via IPC channel EXTENSION_CHANGED.
 *   3. This hook receives the event, checks SIP call state:
 *      - idle  → run the rebind immediately
 *      - busy  → set `pending` flag, attach a state-change listener,
 *                run the rebind only after the call ends.
 *
 * **Strict rule (memory: feedback_never_terminate_active_call):**
 * never terminate or interrupt an in-progress call to apply a config
 * change. The rebind always waits for `_callState === "idle"`.
 *
 * The rebind itself:
 *   1. await sipService.unregister() — drops the old contact in Asterisk
 *   2. wait 750ms — matches the gap useAuth uses on user-switch so
 *      Asterisk fully processes the expires-0 REGISTER before the new one
 *   3. await window.crmPhone.session.refresh() — re-fetches /auth/me and
 *      persists fresh extension metadata
 *   4. await window.crmPhone.sip.fetchCredentials() — pulls fresh
 *      sipPassword from /v1/telephony/sip-credentials (audit/P0-C —
 *      password never persisted)
 *   5. if creds, sipService.register(creds) — registers new SIP
 *      if the rebind result is "no extension bound" (admin unlinked
 *      without re-linking), credentials come back null and we stay
 *      unregistered. The SIP indicator goes red until admin re-links.
 *
 * The `userId` arg ensures the hook resets all internal state when the
 * operator switches accounts. Without that dep, a stale `pending=true`
 * from the prior user could fire a rebind under the new user when their
 * call ends. Passing `null` (no session) tears down the listener so
 * events from a stale socket can't reach the new login.
 */
export function useExtensionRebind(userId: string | null) {
  useEffect(() => {
    if (!userId) {
      // No session — no listener, no pending state.
      return;
    }
    let pending = false;

    const runRebind = async (reason: string) => {
      console.log(`[REBIND] starting (reason=${reason})`);
      try {
        await sipService.unregister();
        await new Promise((r) => setTimeout(r, 750));
        const refresh = await window.crmPhone.session.refresh();
        if (!refresh.ok) {
          console.warn("[REBIND] session refresh failed — skipping register");
          return;
        }
        if (!refresh.telephonyExtension) {
          console.log("[REBIND] no extension bound — staying unregistered");
          return;
        }
        const creds = await window.crmPhone.sip.fetchCredentials();
        if (creds) {
          await sipService.register(creds);
          console.log("[REBIND] re-registered with new credentials");
        } else {
          console.warn("[REBIND] sipCredentials returned null");
        }
      } catch (err: any) {
        console.error(`[REBIND] failed: ${err?.message ?? err}`);
      }
    };

    const onIdleAfterPending = (data: { callState: string }) => {
      if (!pending) return;
      if (data.callState !== "idle") return;
      pending = false;
      sipService.off("state-change", onIdleAfterPending);
      void runRebind("deferred-after-call");
    };

    const onExtensionChanged = (payload: {
      reason: string;
      timestamp: string;
    }) => {
      console.log(
        `[REBIND] extension:changed received (reason=${payload.reason})`,
      );
      if (sipService.callState === "idle") {
        void runRebind(payload.reason);
        return;
      }
      // STRICT RULE: never drop a call. Defer until idle.
      console.log(
        `[REBIND] active call (state=${sipService.callState}) — deferring rebind until call ends`,
      );
      pending = true;
      // Replace any prior pending listener (only one rebind ever queues).
      sipService.off("state-change", onIdleAfterPending);
      sipService.on("state-change", onIdleAfterPending);
    };

    const unsubscribe = window.crmPhone.session.onExtensionChanged(
      onExtensionChanged,
    );

    return () => {
      unsubscribe();
      sipService.off("state-change", onIdleAfterPending);
    };
  }, [userId]);
}
