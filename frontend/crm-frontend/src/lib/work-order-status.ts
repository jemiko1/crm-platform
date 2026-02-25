/**
 * Centralized work order / task status labels and badge styles.
 *
 * DB statuses: CREATED, LINKED_TO_GROUP, IN_PROGRESS, COMPLETED, CANCELED.
 * "Waiting For Approval" is IN_PROGRESS with techEmployeeComment set.
 *
 * Every page should import from here instead of defining its own helpers.
 */

type TranslateFn = (key: string, fallback?: string) => string;

export const STATUS_LABELS: Record<string, string> = {
  CREATED: "Created",
  LINKED_TO_GROUP: "Technicians Assigned",
  IN_PROGRESS: "Working",
  WAITING_APPROVAL: "Waiting For Approval",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const I18N_MAP: Record<string, [string, string]> = {
  CREATED: ["workOrders.statuses.CREATED", "Created"],
  LINKED_TO_GROUP: ["workOrders.statuses.LINKED_TO_GROUP", "Technicians Assigned"],
  IN_PROGRESS: ["workOrders.statuses.IN_PROGRESS", "Working"],
  WAITING_APPROVAL: ["workOrders.statuses.WAITING_APPROVAL", "Waiting For Approval"],
  COMPLETED: ["workOrders.statuses.COMPLETED", "Completed"],
  CANCELED: ["workOrders.statuses.CANCELED", "Canceled"],
};

/**
 * Resolve the effective display status.
 * Pass techEmployeeComment so "Waiting For Approval" is detected automatically.
 */
export function resolveDisplayStatus(
  dbStatus: string,
  techEmployeeComment?: string | null,
): string {
  if (dbStatus === "IN_PROGRESS" && techEmployeeComment) return "WAITING_APPROVAL";
  return dbStatus;
}

export function getStatusLabel(
  status: string,
  t?: TranslateFn,
): string {
  if (t) {
    const pair = I18N_MAP[status];
    if (pair) return t(pair[0], pair[1]);
  }
  return STATUS_LABELS[status] || status;
}

export function getStatusBadge(status: string): string {
  const styles: Record<string, string> = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    LINKED_TO_GROUP: "bg-purple-50 text-purple-700 ring-purple-200",
    IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-200",
    WAITING_APPROVAL: "bg-orange-50 text-orange-700 ring-orange-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    CANCELED: "bg-red-50 text-red-700 ring-red-200",
  };
  return styles[status] || "bg-zinc-50 text-zinc-700 ring-zinc-200";
}

/** The 5 user-facing stages with their display labels and progress bar colors. */
export const WORK_ORDER_STAGES = [
  { key: "CREATED", label: "Created", color: "bg-blue-500" },
  { key: "LINKED_TO_GROUP", label: "Technicians Assigned", color: "bg-purple-500" },
  { key: "IN_PROGRESS", label: "Working", color: "bg-amber-500" },
  { key: "WAITING_APPROVAL", label: "Waiting For Approval", color: "bg-orange-500" },
  { key: "COMPLETED_OR_CANCELED", label: "Completed / Canceled", color: "bg-emerald-500" },
] as const;

export const STAGE_LABELS = WORK_ORDER_STAGES.map((s) => s.label);

/** Progress bar width for a given display status (after resolveDisplayStatus). */
export function getProgressWidth(displayStatus: string): string {
  const widths: Record<string, string> = {
    CREATED: "10%",
    LINKED_TO_GROUP: "30%",
    IN_PROGRESS: "50%",
    WAITING_APPROVAL: "75%",
    COMPLETED: "100%",
    CANCELED: "100%",
  };
  return widths[displayStatus] || "0%";
}
