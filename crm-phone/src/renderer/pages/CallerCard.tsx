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

  return (
    <div style={styles.container}>
      {client && (
        <div style={styles.section}>
          <div style={styles.clientName}>{client.name || "Unknown"}</div>
          <div style={styles.callingNumber}>{callingNumber}</div>
          {client.idNumber && (
            <div style={styles.metaLine}>ID: {client.idNumber}</div>
          )}
        </div>
      )}

      {!client && lookup.lead && (
        <div style={styles.section}>
          <div style={styles.clientName}>Lead #{lookup.lead.leadNumber}</div>
          <div style={styles.callingNumber}>{callingNumber}</div>
          <div style={styles.metaLine}>Stage: {lookup.lead.stageName}</div>
          {lookup.lead.responsibleEmployee && (
            <div style={styles.metaLine}>Agent: {lookup.lead.responsibleEmployee}</div>
          )}
        </div>
      )}

      {client && client.buildings.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Buildings</div>
          {client.buildings.map((b) => (
            <div key={b.id} style={styles.buildingRow}>
              <span style={styles.buildingIcon}>🏢</span>
              <span style={styles.buildingName}>{b.name}</span>
            </div>
          ))}
        </div>
      )}

      {crmUrl && (
        <div style={styles.section}>
          <button
            onClick={() => window.crmPhone.app.openExternal(crmUrl)}
            style={styles.openCrmBtn}
          >
            Open in CRM28
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    padding: "0.75rem",
    overflowY: "auto",
    flex: 1,
  },
  section: {
    padding: "0.5rem 0",
    borderBottom: "1px solid #1e293b",
  },
  clientName: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#f1f5f9",
  },
  callingNumber: {
    fontSize: "0.8rem",
    color: "#94a3b8",
    letterSpacing: "0.05em",
    marginTop: "0.15rem",
  },
  metaLine: {
    fontSize: "0.75rem",
    color: "#64748b",
    marginTop: "0.15rem",
  },
  sectionTitle: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: "0.4rem",
  },
  buildingRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.2rem 0",
  },
  buildingIcon: { fontSize: "0.75rem" },
  buildingName: { fontSize: "0.8rem", color: "#e2e8f0" },
  openCrmBtn: {
    width: "100%",
    padding: "0.5rem",
    borderRadius: "0.375rem",
    border: "1px solid #3b82f6",
    background: "transparent",
    color: "#60a5fa",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center" as const,
  },
};
