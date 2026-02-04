"use client";

import React, { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";

type Activity = {
  id: string;
  activityType: string;
  category: string;
  action: string;
  description: string;
  previousValues: any;
  newValues: any;
  changedFields: string[] | null;
  createdAt: string;
  performedBy: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
  performedByName: string | null;
};

interface LeadActivityTimelineProps {
  leadId: string;
}

const activityIcons: Record<string, string> = {
  LEAD_CREATED: "🆕",
  LEAD_UPDATED: "✏️",
  STAGE_CHANGED: "📊",
  LEAD_ASSIGNED: "👤",
  LEAD_LOCKED: "🔒",
  LEAD_UNLOCKED: "🔓",
  LEAD_APPROVED: "✅",
  LEAD_CANCELLED: "❌",
  NOTE_ADDED: "📝",
  NOTE_UPDATED: "📝",
  NOTE_DELETED: "🗑️",
  REMINDER_CREATED: "⏰",
  REMINDER_COMPLETED: "✓",
  REMINDER_DELETED: "🗑️",
  APPOINTMENT_SCHEDULED: "📅",
  APPOINTMENT_COMPLETED: "✓",
  APPOINTMENT_CANCELLED: "✕",
  SERVICE_ADDED: "➕",
  SERVICE_UPDATED: "✏️",
  SERVICE_REMOVED: "➖",
  PROPOSAL_CREATED: "📄",
  VIEWED: "👁️",
};

const categoryColors: Record<string, string> = {
  MAIN: "bg-blue-100 text-blue-800",
  DETAIL: "bg-zinc-100 text-zinc-600",
  SYSTEM: "bg-zinc-50 text-zinc-500",
};

export default function LeadActivityTimeline({ leadId }: LeadActivityTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        const data = await apiGet<Activity[]>(
          `/v1/sales/leads/${leadId}/activity${showDetails ? "" : "?category=MAIN"}`
        );
        setActivities(data);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load activity");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [leadId, showDetails]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-600">{error}</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900">Activity Timeline</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showDetails}
            onChange={(e) => setShowDetails(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-zinc-600">Show detailed events</span>
        </label>
      </div>

      {activities.length === 0 ? (
        <p className="text-center text-zinc-500">No activity recorded yet</p>
      ) : (
        <div className="space-y-4">
          {activities.map((activity, idx) => (
            <div key={activity.id} className="flex gap-4">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-lg">
                  {activityIcons[activity.activityType] || "•"}
                </div>
                {idx < activities.length - 1 && (
                  <div className="w-0.5 flex-1 bg-zinc-200" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900">{activity.action}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          categoryColors[activity.category] || categoryColors.DETAIL
                        }`}
                      >
                        {activity.category}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">{activity.description}</p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <div>{new Date(activity.createdAt).toLocaleDateString()}</div>
                    <div>{new Date(activity.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>

                {/* Performer */}
                {(activity.performedBy || activity.performedByName) && (
                  <div className="mt-2 text-xs text-zinc-500">
                    by{" "}
                    {activity.performedBy
                      ? `${activity.performedBy.firstName} ${activity.performedBy.lastName} (${activity.performedBy.employeeId})`
                      : activity.performedByName}
                  </div>
                )}

                {/* Changed fields */}
                {activity.changedFields && activity.changedFields.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {activity.changedFields.map((field) => (
                      <span
                        key={field}
                        className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
