import { useState, useEffect, useCallback } from "react";
import { sipService } from "../sip-service";
import type { AppSession } from "../../shared/types";

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
        await sipService.register(session.telephonyExtension);
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
        await sipService.register(data.telephonyExtension);
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
        await sipService.register(data.telephonyExtension);
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
