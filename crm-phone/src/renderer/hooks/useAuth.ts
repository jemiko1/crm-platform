import { useState, useEffect, useCallback } from "react";
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
    window.crmPhone.auth.getSession().then((data: any) => {
      setState({
        loading: false,
        session: data.session,
        sipRegistered: data.sipRegistered,
        error: null,
      });
    });

    const unsub = window.crmPhone.auth.onSessionChanged((data: any) => {
      setState((prev) => ({
        ...prev,
        session: data,
        sipRegistered: false,
      }));
    });

    const unsubSip = window.crmPhone.phone.onSipStatus((registered: boolean) => {
      setState((prev) => ({ ...prev, sipRegistered: registered }));
    });

    return () => {
      unsub();
      unsubSip();
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
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Login failed",
      }));
    }
  }, []);

  const logout = useCallback(async () => {
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
