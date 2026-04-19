import { useState, useEffect, useCallback } from "react";
import { sipService } from "../sip-service";
import type { AppSession, TelephonyExtensionInfo } from "../../shared/types";

declare global {
  interface Window {
    crmPhone: any;
  }
}

interface AuthState {
  loading: boolean;
  session: AppSession | null;
  sipRegistered: boolean;
  error: string | null;
}

/**
 * Obtain fresh SIP credentials (audit/P0-C).
 *
 * - On initial app-login, the backend returns `telephonyExtension` with
 *   `sipPassword` in the response body. Pass that in as `immediate` to
 *   avoid a wasted round-trip.
 * - On app restart / session restore / SIP re-register, call with no
 *   arg — this hits GET /v1/telephony/sip-credentials using the stored
 *   JWT. Returns null if JWT expired (401) or no extension bound (404).
 *
 * The returned object is held in memory only and passed to SipService
 * for registration — it is never persisted to disk.
 */
async function obtainSipCredentials(
  immediate?: TelephonyExtensionInfo | null,
): Promise<TelephonyExtensionInfo | null> {
  if (immediate?.sipPassword) return immediate;
  return window.crmPhone.sip.fetchCredentials();
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    sipRegistered: false,
    error: null,
  });

  useEffect(() => {
    const onRegState = (registered: boolean) => {
      setState((prev) => ({ ...prev, sipRegistered: registered }));
    };
    sipService.on("registration-state", onRegState);

    window.crmPhone.auth.getSession().then(async (data: any) => {
      const session: AppSession | null = data.session;
      setState({
        loading: false,
        session,
        sipRegistered: false,
        error: null,
      });

      if (session?.telephonyExtension) {
        // Fetch fresh SIP credentials using the stored JWT — password is
        // not on disk (audit/P0-C).
        const creds = await obtainSipCredentials();
        if (creds) {
          await sipService.register(creds);
        }
      }
    });

    const unsub = window.crmPhone.auth.onSessionChanged(async (data: any) => {
      setState((prev) => ({
        ...prev,
        session: data,
        sipRegistered: false,
      }));
      // On user switch, explicitly unregister the old SIP session and wait
      // for Asterisk to drop the old contact BEFORE registering the new one.
      // Without this gap, the new UserAgent may open its WSS connection
      // while Asterisk still has the old user's AOR cached, causing inbound
      // calls to route to the dead socket.
      await sipService.unregister();
      if (data?.telephonyExtension) {
        // Small additional gap so Asterisk has fully processed the
        // expires-0 REGISTER before the new one arrives.
        await new Promise((r) => setTimeout(r, 750));
        // The session-changed payload comes from /auth/exchange-token via
        // the local-server bridge — that response still contains the full
        // extension including sipPassword (we haven't changed
        // /auth/exchange-token, audit/P0-B scope). Use it directly.
        const creds = await obtainSipCredentials(data.telephonyExtension);
        if (creds) {
          await sipService.register(creds);
        }
      }
    });

    return () => {
      unsub();
      sipService.off("registration-state", onRegState);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await window.crmPhone.auth.login(email, password);
      setState({
        loading: false,
        session: data,
        sipRegistered: false,
        error: null,
      });
      if (data.telephonyExtension) {
        // Use the password from the app-login response directly (still in
        // memory, never persisted). Audit: P0-C.
        const creds = await obtainSipCredentials(data.telephonyExtension);
        if (creds) {
          await sipService.register(creds);
        }
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Login failed",
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    await sipService.unregister();
    await window.crmPhone.auth.logout();
    setState({
      loading: false,
      session: null,
      sipRegistered: false,
      error: null,
    });
  }, []);

  return { ...state, login, logout };
}
