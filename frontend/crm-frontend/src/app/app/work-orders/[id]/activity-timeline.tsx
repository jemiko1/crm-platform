"use client";

import React, { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type ActivityLog = {
  id: string;
  workOrderId: string;
  action: string;
  category: "MAIN" | "DETAIL";
  title: string;
  description: string;
  performedById: string | null;
  performedByName: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  performedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    email: string;
  } | null;
};

type Props = {
  workOrderId: string;
};

// Get icon and color for each action type
function getActionStyle(action: string) {
  const styles: Record<string, { icon: string; bgColor: string; textColor: string }> = {
    CREATED: { icon: "📝", bgColor: "bg-blue-100", textColor: "text-blue-700" },
    ASSIGNED: { icon: "👥", bgColor: "bg-purple-100", textColor: "text-purple-700" },
    STARTED: { icon: "▶️", bgColor: "bg-emerald-100", textColor: "text-emerald-700" },
    SUBMITTED: { icon: "📤", bgColor: "bg-amber-100", textColor: "text-amber-700" },
    APPROVED: { icon: "✅", bgColor: "bg-green-100", textColor: "text-green-700" },
    CANCELED: { icon: "❌", bgColor: "bg-red-100", textColor: "text-red-700" },
    STATUS_CHANGED: { icon: "🔄", bgColor: "bg-zinc-100", textColor: "text-zinc-700" },
    VIEWED: { icon: "👁️", bgColor: "bg-zinc-50", textColor: "text-zinc-500" },
    PRODUCTS_ADDED: { icon: "📦", bgColor: "bg-cyan-50", textColor: "text-cyan-600" },
    PRODUCTS_MODIFIED: { icon: "✏️", bgColor: "bg-cyan-50", textColor: "text-cyan-600" },
    DEVICES_ADDED: { icon: "📱", bgColor: "bg-orange-50", textColor: "text-orange-600" },
    COMMENT_ADDED: { icon: "💬", bgColor: "bg-zinc-50", textColor: "text-zinc-500" },
    DEADLINE_CHANGED: { icon: "📅", bgColor: "bg-zinc-50", textColor: "text-zinc-500" },
    EMPLOYEES_MODIFIED: { icon: "👤", bgColor: "bg-zinc-50", textColor: "text-zinc-500" },
    REPAIR_REQUESTED: { icon: "🔧", bgColor: "bg-amber-100", textColor: "text-amber-700" },
    SUB_ORDER_CREATED: { icon: "📋", bgColor: "bg-indigo-100", textColor: "text-indigo-700" },
  };

  return styles[action] || { icon: "•", bgColor: "bg-zinc-50", textColor: "text-zinc-500" };
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ActivityTimeline({ workOrderId }: Props) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);

  useEffect(() => {
    async function loadActivities() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiGet<ActivityLog[]>(
          `/v1/work-orders/${workOrderId}/activity?includeDetails=${showAllEvents}`,
        );
        setActivities(data);
      } catch (err: any) {
        setError(err.message || "Failed to load activity logs");
      } finally {
        setLoading(false);
      }
    }

    loadActivities();
  }, [workOrderId, showAllEvents]);

  // Group activities by date
  const groupedActivities = activities.reduce(
    (groups, activity) => {
      const date = formatDate(activity.createdAt);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(activity);
      return groups;
    },
    {} as Record<string, ActivityLog[]>,
  );

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-900">Activity Timeline</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-zinc-500">Loading activities...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-900">Activity Timeline</h2>
        </div>
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-zinc-900">Activity Timeline</h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showAllEvents}
            onChange={(e) => setShowAllEvents(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-zinc-600">Show all events</span>
        </label>
      </div>

      {activities.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-500 ring-1 ring-zinc-200">
          No activity recorded yet
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedActivities).map(([date, dateActivities]) => (
            <div key={date}>
              {/* Date header */}
              <div className="mb-3 flex items-center gap-2">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  {date}
                </div>
                <div className="flex-1 h-px bg-zinc-200" />
              </div>

              {/* Activities for this date */}
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-zinc-200" />

                <div className="space-y-3">
                  {dateActivities.map((activity, index) => {
                    const style = getActionStyle(activity.action);
                    const isMain = activity.category === "MAIN";

                    return (
                      <div key={activity.id} className="relative flex gap-4">
                        {/* Timeline dot */}
                        <div
                          className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                            isMain ? style.bgColor : "bg-zinc-100"
                          } ring-2 ring-white`}
                        >
                          <span className="text-sm">{style.icon}</span>
                        </div>

                        {/* Content */}
                        <div
                          className={`flex-1 rounded-2xl p-3 ${
                            isMain
                              ? "bg-white ring-1 ring-zinc-200"
                              : "bg-zinc-50/50 ring-1 ring-zinc-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div
                                className={`text-sm font-semibold ${
                                  isMain ? "text-zinc-900" : "text-zinc-600"
                                }`}
                              >
                                {activity.title}
                              </div>
                              <div
                                className={`mt-1 text-sm ${
                                  isMain ? "text-zinc-600" : "text-zinc-500"
                                }`}
                              >
                                {activity.description}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-xs text-zinc-400">
                              {formatTime(activity.createdAt)}
                            </div>
                          </div>

                          {/* Category badge */}
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                isMain
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                  : "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200"
                              }`}
                            >
                              {isMain ? "Main Event" : "Detail"}
                            </span>
                            {activity.performedBy && (
                              <span className="text-xs text-zinc-400">
                                by {activity.performedBy.firstName}{" "}
                                {activity.performedBy.lastName}
                              </span>
                            )}
                          </div>

                          {/* Metadata (if exists and interesting) */}
                          {activity.metadata &&
                            activity.metadata.employeeNames &&
                            activity.metadata.employeeNames.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {activity.metadata.employeeNames.map(
                                  (name: string, i: number) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-200"
                                    >
                                      {name}
                                    </span>
                                  ),
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
