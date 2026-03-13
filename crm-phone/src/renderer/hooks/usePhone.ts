import { useState, useEffect, useCallback } from "react";
import { sipService } from "../sip-service";
import type { ActiveCall, CallState } from "../../shared/types";

interface PhoneState {
  callState: CallState;
  activeCall: ActiveCall | null;
  muted: boolean;
}

export function usePhone() {
  const [state, setState] = useState<PhoneState>({
    callState: sipService.callState,
    activeCall: sipService.activeCall,
    muted: sipService.muted,
  });

  useEffect(() => {
    const onStateChange = (s: any) => {
      setState({
        callState: s.callState,
        activeCall: s.activeCall,
        muted: s.muted ?? false,
      });
    };
    sipService.on("state-change", onStateChange);
    return () => { sipService.off("state-change", onStateChange); };
  }, []);

  const dial = useCallback(async (number: string) => {
    await sipService.dial(number);
  }, []);

  const answer = useCallback(async () => {
    await sipService.answer();
  }, []);

  const hangup = useCallback(async () => {
    await sipService.hangup();
  }, []);

  const hold = useCallback(async () => {
    await sipService.hold();
  }, []);

  const unhold = useCallback(async () => {
    await sipService.unhold();
  }, []);

  const dtmf = useCallback((tone: string) => {
    sipService.sendDtmf(tone);
  }, []);

  const toggleMute = useCallback(() => {
    sipService.toggleMute();
  }, []);

  return { ...state, dial, answer, hangup, hold, unhold, dtmf, toggleMute };
}
