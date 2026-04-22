import React from "react";
import type { CallerLookupResult } from "../../shared/types";
import {
  BORDER_SOFT,
  BRAND,
  BRAND_SOFT,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_STRONG,
} from "../theme";

interface Props {
  lookup: CallerLookupResult;
  callingNumber: string;
  /**
   * v1.11.0 compact mode: during an active call the caller context
   * lives directly under the main call info in a minimal card — just
   * the building name and an "Open in CRM28" link. No intel labels,
   * no duplicated name/number (those render above in the main call
   * view). Set to `true` from `InCallView`.
   */
  compact?: boolean;
}

export function CallerCard({ lookup, callingNumber, compact }: Props) {
  const client = lookup.client;
  if (!client && !lookup.lead) return null;

  const crmUrl = client
    ? `https://crm28.asg.ge/app/clients/${client.coreId}`
    : null;
  const buildings = client?.buildings ?? [];
  const buildingLabel = buildings.length > 0
    ? buildings.map((b) => b.name).join(" · ")
    : null;

  // Compact card used during an active call. Very small footprint so
  // it doesn't push the hangup button off-screen. Only building name
  // + "Open in CRM28" link — per user request, we dropped the intel
  // labels (HIGH CONTACT / FREQUENT CALLER / VIP POTENTIAL / STABLE)
  // and the duplicate name/number that appear in the main call view.
  if (compact) {
    if (!buildingLabel && !crmUrl) return null;
    return (
      <div style={styles.compactCard}>
        {buildingLabel && (
          <div style={styles.compactBuilding} title={buildingLabel}>
            {buildingLabel}
          </div>
        )}
        {crmUrl && (
          <button
            onClick={() => window.crmPhone.app.openExternal(crmUrl)}
            style={styles.openCrmBtn}
          >
            <span>Open in CRM28</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17L17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Non-compact fallback — used by any other surface that needs the
  // full client card (e.g. a future "caller details" drawer). Kept
  // minimal too, still no intel labels.
  return (
    <div style={styles.container}>
      {client && (
        <div style={styles.nameRow}>
          <div style={styles.clientName}>{client.name || "Unknown"}</div>
          <div style={styles.callingNumber}>{callingNumber}</div>
        </div>
      )}
      {!client && lookup.lead && (
        <div style={styles.nameRow}>
          <div style={styles.clientName}>Lead #{lookup.lead.leadNumber}</div>
          <div style={styles.callingNumber}>{callingNumber}</div>
        </div>
      )}
      {buildingLabel && <div style={styles.building}>{buildingLabel}</div>}
      {crmUrl && (
        <button
          onClick={() => window.crmPhone.app.openExternal(crmUrl)}
          style={styles.openCrmBtn}
        >
          <span>Open in CRM28</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  compactCard: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "0.5rem",
    marginTop: "0.4rem",
  },
  compactBuilding: {
    fontSize: "0.78rem",
    fontWeight: 500,
    color: TEXT_STRONG,
    textAlign: "center" as const,
    lineHeight: 1.35,
    padding: "0.45rem 0.6rem",
    background: BRAND_SOFT,
    border: `1px solid rgba(8, 117, 56, 0.18)`,
    borderRadius: 10,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  openCrmBtn: {
    padding: "0.55rem 0.9rem",
    borderRadius: 10,
    border: `1px solid rgba(8, 117, 56, 0.22)`,
    background: SURFACE_CARD,
    color: BRAND,
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    boxShadow: "0 1px 2px rgba(15, 60, 40, 0.04)",
    letterSpacing: "0.02em",
  },
  // Non-compact
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    padding: "0.5rem 0.75rem",
    background: SURFACE_CARD,
    border: `1px solid ${BORDER_SOFT}`,
    borderRadius: 12,
  },
  nameRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  clientName: {
    fontSize: "0.92rem",
    fontWeight: 600,
    color: TEXT_STRONG,
  },
  callingNumber: {
    fontSize: "0.75rem",
    color: TEXT_MUTED,
    letterSpacing: "0.04em",
  },
  building: {
    fontSize: "0.78rem",
    color: TEXT_MUTED,
  },
};
