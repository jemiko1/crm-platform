import React, { useState } from "react";
import type { CallerLookupResult, CallerLookupIncident } from "../../shared/types";

interface Props {
  lookup: CallerLookupResult;
  callingNumber: string;
}

export function CallerCard({ lookup, callingNumber }: Props) {
  const [showClosedIncidents, setShowClosedIncidents] = useState(false);
  const client = lookup.client;

  if (!client && !lookup.lead) return null;

  return (
    <div style={styles.container}>
      {/* Client header */}
      {client && (
        <div style={styles.section}>
          <div style={styles.clientName}>{client.name || "Unknown"}</div>
          <div style={styles.callingNumber}>{callingNumber}</div>
          {client.idNumber && (
            <div style={styles.metaLine}>ID: {client.idNumber}</div>
          )}
        </div>
      )}

      {/* Lead info (if no client match) */}
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

      {/* Buildings */}
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

      {/* Open Incidents */}
      {lookup.openIncidents.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Open Incidents
            <span style={styles.countBadge}>{lookup.openIncidents.length}</span>
          </div>
          <div style={styles.incidentList}>
            {lookup.openIncidents.map((inc) => (
              <IncidentRow key={inc.id} incident={inc} />
            ))}
          </div>
        </div>
      )}

      {/* Recent (closed) Incidents */}
      {lookup.recentIncidents.length > 0 && (
        <div style={styles.section}>
          <button
            onClick={() => setShowClosedIncidents(!showClosedIncidents)}
            style={styles.collapseBtn}
          >
            Recent Incidents ({lookup.recentIncidents.length})
            <span style={{ marginLeft: 4 }}>{showClosedIncidents ? "▾" : "▸"}</span>
          </button>
          {showClosedIncidents && (
            <div style={styles.incidentList}>
              {lookup.recentIncidents.map((inc) => (
                <IncidentRow key={inc.id} incident={inc} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Open Work Orders */}
      {lookup.openWorkOrders.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Work Orders
            <span style={styles.countBadge}>{lookup.openWorkOrders.length}</span>
          </div>
          {lookup.openWorkOrders.slice(0, 3).map((wo) => (
            <div key={wo.id} style={styles.woRow}>
              <span style={styles.woNumber}>#{wo.workOrderNumber}</span>
              <span style={styles.woTitle}>{wo.title}</span>
              <span style={styles.woBadge}>{wo.status.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Open in CRM */}
      {client && (
        <div style={styles.section}>
          <button
            onClick={() => {
              const url = `https://crm28.asg.ge/app/clients/${client.coreId}`;
              window.open(url, "_blank");
            }}
            style={styles.openCrmBtn}
          >
            Open in CRM
          </button>
        </div>
      )}
    </div>
  );
}

function IncidentRow({ incident }: { incident: CallerLookupIncident }) {
  const priorityColor: Record<string, string> = {
    CRITICAL: "#ef4444",
    HIGH: "#f59e0b",
    MEDIUM: "#3b82f6",
    LOW: "#6b7280",
  };

  return (
    <div style={styles.incidentRow}>
      <div style={styles.incidentHeader}>
        <span style={styles.incidentNumber}>{incident.incidentNumber}</span>
        <span
          style={{
            ...styles.priorityDot,
            background: priorityColor[incident.priority] || "#6b7280",
          }}
        />
        <span style={styles.incidentPriority}>{incident.priority}</span>
      </div>
      <div style={styles.incidentType}>{incident.incidentType}</div>
      <div style={styles.incidentMeta}>
        {incident.buildingName} · {new Date(incident.createdAt).toLocaleDateString()}
      </div>
      {incident.description && (
        <div style={styles.incidentDesc}>
          {incident.description.length > 80
            ? incident.description.slice(0, 80) + "..."
            : incident.description}
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
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  countBadge: {
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "#fff",
    background: "#ef4444",
    borderRadius: "999px",
    padding: "1px 6px",
    lineHeight: "1.2",
  },
  buildingRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.2rem 0",
  },
  buildingIcon: { fontSize: "0.75rem" },
  buildingName: { fontSize: "0.8rem", color: "#e2e8f0" },
  incidentList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    maxHeight: "200px",
    overflowY: "auto",
  },
  incidentRow: {
    padding: "0.4rem 0.5rem",
    borderRadius: "0.375rem",
    background: "#0f172a",
    border: "1px solid #1e293b",
  },
  incidentHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
  },
  incidentNumber: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#93c5fd",
    fontFamily: "monospace",
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    marginLeft: "auto",
  },
  incidentPriority: {
    fontSize: "0.65rem",
    color: "#94a3b8",
    textTransform: "uppercase" as const,
  },
  incidentType: {
    fontSize: "0.75rem",
    color: "#e2e8f0",
    marginTop: "0.15rem",
  },
  incidentMeta: {
    fontSize: "0.65rem",
    color: "#64748b",
    marginTop: "0.1rem",
  },
  incidentDesc: {
    fontSize: "0.7rem",
    color: "#94a3b8",
    marginTop: "0.2rem",
    lineHeight: "1.3",
  },
  collapseBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    cursor: "pointer",
    padding: 0,
    marginBottom: "0.4rem",
    display: "flex",
    alignItems: "center",
  },
  woRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.2rem 0",
  },
  woNumber: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#93c5fd",
    fontFamily: "monospace",
  },
  woTitle: {
    fontSize: "0.75rem",
    color: "#e2e8f0",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  woBadge: {
    fontSize: "0.6rem",
    color: "#94a3b8",
    background: "#1e293b",
    borderRadius: "4px",
    padding: "1px 4px",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
  },
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
