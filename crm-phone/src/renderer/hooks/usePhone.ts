import { useState, useEffect, useCallback } from "react";
import type { ActiveCall, CallState } from "../../shared/types";

interface PhoneState {
  callState: CallState;
  activeCall: ActiveCall | null;
  muted: boolean;
}

export function usePhone() {
  const [state, setState] = useState<PhoneState>({
    callState: "idle",
    activeCall: null,
    muted: false,
  });

  useEffect(() => {
    const unsub = window.crmPhone.phone.onStateChanged((s: any) => {
      setState({
        callState: s.callState,
        activeCall: s.activeCall,
        muted: s.muted ?? false,
      });
    });

    return unsub;
  }, []);

  const dial = useCallback(async (number: string) => {
    await window.crmPhone.phone.dial(number);
  }, []);

  const answer = useCallback(async () => {
    await window.crmPhone.phone.answer();
  }, []);

  const hangup = useCallback(async () => {
    await window.crmPhone.phone.hangup();
  }, []);

  const hold = useCallback(async () => {
    await window.crmPhone.phone.hold();
  }, []);

  const unhold = useCallback(async () => {
    await window.crmPhone.phone.unhold();
  }, []);

  const dtmf = useCallback(async (tone: string) => {
    await window.crmPhone.phone.dtmf(tone);
  }, []);

  const toggleMute = useCallback(async () => {
    await window.crmPhone.phone.mute();
  }, []);

  return { ...state, dial, answer, hangup, hold, unhold, dtmf, toggleMute };
}
