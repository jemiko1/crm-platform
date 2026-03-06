import React, { useEffect, useState } from "react";

interface HistoryEntry {
  id: string;
  direction: string;
  callerNumber: string;
  calleeNumber: string | null;
  startAt: string;
  answerAt: string | null;
  endAt: string | null;
  disposition: string | null;
  durationSec: number | null;
}

type Tab = "all" | "missed" | "inbound" | "outbound";

interface Props {
  extension: string;
  onDial: (number: string) => void;
}

export function CallHistory({ extension, onDial }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    setLoading(true);
    window.crmPhone.calls
      .history(extension)
      .then((data: HistoryEntry[]) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [extension]);

  const filtered = entries.filter((e) => {
    if (tab === "all") return true;
    if (tab === "missed") return e.disposition === "MISSED" || e.disposition === "ABANDONED";
    if (tab === "inbound") return e.direction === "INBOUND";
    if (tab === "outbound") return e.direction === "OUTBOUND";
    return true;
  });

  const missedCount = entries.filter(
    (e) => e.disposition === "MISSED" || e.disposition === "ABANDONED",
  ).length;

  return (
    <div style={styles.container}>
      <div style={styles.tabs}>
        {(["all", "missed", "inbound", "outbound"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={tab === t ? styles.tabActive : styles.tab}
          >
            {t === "all" ? "All" : t === "missed" ? `Missed${missedCount ? ` (${missedCount})` : ""}` : t === "inbound" ? "In" : "Out"}
          </button>
        ))}
      </div>

      <div style={styles.list}>
        {loading && <div style={styles.empty}>Loading...</div>}
        {!loading && filtered.length === 0 && (
          <div style={styles.empty}>No calls</div>
        )}
        {!loading &&
          filtered.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} onDial={onDial} />
          ))}
      </div>
    </div>
  );
}

function HistoryRow({
  entry,
  onDial,
}: {
  entry: HistoryEntry;
  onDial: (n: string) => void;
}) {
  const isMissed = entry.disposition === "MISSED" || entry.disposition === "ABANDONED";
  const isInbound = entry.direction === "INBOUND";
  const remoteNumber = isInbound ? entry.callerNumber : (entry.calleeNumber || "");
  const date = new Date(entry.startAt);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dayStr = date.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div style={styles.row}>
      <div style={styles.rowLeft}>
        <span style={{ ...styles.arrow, color: isMissed ? "#ef4444" : isInbound ? "#22c55e" : "#3b82f6" }}>
          {isMissed ? "✕" : isInbound ? "↙" : "↗"}
        </span>
        <div style={styles.rowInfo}>
          <span style={styles.rowNumber}>{remoteNumber || "Unknown"}</span>
          <span style={styles.rowMeta}>
            {dayStr} {timeStr}
            {entry.durationSec != null && entry.durationSec > 0
              ? ` · ${formatDuration(entry.durationSec)}`
              : ""}
          </span>
        </div>
      </div>
      {remoteNumber && (
        <button onClick={() => onDial(remoteNumber)} style={styles.callBtn} title="Call">
          📞
        </button>
      )}
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
  },
  tabs: {
    display: "flex",
    gap: "2px",
    padding: "0.5rem 1rem 0",
  },
  tab: {
    flex: 1,
    padding: "0.35rem 0",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#64748b",
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  tabActive: {
    flex: 1,
    padding: "0.35rem 0",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid #3b82f6",
    color: "#60a5fa",
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "0.25rem 0.75rem",
  },
  empty: {
    textAlign: "center" as const,
    color: "#64748b",
    fontSize: "0.8rem",
    padding: "2rem 0",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.4rem 0.25rem",
    borderBottom: "1px solid #1e293b",
  },
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    minWidth: 0,
    flex: 1,
  },
  arrow: {
    fontSize: "0.85rem",
    fontWeight: 700,
    width: "1rem",
    textAlign: "center" as const,
    flexShrink: 0,
  },
  rowInfo: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  rowNumber: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "#e2e8f0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  rowMeta: {
    fontSize: "0.65rem",
    color: "#64748b",
  },
  callBtn: {
    background: "none",
    border: "none",
    fontSize: "0.9rem",
    cursor: "pointer",
    padding: "0.2rem 0.4rem",
    flexShrink: 0,
  },
};
