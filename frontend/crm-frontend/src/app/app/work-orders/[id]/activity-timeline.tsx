"use client";

import React, { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/work-order-status";

const BRAND = "rgb(8, 117, 56)";

const RAW_STATUS_RE = /\b(CREATED|LINKED_TO_GROUP|IN_PROGRESS|COMPLETED|CANCELED)\b/g;

function humanizeStatusText(text: string): string {
  return text.replace(RAW_STATUS_RE, (match) => STATUS_LABELS[match] || match);
}

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

// Filter types
type ActivityFilter = "ALL" | "MAIN" | "PRODUCT_FLOW";

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
    PRODUCTS_ADDED: { icon: "📦", bgColor: "bg-cyan-100", textColor: "text-cyan-700" },
    PRODUCTS_MODIFIED: { icon: "✏️", bgColor: "bg-amber-100", textColor: "text-amber-700" },
    PRODUCTS_APPROVED: { icon: "✅", bgColor: "bg-green-100", textColor: "text-green-700" },
    DEVICES_ADDED: { icon: "📱", bgColor: "bg-orange-100", textColor: "text-orange-700" },
    COMMENT_ADDED: { icon: "💬", bgColor: "bg-zinc-50", textColor: "text-zinc-500" },
    DEADLINE_CHANGED: { icon: "📅", bgColor: "bg-zinc-50", textColor: "text-zinc-500" },
    EMPLOYEES_MODIFIED: { icon: "👤", bgColor: "bg-zinc-50", textColor: "text-zinc-500" },
    REPAIR_REQUESTED: { icon: "🔧", bgColor: "bg-amber-100", textColor: "text-amber-700" },
    SUB_ORDER_CREATED: { icon: "📋", bgColor: "bg-indigo-100", textColor: "text-indigo-700" },
  };

  return styles[action] || { icon: "•", bgColor: "bg-zinc-50", textColor: "text-zinc-500" };
}

// Check if action is product-related
function isProductAction(action: string) {
  return ["PRODUCTS_ADDED", "PRODUCTS_MODIFIED", "PRODUCTS_APPROVED", "DEVICES_ADDED"].includes(action);
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
  const [filter, setFilter] = useState<ActivityFilter>("ALL");

  useEffect(() => {
    async function loadActivities() {
      try {
        setLoading(true);
        setError(null);
        const includeDetails = filter !== "MAIN";
        const data = await apiGet<ActivityLog[]>(
          `/v1/work-orders/${workOrderId}/activity?includeDetails=${includeDetails}&filter=${filter}`,
        );
        setActivities(data);
      } catch (err: any) {
        setError(err.message || "Failed to load activity logs");
      } finally {
        setLoading(false);
      }
    }

    loadActivities();
  }, [workOrderId, filter]);

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
    <div className="bg-transparent">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Activity Timeline</h2>
        
        {/* Filter buttons */}
        <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === "ALL"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("MAIN")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === "MAIN"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Main Events
          </button>
          <button
            type="button"
            onClick={() => setFilter("PRODUCT_FLOW")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
              filter === "PRODUCT_FLOW"
                ? "bg-cyan-100 text-cyan-800 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <span>📦</span>
            Product Flow
          </button>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-sm text-zinc-500 border border-zinc-200">
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
                                {humanizeStatusText(activity.title)}
                              </div>
                              <div
                                className={`mt-1 text-sm ${
                                  isMain ? "text-zinc-600" : "text-zinc-500"
                                }`}
                              >
                                {humanizeStatusText(activity.description)}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-xs text-zinc-400">
                              {formatTime(activity.createdAt)}
                            </div>
                          </div>

                          {/* Category badge */}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                isMain
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                  : "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200"
                              }`}
                            >
                              {isMain ? "Main Event" : "Detail"}
                            </span>
                            {isProductAction(activity.action) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 px-2 py-0.5 text-xs font-medium">
                                <span>📦</span>
                                Product Flow
                              </span>
                            )}
                            {activity.performedBy && (
                              <span className="text-xs text-zinc-400">
                                by {activity.performedBy.firstName}{" "}
                                {activity.performedBy.lastName}
                              </span>
                            )}
                          </div>

                          {/* Metadata (if exists and interesting) */}
                          {activity.metadata && (
                            <>
                              {activity.metadata.employeeNames &&
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
                              
                              {/* Product information for PRODUCTS_ADDED */}
                              {activity.action === "PRODUCTS_ADDED" && (
                                <div className="mt-2 space-y-1">
                                  <div className="text-xs font-medium text-zinc-600">Products Added:</div>
                                  {activity.metadata.productNames?.map((name: string, i: number) => (
                                    <div
                                      key={i}
                                      className="rounded-lg bg-cyan-50 px-2 py-1 text-xs text-cyan-700 ring-1 ring-cyan-200"
                                    >
                                      {name} × {activity.metadata?.quantities?.[i] || 1}
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Product information for PRODUCTS_MODIFIED (tech head modifications) */}
                              {activity.action === "PRODUCTS_MODIFIED" &&
                                activity.metadata.products &&
                                Array.isArray(activity.metadata.products) && (
                                  <div className="mt-2 space-y-1">
                                    <div className="text-xs font-medium text-zinc-600">Modifications:</div>
                                    {activity.metadata.products.map((product: any, i: number) => (
                                      <div
                                        key={i}
                                        className={`rounded-lg px-2 py-1.5 text-xs ring-1 ${
                                          product.action === 'added'
                                            ? "bg-green-50 text-green-700 ring-green-200"
                                            : product.action === 'removed'
                                            ? "bg-red-50 text-red-700 ring-red-200"
                                            : "bg-amber-50 text-amber-700 ring-amber-200"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-medium">{product.name}</span>
                                          <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-white/50">
                                            {product.action}
                                          </span>
                                        </div>
                                        {product.action === 'modified' && (
                                          <div className="mt-0.5 text-xs opacity-75">
                                            Qty: {product.originalQuantity} → {product.newQuantity}
                                          </div>
                                        )}
                                        {product.action === 'added' && (
                                          <div className="mt-0.5 text-xs opacity-75">
                                            Qty: {product.newQuantity}
                                          </div>
                                        )}
                                        {product.action === 'removed' && (
                                          <div className="mt-0.5 text-xs opacity-75">
                                            Removed qty: {product.originalQuantity}
                                          </div>
                                        )}
                                        {product.sku && (
                                          <div className="mt-0.5 text-xs opacity-60">SKU: {product.sku}</div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              
                              {/* Product information for PRODUCTS_APPROVED (final list) */}
                              {activity.action === "PRODUCTS_APPROVED" &&
                                activity.metadata.products &&
                                Array.isArray(activity.metadata.products) && (
                                  <div className="mt-2 space-y-1">
                                    <div className="text-xs font-medium text-zinc-600">
                                      Final Approved Products ({activity.metadata.totalProducts} items, {activity.metadata.totalQuantity} total):
                                    </div>
                                    {activity.metadata.products.map((product: any, i: number) => (
                                      <div
                                        key={i}
                                        className="rounded-lg bg-green-50 px-2 py-1 text-xs text-green-700 ring-1 ring-green-200"
                                      >
                                        {product.name} × {product.quantity}
                                        {product.sku && ` (SKU: ${product.sku})`}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              
                              {/* Device information for DEVICES_ADDED */}
                              {activity.action === "DEVICES_ADDED" && (
                                <div className="mt-2 space-y-1">
                                  <div className="text-xs font-medium text-zinc-600">Deactivated Devices:</div>
                                  {activity.metadata.productNames?.map((name: string, i: number) => (
                                    <div
                                      key={i}
                                      className="rounded-lg bg-orange-50 px-2 py-1 text-xs text-orange-700 ring-1 ring-orange-200"
                                    >
                                      {name} × {activity.metadata?.quantities?.[i] || 1}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
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
