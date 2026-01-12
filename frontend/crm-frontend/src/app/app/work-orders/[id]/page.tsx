"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPatch, apiDelete, ApiError } from "@/lib/api";
import EditWorkOrderModal from "./edit-work-order-modal";

const BRAND = "rgb(8, 117, 56)";

type WorkOrderDetail = {
  id: string;
  type: "INSTALL" | "DIAGNOSTIC" | "REPAIR";
  status: "NEW" | "DISPATCHED" | "ACCEPTED" | "IN_PROGRESS" | "DONE" | "CANCELED";
  title: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  building: {
    coreId: number;
    name: string;
    address: string | null;
    city: string | null;
  };
  asset: {
    coreId: number;
    name: string;
    type: string;
    status: string;
  } | null;
};

function getStatusBadge(status: WorkOrderDetail["status"]) {
  const styles: Record<WorkOrderDetail["status"], string> = {
    NEW: "bg-blue-50 text-blue-700 ring-blue-200",
    DISPATCHED: "bg-amber-50 text-amber-700 ring-amber-200",
    ACCEPTED: "bg-purple-50 text-purple-700 ring-purple-200",
    IN_PROGRESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    DONE: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    CANCELED: "bg-red-50 text-red-700 ring-red-200",
  };
  return styles[status];
}

function getStatusLabel(status: WorkOrderDetail["status"]) {
  const labels: Record<WorkOrderDetail["status"], string> = {
    NEW: "New",
    DISPATCHED: "Dispatched",
    ACCEPTED: "Accepted",
    IN_PROGRESS: "In Progress",
    DONE: "Done",
    CANCELED: "Canceled",
  };
  return labels[status];
}

function getTypeLabel(type: WorkOrderDetail["type"]) {
  const labels: Record<WorkOrderDetail["type"], string> = {
    INSTALL: "Install",
    DIAGNOSTIC: "Diagnostic",
    REPAIR: "Repair",
  };
  return labels[type];
}

function InfoCard({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs font-medium text-zinc-600">{label}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-900">{value || "—"}</div>
    </div>
  );
}

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Work order ID is required");
      return;
    }

    let cancelled = false;

    async function loadWorkOrder() {
      try {
        setLoading(true);
        setError(null);

        const data = await apiGet<WorkOrderDetail>(`/v1/work-orders/${id}`);

        if (!cancelled) {
          setWorkOrder(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load work order");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadWorkOrder();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDelete() {
    if (!id || !confirm("Are you sure you want to delete this work order?")) return;

    try {
      await apiDelete(`/v1/work-orders/${id}`);
      router.push("/app/work-orders");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete work order");
    }
  }

  function handleEditSuccess() {
    setShowEditModal(false);
    // Reload work order data
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-zinc-200">
            <div className="text-sm text-zinc-600">Loading work order...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !workOrder) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-red-50 p-6 ring-1 ring-red-200">
            <div className="text-sm font-semibold text-red-900">Error loading work order</div>
            <div className="mt-1 text-sm text-red-700">{error || "Work order not found"}</div>
            <Link
              href="/app/work-orders"
              className="mt-3 inline-block rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Back to Work Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/app/work-orders"
            className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <span>←</span>
            <span>Work Orders</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Work Order
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              {workOrder.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Created {new Date(workOrder.createdAt).toLocaleString()}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
              onClick={() => setShowEditModal(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
            <div className="flex items-center justify-between gap-3 mb-6">
              <h2 className="text-lg font-semibold text-zinc-900">Details</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(
                  workOrder.status
                )}`}
              >
                {getStatusLabel(workOrder.status)}
              </span>
            </div>

            <div className="space-y-4">
              <InfoCard label="Type" value={getTypeLabel(workOrder.type)} />
              <InfoCard label="Title" value={workOrder.title} />
              {workOrder.notes && <InfoCard label="Notes" value={workOrder.notes} />}
              <InfoCard
                label="Created"
                value={new Date(workOrder.createdAt).toLocaleString()}
              />
              <InfoCard
                label="Last Updated"
                value={new Date(workOrder.updatedAt).toLocaleString()}
              />
            </div>
          </div>

          {/* Building & Asset */}
          <div className="space-y-6">
            {/* Building */}
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Building</h2>
              <Link
                href={`/app/buildings/${workOrder.building.coreId}`}
                className="group block rounded-2xl bg-white p-3 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900 group-hover:underline">
                      {workOrder.building.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      #{workOrder.building.coreId}
                    </div>
                    {workOrder.building.address && (
                      <div className="mt-1 text-xs text-zinc-600">{workOrder.building.address}</div>
                    )}
                  </div>
                  <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </div>
              </Link>
            </div>

            {/* Asset */}
            {workOrder.asset && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">Asset</h2>
                <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                  <div className="text-sm font-semibold text-zinc-900">{workOrder.asset.name}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Type: {workOrder.asset.type} • Status: {workOrder.asset.status}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">#{workOrder.asset.coreId}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <EditWorkOrderModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleEditSuccess}
        workOrder={workOrder}
      />
    </div>
  );
}
