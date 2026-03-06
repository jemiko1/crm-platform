import React from "react";
import type { CallerLookupResult } from "../../shared/types";

interface Props {
  lookup: CallerLookupResult;
  callingNumber: string;
}

export function CallerCard({ lookup, callingNumber }: Props) {
  const client = lookup.client;

  if (!client && !lookup.lead) return null;

  const crmUrl = client
    ? `https://crm28.asg.ge/app/clients/${client.coreId}`
    : null;

  const buildings = client?.buildings ?? [];
  const intel = lookup.intelligence;

  return (
    <div style={styles.container}>
      {client && (
        <div style={styles.row}>
          <div style={styles.clientName}>{client.name || "Unknown"}</div>
          <div style={styles.callingNumber}>{callingNumber}</div>
        </div>
      )}

      {!client && lookup.lead && (
        <div style={styles.row}>
          <div style={styles.clientName}>Lead #{lookup.lead.leadNumber}</div>
          <div style={styles.callingNumber}>{callingNumber}</div>
        </div>
      )}

      {buildings.length > 0 && (
        <div style={styles.buildingsRow}>
          {buildings.map((b) => (
            <span key={b.id} style={styles.buildingTag}>🏢 {b.name}</span>
          ))}
        </div>
      )}

      {intel && (
        <div style={styles.intelSection}>
          {intel.labels.length > 0 && (
            <div style={styles.labelsRow}>
              {intel.labels.map((label) => (
                <span key={label} style={styles.labelBadge}>{formatLabel(label)}</span>
              ))}
            </div>
          )}
          {intel.summary && (
            <div style={styles.intelSummary}>{intel.summary}</div>
          )}
        </div>
      )}

      {crmUrl && (
        <button
          onClick={() => window.crmPhone.app.openExternal(crmUrl)}
          style={styles.openCrmBtn}
        >
          Open in CRM28
        </button>
      )}
    </div>
  );
}

function formatLabel(label: string): string {
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    padding: "0.5rem 1rem",
    flexShrink: 0,
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  clientName: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#f1f5f9",
  },
  callingNumber: {
    fontSize: "0.75rem",
    color: "#64748b",
    letterSpacing: "0.04em",
  },
  buildingsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.3rem",
  },
  buildingTag: {
    fontSize: "0.7rem",
    color: "#e2e8f0",
    background: "#1e293b",
    borderRadius: "4px",
    padding: "2px 6px",
  },
  intelSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  labelsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.25rem",
  },
  labelBadge: {
    fontSize: "0.6rem",
    fontWeight: 600,
    color: "#fbbf24",
    background: "#78350f",
    borderRadius: "4px",
    padding: "1px 5px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  intelSummary: {
    fontSize: "0.7rem",
    color: "#94a3b8",
    lineHeight: "1.35",
  },
  openCrmBtn: {
    padding: "0.4rem",
    borderRadius: "0.375rem",
    border: "1px solid #3b82f6",
    background: "transparent",
    color: "#60a5fa",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center" as const,
  },
};
