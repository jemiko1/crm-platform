import React, { useEffect, useState, useCallback } from "react";
import { WindowControls } from "../components/WindowControls";
import {
  BORDER_SOFT,
  BRAND,
  CARD,
  SHADOW_CARD,
  SURFACE_CARD,
  SURFACE_GRADIENT,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_STRONG,
} from "../theme";

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface Settings {
  muteRingtone: boolean;
  overrideApps: boolean;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
}

interface UpdateStatus {
  state: "idle" | "checking" | "available" | "downloading" | "downloaded" | "not-available" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

interface Props {
  onBack: () => void;
  /**
   * v1.11.0: Log Out moved from the PhonePage footer and the Break
   * modal into this screen. It's the last action in the list so the
   * operator has to scroll past every other setting first, which
   * makes it a deliberate "I'm done for the day" choice rather than
   * something clicked by accident during a busy shift.
   */
  onLogout?: () => Promise<void>;
}

export function SettingsPage({ onBack, onLogout }: Props) {
  const [settings, setSettings] = useState<Settings>({
    muteRingtone: false,
    overrideApps: true,
    audioInputDeviceId: "",
    audioOutputDeviceId: "",
  });
  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [testingMic, setTestingMic] = useState(false);
  const [testingSpk, setTestingSpk] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: "idle" });

  useEffect(() => {
    window.crmPhone.settings.get().then((s: Settings) => setSettings(s));
    window.crmPhone.updater?.getVersion?.().then((v: string) => setAppVersion(v || "dev"));
    const unsub = window.crmPhone.updater?.onStatus?.((s: UpdateStatus) => setUpdateStatus(s));
    loadDevices();
    return () => { unsub?.(); };
  }, []);

  async function loadDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    setInputs(devices.filter(d => d.kind === "audioinput").map(d => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`,
    })));
    setOutputs(devices.filter(d => d.kind === "audiooutput").map(d => ({
      deviceId: d.deviceId,
      label: d.label || `Speaker ${d.deviceId.slice(0, 6)}`,
    })));
  }

  const updateSetting = useCallback(async (key: keyof Settings, value: any) => {
    const updated = await window.crmPhone.settings.set(key, value);
    setSettings(updated);
  }, []);

  const testMic = useCallback(async () => {
    if (testingMic) return;
    setTestingMic(true);
    try {
      const constraints: any = { audio: settings.audioInputDeviceId
        ? { deviceId: { exact: settings.audioInputDeviceId } }
        : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let running = true;

      const tick = () => {
        if (!running) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, avg * 2));
        requestAnimationFrame(tick);
      };
      tick();

      setTimeout(() => {
        running = false;
        stream.getTracks().forEach(t => t.stop());
        ctx.close();
        setTestingMic(false);
        setMicLevel(0);
      }, 5000);
    } catch (err: any) {
      console.error("Mic test failed:", err.message);
      setTestingMic(false);
    }
  }, [testingMic, settings.audioInputDeviceId]);

  const testSpeaker = useCallback(async () => {
    if (testingSpk) return;
    setTestingSpk(true);
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 600;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
        setTestingSpk(false);
      }, 2000);
    } catch {
      setTestingSpk(false);
    }
  }, [testingSpk]);

  return (
    <div style={styles.container}>
      <div style={styles.titleBar}>
        <button onClick={onBack} style={styles.backBtn}>← Back</button>
        <span style={styles.titleText}>Settings</span>
        <WindowControls />
      </div>

      <div style={styles.content}>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Call Behavior</h3>

          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={settings.muteRingtone}
              onChange={(e) => updateSetting("muteRingtone", e.target.checked)}
              style={styles.checkbox}
            />
            <span style={styles.checkLabel}>Mute Ringtone</span>
          </label>

          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={settings.overrideApps}
              onChange={(e) => updateSetting("overrideApps", e.target.checked)}
              style={styles.checkbox}
            />
            <span style={styles.checkLabel}>Override other apps on incoming call</span>
          </label>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Microphone</h3>
          <select
            value={settings.audioInputDeviceId}
            onChange={(e) => updateSetting("audioInputDeviceId", e.target.value)}
            style={styles.select}
          >
            <option value="">System Default</option>
            {inputs.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
          <div style={styles.testRow}>
            <button onClick={testMic} disabled={testingMic} style={styles.testBtn}>
              {testingMic ? "Listening..." : "Test Mic"}
            </button>
            <div style={styles.meterBg}>
              <div style={{ ...styles.meterFill, width: `${micLevel}%` }} />
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Speaker</h3>
          <select
            value={settings.audioOutputDeviceId}
            onChange={(e) => updateSetting("audioOutputDeviceId", e.target.value)}
            style={styles.select}
          >
            <option value="">System Default</option>
            {outputs.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
          <button onClick={testSpeaker} disabled={testingSpk} style={styles.testBtn}>
            {testingSpk ? "Playing..." : "Test Speaker"}
          </button>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>About & Updates</h3>
          <div style={styles.versionRow}>
            <span style={styles.versionLabel}>Version</span>
            <span style={styles.versionValue}>{appVersion || "..."}</span>
          </div>
          <div style={styles.updateRow}>
            <button
              onClick={() => window.crmPhone.updater?.checkForUpdates?.()}
              disabled={updateStatus.state === "checking" || updateStatus.state === "downloading"}
              style={styles.updateBtn}
            >
              {updateStatus.state === "checking"
                ? "Checking..."
                : updateStatus.state === "downloading"
                  ? `Downloading ${updateStatus.percent ?? 0}%`
                  : "Check for Updates"}
            </button>
            {updateStatus.state === "downloading" && (
              <div style={styles.progressBg}>
                <div style={{ ...styles.progressFill, width: `${updateStatus.percent ?? 0}%` }} />
              </div>
            )}
          </div>
          {updateStatus.state === "downloaded" && (
            <div style={styles.updateBanner}>
              <span style={styles.updateBannerText}>
                v{updateStatus.version} ready to install
              </span>
              <button
                onClick={() => window.crmPhone.updater?.install?.()}
                style={styles.restartBtn}
              >
                Restart Now
              </button>
            </div>
          )}
          {updateStatus.state === "not-available" && (
            <span style={styles.upToDate}>You're up to date.</span>
          )}
          {updateStatus.state === "error" && (
            <span style={styles.updateError}>Update error: {updateStatus.message}</span>
          )}
        </div>

        {/* Account section — logout lives at the bottom so it's never
            the first button the operator reaches. Only rendered when
            a logout handler is wired (App.tsx always provides one
            when a session exists; the prop is optional only for
            future uses of this page that might skip it). */}
        {onLogout && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Account</h3>
            <button
              onClick={async () => {
                const ok = window.confirm(
                  "Log out of CRM28 Softphone?\n\nYou'll need to sign in again before you can receive or make calls.",
                );
                if (!ok) return;
                await onLogout();
              }}
              style={styles.logoutBtn}
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: SURFACE_GRADIENT,
    color: TEXT_STRONG,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  titleBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    height: 34,
    paddingLeft: "0.9rem",
    WebkitAppRegion: "drag" as any,
    flexShrink: 0,
    backgroundColor: "#115e59",
    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
    zIndex: 1,
  },
  backBtn: {
    background: "transparent",
    border: "none",
    color: "#ffffff",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    WebkitAppRegion: "no-drag" as any,
    padding: "2px 6px",
    borderRadius: 6,
  },
  titleText: { fontSize: "0.85rem", fontWeight: 600, color: "#ffffff" },
  content: {
    flex: 1,
    overflow: "auto",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.55rem",
  },
  sectionTitle: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: TEXT_MUTED,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    margin: 0,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    cursor: "pointer",
    padding: "0.5rem 0.75rem",
    ...CARD,
  },
  checkbox: {
    accentColor: BRAND,
    width: 16,
    height: 16,
    cursor: "pointer",
  },
  checkLabel: {
    fontSize: "0.85rem",
    color: TEXT_BODY,
  },
  select: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    borderRadius: 10,
    border: `1px solid ${BORDER_SOFT}`,
    background: SURFACE_CARD,
    color: TEXT_STRONG,
    fontSize: "0.85rem",
    outline: "none",
    boxShadow: "0 1px 2px rgba(15, 60, 40, 0.04)",
  },
  testRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  testBtn: {
    padding: "0.45rem 0.9rem",
    borderRadius: 999,
    border: `1px solid ${BORDER_SOFT}`,
    background: SURFACE_CARD,
    color: TEXT_BODY,
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    boxShadow: "0 1px 2px rgba(15, 60, 40, 0.04)",
  },
  meterBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    background: "rgba(15, 60, 40, 0.08)",
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    background: BRAND,
    borderRadius: 4,
    transition: "width 0.1s",
  },
  versionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 0.75rem",
    ...CARD,
  },
  versionLabel: { fontSize: "0.85rem", color: TEXT_MUTED },
  versionValue: {
    fontSize: "0.85rem",
    color: TEXT_STRONG,
    fontFamily: "SF Mono, Menlo, Consolas, monospace",
  },
  updateRow: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  updateBtn: {
    padding: "0.55rem 1rem",
    borderRadius: 10,
    border: `1px solid ${BRAND}`,
    background: "transparent",
    color: BRAND,
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center" as const,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    background: "rgba(15, 60, 40, 0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: BRAND,
    borderRadius: 3,
    transition: "width 0.3s",
  },
  updateBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "rgba(8, 117, 56, 0.08)",
    borderRadius: 10,
    padding: "0.55rem 0.8rem",
    border: `1px solid rgba(8, 117, 56, 0.25)`,
  },
  updateBannerText: { fontSize: "0.82rem", color: BRAND },
  restartBtn: {
    padding: "0.35rem 0.85rem",
    borderRadius: 999,
    border: "none",
    background: BRAND,
    color: "#fff",
    fontSize: "0.75rem",
    cursor: "pointer",
    fontWeight: 700,
  },
  upToDate: { fontSize: "0.82rem", color: BRAND, fontWeight: 600 },
  updateError: { fontSize: "0.82rem", color: "#b91c1c" },
  logoutBtn: {
    marginTop: "0.25rem",
    padding: "0.75rem 1rem",
    borderRadius: 10,
    border: `1px solid rgba(239, 68, 68, 0.35)`,
    background: "rgba(239, 68, 68, 0.06)",
    color: "#b91c1c",
    fontSize: "0.85rem",
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.02em",
    width: "100%",
    // Respect the `boxShadow: SHADOW_CARD` floor so the button still
    // feels connected to the rest of the page's cards, but tinted red
    // to flag it as a destructive-ish action.
    boxShadow: SHADOW_CARD,
  },
};
