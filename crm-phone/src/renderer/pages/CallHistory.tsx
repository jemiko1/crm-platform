import React, { useEffect, useMemo, useState } from "react";
import {
  BORDER_SOFT,
  BRAND,
  BRAND_SOFT,
  CARD,
  SHADOW_CARD,
  SURFACE_CARD,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_STRONG,
} from "../theme";

interface HistoryEntry {
  id: string;
  direction: string;
  callerNumber: string;
  calleeNumber: string | null;
  remoteName: string | null;
  startAt: string;
  answerAt: string | null;
  endAt: string | null;
  disposition: string | null;
  durationSec: number | null;
}

type Tab = "all" | "missed" | "incoming" | "outgoing";

interface Props {
  extension: string;
  onDial: (number: string) => void;
}

export function CallHistory({ extension, onDial }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    window.crmPhone.calls
      .history(extension)
      .then((data: HistoryEntry[]) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [extension]);

  const counts = useMemo(() => {
    let missed = 0;
    for (const e of entries) {
      if (isMissed(e)) missed += 1;
    }
    return { total: entries.length, missed };
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (tab === "all") return true;
      if (tab === "missed") return isMissed(e);
      if (tab === "incoming") return e.direction === "IN" && !isMissed(e);
      if (tab === "outgoing") return e.direction === "OUT";
      return true;
    });
  }, [entries, tab]);

  return (
    <div style={styles.container}>
      <div style={styles.topRow}>
        <span style={styles.headerLabel}>History</span>
        {/* Clear-all is render-only — the backend doesn't yet expose
            a bulk-delete endpoint. The visual affordance matches the
            reference; when the endpoint lands it'll be wired here. */}
        <button
          style={styles.clearAllBtn}
          title="Clear all (coming soon)"
          onClick={() => {
            window.alert(
              "Clearing call history isn't implemented yet. Your admin can archive logs from the web CRM.",
            );
          }}
        >
          Clear all
        </button>
      </div>

      <div style={styles.tabs}>
        <TabChip
          label="All"
          tone="brand"
          active={tab === "all"}
          onClick={() => setTab("all")}
        />
        <TabChip
          label={counts.missed > 0 ? `Missed (${counts.missed})` : "Missed"}
          tone="danger"
          active={tab === "missed"}
          onClick={() => setTab("missed")}
        />
        <TabChip
          label="Incoming"
          tone="brand"
          active={tab === "incoming"}
          onClick={() => setTab("incoming")}
        />
        <TabChip
          label="Outgoing"
          tone="brand"
          active={tab === "outgoing"}
          onClick={() => setTab("outgoing")}
        />
      </div>

      <div style={styles.list}>
        {loading && <div style={styles.empty}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={styles.empty}>
            {tab === "missed"
              ? "No missed calls. 🎉"
              : "No calls yet."}
          </div>
        )}
        {!loading &&
          filtered.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              onDial={onDial}
              hovered={hoveredId === entry.id}
              onHover={setHoveredId}
            />
          ))}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function isMissed(e: HistoryEntry): boolean {
  const d = e.disposition;
  return d === "MISSED" || d === "ABANDONED" || d === "NOANSWER";
}

/**
 * Compact time label — `HH:MM` when today, `Yesterday`, or `MMM D`
 * for anything older. Matches the reference design.
 */
function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── TabChip ──────────────────────────────────────────────────────

function TabChip(props: {
  label: string;
  tone: "brand" | "danger";
  active: boolean;
  onClick: () => void;
}) {
  const { label, tone, active, onClick } = props;
  const activeBg = tone === "danger" ? "#fde2e2" : BRAND_SOFT;
  const activeBorder =
    tone === "danger" ? "rgba(220, 38, 38, 0.3)" : "rgba(8, 117, 56, 0.25)";
  const activeText = tone === "danger" ? "#b91c1c" : BRAND;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...styles.tabChip,
        background: active ? activeBg : SURFACE_CARD,
        border: `1px solid ${active ? activeBorder : BORDER_SOFT}`,
        color: active ? activeText : TEXT_MUTED,
        boxShadow: active ? "none" : "0 1px 2px rgba(15, 60, 40, 0.04)",
        fontWeight: active ? 700 : 600,
      }}
    >
      {label}
    </button>
  );
}

// ── HistoryRow ───────────────────────────────────────────────────

function HistoryRow(props: {
  entry: HistoryEntry;
  onDial: (n: string) => void;
  hovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const { entry, onDial, hovered, onHover } = props;
  const missed = isMissed(entry);
  const isInbound = entry.direction === "IN";
  const remoteNumber = isInbound ? entry.callerNumber : (entry.calleeNumber || "");
  const displayName = entry.remoteName || remoteNumber || "Unknown";

  // Three visual states: missed (red ↙), incoming answered (green ↙),
  // outgoing (green ↗). Row is clickable to redial.
  const arrowColor = missed ? "#dc2626" : BRAND;
  const arrowBg = missed ? "rgba(239, 68, 68, 0.1)" : BRAND_SOFT;
  const arrowSymbol = isInbound ? "↙" : "↗";

  return (
    <button
      onClick={() => remoteNumber && onDial(remoteNumber)}
      onMouseEnter={() => onHover(entry.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        ...styles.row,
        background: hovered ? "#f3f9f6" : "transparent",
      }}
      title={`Call ${remoteNumber}`}
    >
      <span style={{ ...styles.arrowCircle, background: arrowBg, color: arrowColor }}>
        {arrowSymbol}
      </span>
      <div style={styles.rowInfo}>
        <span style={styles.rowName}>{displayName}</span>
        {entry.remoteName && remoteNumber && (
          <span style={styles.rowNumber}>{remoteNumber}</span>
        )}
        {!entry.remoteName && (
          <span style={styles.rowNumber}>
            {missed ? "Missed call" : isInbound ? "Incoming" : "Outgoing"}
          </span>
        )}
      </div>
      <div style={styles.rowRight}>
        <span style={styles.rowTime}>{formatRelativeTime(entry.startAt)}</span>
        <InfoIcon />
      </div>
    </button>
  );
}

function InfoIcon() {
  return (
    <span style={styles.infoIcon} aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="11" x2="12" y2="16" />
        <circle cx="12" cy="8" r="0.5" fill="currentColor" />
      </svg>
    </span>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    gap: "0.5rem",
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "0 0.1rem",
  },
  headerLabel: {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: TEXT_STRONG,
    letterSpacing: "-0.01em",
  },
  clearAllBtn: {
    background: "transparent",
    border: "none",
    color: BRAND,
    fontSize: "0.72rem",
    fontWeight: 600,
    cursor: "pointer",
    padding: "2px 4px",
    letterSpacing: "0.02em",
  },
  tabs: {
    display: "flex",
    gap: "0.4rem",
    paddingBottom: "0.1rem",
    overflowX: "auto" as const,
    scrollbarWidth: "none" as const,
  },
  tabChip: {
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: "0.74rem",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    letterSpacing: "0.01em",
    transition: "background 120ms ease, color 120ms ease",
    flexShrink: 0,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    paddingRight: "0.1rem",
  },
  empty: {
    textAlign: "center" as const,
    color: TEXT_MUTED,
    fontSize: "0.85rem",
    padding: "2rem 0",
  },
  row: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem 0.6rem",
    borderRadius: 12,
    background: "transparent",
    border: `1px solid transparent`,
    cursor: "pointer",
    textAlign: "left" as const,
    color: TEXT_STRONG,
    transition: "background 120ms ease",
  },
  arrowCircle: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1rem",
    fontWeight: 700,
    flexShrink: 0,
    lineHeight: 1,
  },
  rowInfo: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: "0.88rem",
    fontWeight: 600,
    color: TEXT_STRONG,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    letterSpacing: "-0.005em",
  },
  rowNumber: {
    fontSize: "0.72rem",
    color: TEXT_MUTED,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
  },
  rowRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexShrink: 0,
  },
  rowTime: {
    fontSize: "0.72rem",
    color: TEXT_MUTED,
    fontVariantNumeric: "tabular-nums",
  },
  infoIcon: {
    color: TEXT_MUTED,
    display: "inline-flex",
    opacity: 0.7,
  },
};
