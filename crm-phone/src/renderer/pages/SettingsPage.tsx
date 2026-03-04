import React, { useEffect, useState, useCallback } from "react";

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

interface Props {
  onBack: () => void;
}

export function SettingsPage({ onBack }: Props) {
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

  useEffect(() => {
    window.crmPhone.settings.get().then((s: Settings) => setSettings(s));
    loadDevices();
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
        <span style={{ width: 60 }} />
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
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
  },
  titleBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 1rem",
    background: "#020617",
    WebkitAppRegion: "drag" as any,
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#60a5fa",
    fontSize: "0.8rem",
    cursor: "pointer",
    WebkitAppRegion: "no-drag" as any,
  },
  titleText: { fontSize: "0.8rem", fontWeight: 600, color: "#94a3b8" },
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
    gap: "0.5rem",
  },
  sectionTitle: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: 0,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    cursor: "pointer",
    padding: "0.4rem 0",
  },
  checkbox: {
    accentColor: "#3b82f6",
    width: 16,
    height: 16,
    cursor: "pointer",
  },
  checkLabel: {
    fontSize: "0.85rem",
    color: "#e2e8f0",
  },
  select: {
    width: "100%",
    padding: "0.5rem",
    borderRadius: "0.375rem",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f1f5f9",
    fontSize: "0.8rem",
    outline: "none",
  },
  testRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  testBtn: {
    padding: "0.4rem 0.8rem",
    borderRadius: "0.375rem",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    fontSize: "0.75rem",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  meterBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    background: "#334155",
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    background: "#22c55e",
    borderRadius: 4,
    transition: "width 0.1s",
  },
};
