import React, { useState, useEffect, useRef } from "react";
import type { AppSession, ActiveCall, CallState, CallerLookupResult } from "../../shared/types";
import { IncomingCallPopup } from "./IncomingCallPopup";
import { CallerCard } from "./CallerCard";
import { CallHistory } from "./CallHistory";
import { SettingsPage } from "./SettingsPage";
import { startRingtone, stopRingtone } from "../ringtone";
import {
  BRAND,
  BRAND_PRESSED,
  BRAND_SOFT,
  BORDER_SOFT,
  CARD,
  PILL_AVAILABLE,
  PILL_BREAK,
  PILL_INCALL,
  PILL_OFFLINE,
  SHADOW_CARD,
  SHADOW_CTA,
  SHADOW_DANGER,
  SURFACE_CARD,
  SURFACE_GRADIENT,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_STRONG,
  TEXT_SUBTLE,
} from "../theme";

interface Props {
  session: AppSession;
  sipRegistered: boolean;
  callState: CallState;
  activeCall: ActiveCall | null;
  muted: boolean;
  onDial: (number: string) => Promise<void>;
  onAnswer: () => Promise<void>;
  onHangup: () => Promise<void>;
  onHold: () => Promise<void>;
  onUnhold: () => Promise<void>;
  onDtmf: (tone: string) => void;
  onToggleMute: () => void;
  onLogout: () => Promise<void>;
  /** Number requested from an external source (CRM click-to-call). Loads
   *  into the dial input but does NOT auto-dial. */
  prefillNumber?: string | null;
  onPrefillConsumed?: () => void;
  // ── Break + DND props ──
  breakStarting: boolean;
  breakError: string | null;
  onBreakStart: () => Promise<boolean>;
  dndEnabled: boolean;
  dndLoading: boolean;
  dndError: string | null;
  onDndToggle: (target: boolean) => Promise<void>;
}

/**
 * DTMF keypad layout. The letter subtitle (ABC, DEF…) matches the
 * familiar phone keypad and gives each key more presence in the grid.
 */
const DTMF_KEYS: Array<{ digit: string; letters?: string }> = [
  { digit: "1" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*" },
  { digit: "0", letters: "+" },
  { digit: "#" },
];

type Tab = "keypad" | "history" | "dnd" | "break";

export function PhonePage(props: Props) {
  const {
    session, sipRegistered, callState, activeCall, muted,
    onDial, onAnswer, onHangup, onHold, onUnhold, onDtmf, onToggleMute, onLogout,
    prefillNumber, onPrefillConsumed,
    breakStarting, breakError, onBreakStart,
    dndEnabled, dndLoading, dndError, onDndToggle,
  } = props;

  const [dialNumber, setDialNumber] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<Tab>("keypad");
  const [callerLookup, setCallerLookup] = useState<CallerLookupResult | null>(null);
  const wasRinging = useRef(false);
  const lookupDone = useRef<string | null>(null);

  // External click-to-call — load number + jump to keypad, don't auto-dial.
  useEffect(() => {
    if (!prefillNumber) return;
    setDialNumber(prefillNumber);
    setTab("keypad");
    setShowSettings(false);
    onPrefillConsumed?.();
  }, [prefillNumber, onPrefillConsumed]);

  // Caller lookup — fire once per call.
  useEffect(() => {
    if (activeCall && activeCall.remoteNumber && lookupDone.current !== activeCall.remoteNumber) {
      lookupDone.current = activeCall.remoteNumber;
      setCallerLookup(null);
      window.crmPhone.contact
        .lookup(activeCall.remoteNumber)
        .then((result: CallerLookupResult | null) => {
          if (result) setCallerLookup(result);
        })
        .catch(() => {});
    }
    if (!activeCall) {
      lookupDone.current = null;
      setCallerLookup(null);
    }
  }, [activeCall]);

  // Ringtone + always-on-top while an inbound call is ringing.
  useEffect(() => {
    const ringing = callState === "ringing" && activeCall?.direction === "inbound";
    if (ringing && !wasRinging.current) {
      wasRinging.current = true;
      window.crmPhone.settings.get().then((s: any) => {
        if (!s.muteRingtone) startRingtone();
        if (s.overrideApps) window.crmPhone.window.setAlwaysOnTop(true);
      });
    }
    if (!ringing && wasRinging.current) {
      wasRinging.current = false;
      stopRingtone();
      window.crmPhone.window.setAlwaysOnTop(false);
    }
  }, [callState, activeCall]);

  // ── Derived display values ──

  const userName =
    (session.user.firstName ? `${session.user.firstName} ${session.user.lastName || ""}` : session.user.email).trim();
  const ext = session.telephonyExtension?.extension || "—";
  const hasActiveCall = callState !== "idle" && !!activeCall;
  const isInboundRinging =
    (callState === "ringing" || callState === "connecting") &&
    activeCall?.direction === "inbound";

  // ── Settings overlay takes the whole window. Break modal and
  // inbound ringing are handled in App.tsx BEFORE this component
  // ever renders, so we only need to handle Settings here. ──

  if (showSettings) {
    return (
      <SettingsPage
        onBack={() => setShowSettings(false)}
        onLogout={onLogout}
      />
    );
  }

  if (isInboundRinging && activeCall) {
    return (
      <IncomingCallPopup
        call={activeCall}
        callState={callState}
        lookup={callerLookup}
        onAnswer={onAnswer}
        onReject={onHangup}
      />
    );
  }

  // ── Action handlers that the bottom tab bar needs ──

  const handleDndTabClick = async () => {
    if (dndLoading) return;
    await onDndToggle(!dndEnabled);
  };

  const handleBreakTabClick = async () => {
    if (breakStarting) return;
    if (!sipRegistered) return;
    if (callState !== "idle") return;
    if (!session.telephonyExtension) return;
    const ok = window.confirm(
      "Start a break?\n\nYou'll be unregistered from the phone system until you resume.",
    );
    if (!ok) return;
    await onBreakStart();
  };

  const handleDial = () => {
    if (dialNumber.trim()) {
      onDial(dialNumber.trim());
      setDialNumber("");
    }
  };

  const handleKeyPress = (key: string) => {
    if (callState === "connected") {
      onDtmf(key);
    } else {
      setDialNumber((prev) => prev + key);
    }
  };

  // Presence pill text — "Available", "On Call", "On Hold", "Offline".
  const presencePill = (() => {
    if (!sipRegistered) {
      return { text: "Offline", style: PILL_OFFLINE, dotColor: "#ef4444" };
    }
    if (callState === "connected") {
      return { text: "In Call", style: PILL_INCALL, dotColor: BRAND };
    }
    if (callState === "hold") {
      return { text: "On Hold", style: PILL_BREAK, dotColor: "#d97706" };
    }
    if (callState === "dialing" || callState === "ringing") {
      return { text: "Connecting", style: PILL_INCALL, dotColor: BRAND };
    }
    return { text: "Available", style: PILL_AVAILABLE, dotColor: BRAND };
  })();

  // Tabs are "action-like" when they represent an immediate toggle
  // (DND) or a state-entry (Break) — rendered in the bar but not
  // selected as the currently visible screen. Keypad and History
  // are real content tabs.
  const currentContent: "keypad" | "history" | "call" = hasActiveCall
    ? "call"
    : tab === "history"
    ? "history"
    : "keypad";

  return (
    <div style={styles.container}>
      {/* Title bar — translucent so the mint wash shows through.
          Drag-handle for the frameless window. */}
      <div style={styles.titleBar}>
        <span style={styles.titleText}>CRM28 Softphone</span>
        <div style={styles.titleBtnRow}>
          <button
            onClick={() => window.crmPhone.app.hide()}
            style={styles.titleBtn}
            title="Minimize to tray"
            aria-label="Minimize"
          >
            −
          </button>
          <button
            onClick={() => window.crmPhone.app.hide()}
            style={styles.titleBtn}
            title="Maximize (unused)"
            aria-label="Maximize"
          >
            □
          </button>
          <button
            onClick={() => window.crmPhone.app.hide()}
            style={{ ...styles.titleBtn, color: "#b91c1c" }}
            title="Close to tray"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Status bar — presence pill on the left (with live dot), call
          timer on the right when in call, settings gear always visible. */}
      <div style={styles.statusBar}>
        <div
          style={{ ...styles.presencePill, ...presencePill.style }}
          title={`${userName} · Ext ${ext}`}
        >
          <span
            style={{ ...styles.presenceDot, background: presencePill.dotColor }}
          />
          <span>{presencePill.text}</span>
        </div>

        <div style={styles.statusRight}>
          {hasActiveCall && activeCall && (
            <CallTimer startedAt={activeCall.answeredAt ?? activeCall.startedAt} />
          )}
          <button
            onClick={() => setShowSettings(true)}
            style={styles.gearBtn}
            title="Settings"
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Global error banners */}
      {(breakError || dndError) && (
        <div style={styles.errorBar}>
          {breakError && <div style={styles.errorLine}>Break: {breakError}</div>}
          {dndError && <div style={styles.errorLine}>DND: {dndError}</div>}
        </div>
      )}

      {/* Main content area — swaps between call view, dialpad, or history */}
      <div style={styles.scrollArea}>
        {currentContent === "call" && activeCall ? (
          <InCallView
            activeCall={activeCall}
            callState={callState}
            muted={muted}
            callerLookup={callerLookup}
            onToggleMute={onToggleMute}
            onHold={onHold}
            onUnhold={onUnhold}
            onHangup={onHangup}
            handleKeyPress={handleKeyPress}
          />
        ) : currentContent === "history" ? (
          <div style={styles.historyWrap}>
            <CallHistory
              extension={ext}
              onDial={(number) => {
                setDialNumber(number);
                setTab("keypad");
                onDial(number);
              }}
            />
          </div>
        ) : (
          <DialpadView
            dialNumber={dialNumber}
            setDialNumber={setDialNumber}
            sipRegistered={sipRegistered}
            handleDial={handleDial}
            handleKeyPress={handleKeyPress}
          />
        )}
      </div>

      {/* Bottom tab bar — Keypad / History / DND / Break.
          DND and Break are action-toggles rather than content-tabs;
          they're disabled while inapplicable (e.g. during a call). */}
      <nav style={styles.bottomNav} aria-label="Softphone primary navigation">
        <TabButton
          label="Keypad"
          icon={<KeypadIcon />}
          active={tab === "keypad" && !hasActiveCall}
          onClick={() => {
            setTab("keypad");
          }}
        />
        <TabButton
          label="History"
          icon={<HistoryIcon />}
          active={tab === "history" && !hasActiveCall}
          disabled={hasActiveCall}
          onClick={() => {
            if (hasActiveCall) return;
            setTab("history");
          }}
        />
        <TabButton
          label="DND"
          icon={<DndIcon />}
          active={dndEnabled}
          loading={dndLoading}
          disabled={!sipRegistered || !session.telephonyExtension}
          onClick={handleDndTabClick}
          title={
            dndEnabled
              ? "Do Not Disturb is ON — queue calls skip you. Click to turn off."
              : "Turn on Do Not Disturb — queue calls will skip your extension."
          }
        />
        <TabButton
          label="Break"
          icon={<BreakIcon />}
          disabled={
            breakStarting ||
            !sipRegistered ||
            callState !== "idle" ||
            !session.telephonyExtension
          }
          loading={breakStarting}
          onClick={handleBreakTabClick}
          title={
            !sipRegistered
              ? "Must be registered to start a break"
              : callState !== "idle"
                ? "Finish the current call first"
                : "Start a break — SIP will be unregistered"
          }
        />
      </nav>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function CallTimer({ startedAt }: { startedAt: string }) {
  // Render a live-ticking mm:ss (or hh:mm:ss) next to the status pill
  // so the operator always knows how long they've been on the call.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text =
    h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return <span style={styles.callTimer}>{text}</span>;
}

function DialpadView(props: {
  dialNumber: string;
  setDialNumber: (v: string) => void;
  sipRegistered: boolean;
  handleDial: () => void;
  handleKeyPress: (k: string) => void;
}) {
  const { dialNumber, setDialNumber, sipRegistered, handleDial, handleKeyPress } = props;
  return (
    <div style={styles.dialpadBody}>
      <div style={styles.numberInputWrap}>
        <input
          type="text"
          value={dialNumber}
          onChange={(e) => setDialNumber(e.target.value)}
          placeholder="Enter number or name"
          style={styles.numberInput}
          onKeyDown={(e) => e.key === "Enter" && handleDial()}
        />
        {dialNumber && (
          <button
            onClick={() => setDialNumber("")}
            style={styles.clearBtn}
            aria-label="Clear number"
            title="Clear"
          >
            ⌫
          </button>
        )}
      </div>

      <div style={styles.dialpadGrid}>
        {DTMF_KEYS.map((k) => (
          <button
            key={k.digit}
            onClick={() => handleKeyPress(k.digit)}
            style={styles.dialKey}
          >
            <span style={styles.dialDigit}>{k.digit}</span>
            {k.letters && <span style={styles.dialLetters}>{k.letters}</span>}
          </button>
        ))}
      </div>

      <button
        onClick={handleDial}
        disabled={!sipRegistered || !dialNumber.trim()}
        style={{
          ...styles.callBtn,
          opacity: !sipRegistered || !dialNumber.trim() ? 0.5 : 1,
          cursor: !sipRegistered || !dialNumber.trim() ? "not-allowed" : "pointer",
        }}
        aria-label="Call"
      >
        <PhoneIcon />
      </button>
    </div>
  );
}

function InCallView(props: {
  activeCall: ActiveCall;
  callState: CallState;
  muted: boolean;
  callerLookup: CallerLookupResult | null;
  onToggleMute: () => void;
  onHold: () => Promise<void>;
  onUnhold: () => Promise<void>;
  onHangup: () => Promise<void>;
  handleKeyPress: (k: string) => void;
}) {
  const { activeCall, callState, muted, callerLookup, onToggleMute, onHold, onUnhold, onHangup } = props;
  const [keypadOpen, setKeypadOpen] = useState(false);
  const displayName =
    callerLookup?.client?.name ||
    activeCall.remoteName ||
    activeCall.remoteNumber ||
    "Unknown";
  const canControl = callState === "connected" || callState === "hold";

  return (
    <div style={styles.callBody}>
      <div style={styles.avatar} aria-hidden="true">
        <PersonIcon />
      </div>

      <div style={styles.callName}>{displayName}</div>
      <div style={styles.callNumber}>{activeCall.remoteNumber}</div>

      <div style={styles.callActions}>
        <ActionCard
          icon={<MicIcon muted={muted} />}
          label={muted ? "Unmute" : "Mute"}
          active={muted}
          disabled={!canControl}
          onClick={onToggleMute}
        />
        <ActionCard
          icon={<PauseIcon />}
          label={callState === "hold" ? "Resume" : "Hold"}
          active={callState === "hold"}
          disabled={!canControl}
          onClick={() => (callState === "hold" ? onUnhold() : onHold())}
        />
        <ActionCard
          icon={<TransferIcon />}
          label="Transfer"
          disabled={!canControl}
          onClick={() => {
            // TODO — real transfer UI would collect a destination
            // extension via a prompt or inline input. Stubbed for now.
            window.alert("Transfer is not implemented yet.");
          }}
        />
        <ActionCard
          icon={<KeypadIcon />}
          label="Keypad"
          active={keypadOpen}
          disabled={!canControl}
          onClick={() => setKeypadOpen((v) => !v)}
        />
      </div>

      {keypadOpen && (
        <div style={styles.dtmfGridInline}>
          {DTMF_KEYS.map((k) => (
            <button
              key={k.digit}
              onClick={() => props.handleKeyPress(k.digit)}
              style={styles.dialKeySmall}
            >
              {k.digit}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          const phone = activeCall.remoteNumber;
          const url = `https://crm28.asg.ge/app/call-center/reports?openReport=true&phone=${encodeURIComponent(phone || "")}`;
          window.crmPhone.app.openExternal(url);
        }}
        style={styles.reportBtn}
      >
        <ReportIcon /> <span>CREATE REPORT</span>
      </button>

      <button onClick={onHangup} style={styles.hangupBar} aria-label="Hang up">
        <HangupIcon />
      </button>

      {callerLookup && canControl && (
        <div style={{ width: "100%", marginTop: "0.75rem" }}>
          <CallerCard lookup={callerLookup} callingNumber={activeCall.remoteNumber} />
        </div>
      )}
    </div>
  );
}

function ActionCard(props: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { icon, label, active, disabled, onClick } = props;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        ...styles.actionCard,
        ...(active ? styles.actionCardActive : null),
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={styles.actionIcon}>{icon}</span>
      <span style={styles.actionLabel}>{label}</span>
    </button>
  );
}

function TabButton(props: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  const { label, icon, active, loading, disabled, onClick, title } = props;
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-pressed={active}
      style={{
        ...styles.tab,
        color: active ? BRAND : TEXT_MUTED,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={styles.tabIcon}>{icon}</span>
      <span style={styles.tabLabel}>{loading ? "…" : label}</span>
    </button>
  );
}

// ── Icons ────────────────────────────────────────────────────────
// Inline SVGs avoid a runtime dep + let us recolor via currentColor.
// Every icon is 22×22 on the outside — consistent stroke weight.

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function KeypadIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="5" cy="6" r="1" />
      <circle cx="12" cy="6" r="1" />
      <circle cx="19" cy="6" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="18" r="1" />
      <circle cx="12" cy="18" r="1" />
      <circle cx="19" cy="18" r="1" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function DndIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function BreakIcon() {
  return (
    <svg {...iconProps}>
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function HangupIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(135deg)" }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg {...iconProps}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
      {muted && <line x1="4" y1="4" x2="20" y2="20" stroke="#dc2626" strokeWidth="2.5" />}
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg {...iconProps}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg {...iconProps}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: SURFACE_GRADIENT,
    color: TEXT_STRONG,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },

  // Title bar (draggable)
  titleBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 0.85rem 0.4rem",
    WebkitAppRegion: "drag" as any,
    flexShrink: 0,
  },
  titleText: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: TEXT_STRONG,
    letterSpacing: "-0.01em",
  },
  titleBtnRow: {
    display: "flex",
    gap: "0.15rem",
    WebkitAppRegion: "no-drag" as any,
  },
  titleBtn: {
    width: 26,
    height: 22,
    background: "transparent",
    border: "none",
    color: TEXT_MUTED,
    fontSize: "0.95rem",
    lineHeight: 1,
    cursor: "pointer",
    borderRadius: 4,
    padding: 0,
  },

  // Status bar (presence + timer + settings)
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 0.95rem 0.75rem",
    flexShrink: 0,
  },
  presencePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: "0.8rem",
    fontWeight: 600,
    boxShadow: "0 1px 2px rgba(15, 60, 40, 0.04)",
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  callTimer: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: BRAND,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
  },
  gearBtn: {
    width: 30,
    height: 30,
    border: "none",
    background: "transparent",
    color: TEXT_MUTED,
    fontSize: "1.1rem",
    cursor: "pointer",
    borderRadius: 6,
  },

  // Error banners (break/dnd errors)
  errorBar: {
    margin: "0 0.9rem 0.5rem",
    padding: "0.5rem 0.75rem",
    background: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    borderRadius: 10,
    color: "#b91c1c",
    fontSize: "0.75rem",
    flexShrink: 0,
  },
  errorLine: { marginBottom: 2 },

  // Main scrollable middle region (keeps nav pinned).
  scrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  },

  // Dialpad
  dialpadBody: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    padding: "0 0.9rem",
    gap: "0.6rem",
  },
  numberInputWrap: {
    position: "relative" as const,
    ...CARD,
    padding: "0.7rem 1rem",
    display: "flex",
    alignItems: "center",
  },
  numberInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: TEXT_STRONG,
    fontSize: "1rem",
    letterSpacing: "0.02em",
    fontFamily: "inherit",
  },
  clearBtn: {
    width: 28,
    height: 28,
    border: "none",
    background: "transparent",
    color: TEXT_SUBTLE,
    fontSize: "0.9rem",
    cursor: "pointer",
    borderRadius: 4,
  },
  dialpadGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.5rem",
  },
  dialKey: {
    ...CARD,
    padding: "0.7rem 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    cursor: "pointer",
    transition: "transform 80ms ease, box-shadow 120ms ease",
    minHeight: 58,
  },
  dialDigit: {
    fontSize: "1.35rem",
    fontWeight: 500,
    color: TEXT_STRONG,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  dialLetters: {
    fontSize: "0.6rem",
    color: TEXT_MUTED,
    letterSpacing: "0.18em",
    fontWeight: 600,
  },
  callBtn: {
    alignSelf: "center",
    width: 62,
    height: 62,
    borderRadius: 999,
    border: "none",
    background: BRAND,
    color: "white",
    fontSize: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: SHADOW_CTA,
    marginTop: "0.25rem",
    marginBottom: "0.5rem",
    transition: "background 120ms ease, transform 80ms ease",
  },

  // History tab wrap (gives CallHistory some padding)
  historyWrap: {
    padding: "0 0.9rem",
    flex: 1,
  },

  // In-call
  callBody: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem 1rem 0.9rem",
    gap: "0.35rem",
    flex: 1,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: "50%",
    background: SURFACE_CARD,
    border: `1px solid ${BORDER_SOFT}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // Layered shadow: soft outer + subtle inner highlight, mimicking
    // the neumorphic avatar in the reference image.
    boxShadow:
      "0 6px 18px rgba(15, 60, 40, 0.10), 0 1px 2px rgba(15, 60, 40, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
    marginBottom: "0.4rem",
    flexShrink: 0,
  },
  callName: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: TEXT_STRONG,
    textAlign: "center",
    lineHeight: 1.2,
    padding: "0 0.5rem",
  },
  callNumber: {
    fontSize: "0.85rem",
    color: TEXT_MUTED,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.04em",
    marginBottom: "0.75rem",
  },
  callActions: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "0.4rem",
    width: "100%",
  },
  actionCard: {
    ...CARD,
    padding: "0.55rem 0.3rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 66,
    color: TEXT_BODY,
    transition: "background 120ms ease, box-shadow 120ms ease",
  },
  actionCardActive: {
    background: BRAND_SOFT,
    color: BRAND,
    border: `1px solid rgba(8, 117, 56, 0.25)`,
  },
  actionIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
  },
  actionLabel: {
    fontSize: "0.68rem",
    fontWeight: 600,
    letterSpacing: "0.01em",
  },
  dtmfGridInline: {
    width: "100%",
    marginTop: "0.5rem",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.3rem",
  },
  dialKeySmall: {
    ...CARD,
    padding: "0.5rem 0",
    textAlign: "center",
    color: TEXT_STRONG,
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  reportBtn: {
    marginTop: "0.8rem",
    width: "100%",
    padding: "0.75rem",
    borderRadius: 10,
    border: "none",
    background: BRAND,
    color: "white",
    fontSize: "0.85rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    boxShadow: SHADOW_CTA,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  hangupBar: {
    marginTop: "0.5rem",
    width: "100%",
    padding: "0.85rem",
    borderRadius: 10,
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    boxShadow: SHADOW_DANGER,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // Bottom tab navigation
  bottomNav: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    padding: "0.5rem 0.25rem 0.6rem",
    borderTop: `1px solid ${BORDER_SOFT}`,
    background: "rgba(255, 255, 255, 0.55)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    flexShrink: 0,
  },
  tab: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    background: "transparent",
    border: "none",
    padding: "0.3rem 0",
    transition: "color 120ms ease",
  },
  tabIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
  },
  tabLabel: {
    fontSize: "0.68rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
};
