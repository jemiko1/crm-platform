"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import LeadActivityTimeline from "./lead-activity-timeline";
import LeadServicesSection from "./lead-services-section";
import LeadNotesSection from "./lead-notes-section";
import ApprovalActionsModal from "./approval-actions-modal";
import ChangeStageModal from "./change-stage-modal";
import { PermissionGuard } from "@/lib/permission-guard";

const BRAND = "rgb(8, 117, 56)";

type LeadStage = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  color: string | null;
  sortOrder: number;
  isTerminal: boolean;
  isActive: boolean;
};

type Lead = {
  id: string;
  leadNumber: number;
  status: "ACTIVE" | "WON" | "LOST";
  isLocked: boolean;
  lockedAt: string | null;
  name: string;
  representative: string | null;
  primaryPhone: string;
  contactPersons: any[] | null;
  associationName: string | null;
  city: string;
  address: string;
  floorsCount: number;
  entrancesCount: number;
  apartmentsPerFloor: number;
  elevatorsCount: number;
  entranceDoorsCount: number;
  totalOneTimePrice: number | null;
  totalMonthlyPrice: number | null;
  createdAt: string;
  updatedAt: string;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  approvalNotes: string | null;
  stage: LeadStage;
  source: { id: string; name: string; nameKa: string } | null;
  responsibleEmployee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    email: string;
  } | null;
  responsibleEmployeeName: string | null; // Cached name when employee is deleted
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
  createdByName: string | null; // Cached name when employee is deleted
  services: any[];
  notes: any[];
  reminders: any[];
  appointments: any[];
  stageHistory: any[];
};

function getStatusBadge(status: Lead["status"]) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-blue-100 text-blue-800",
    WON: "bg-emerald-100 text-emerald-800",
    LOST: "bg-red-100 text-red-800",
  };
  return styles[status] || "bg-zinc-100 text-zinc-800";
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"details" | "services" | "activity" | "notes">("details");
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);

  const fetchLead = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [leadRes, stagesRes] = await Promise.all([
        apiGet<Lead>(`/v1/sales/leads/${leadId}`),
        apiGet<LeadStage[]>("/v1/sales/config/stages"),
      ]);
      setLead(leadRes);
      setStages(stagesRes.filter((s) => s.isActive));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load lead");
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  const handleSubmitForApproval = async () => {
    if (!lead) return;

    try {
      await apiPost(`/v1/sales/leads/${leadId}/submit-for-approval`, {});
      fetchLead();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error || "Lead not found"}</p>
        <button
          onClick={() => router.back()}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium hover:bg-zinc-200"
        >
          Go Back
        </button>
      </div>
    );
  }

  const isApprovalStage = lead.stage.code === "APPROVAL";
  const canSubmitForApproval = !lead.isLocked && !lead.stage.isTerminal && lead.stage.code !== "APPROVAL";

  return (
    <PermissionGuard permission="sales.read">
      <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Pipeline
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
                style={{ backgroundColor: lead.stage.color || BRAND }}
              >
                #{lead.leadNumber}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">{lead.name}</h1>
                <p className="mt-1 text-sm text-zinc-600">
                  {lead.city}, {lead.address}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Badge */}
            <span className={`rounded-full px-4 py-1.5 text-sm font-medium ${getStatusBadge(lead.status)}`}>
              {lead.status}
            </span>

            {/* Lock Indicator */}
            {lead.isLocked && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-800">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Locked for Approval
              </span>
            )}

            {/* Change Stage Button */}
            {!lead.isLocked && !lead.stage.isTerminal && (
              <button
                onClick={() => setShowStageModal(true)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Change Stage
              </button>
            )}

            {/* Submit for Approval */}
            {canSubmitForApproval && (
              <button
                onClick={handleSubmitForApproval}
                className="rounded-xl px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: BRAND }}
              >
                Submit for Approval
              </button>
            )}

            {/* Approval Actions (for approvers) */}
            {isApprovalStage && lead.isLocked && (
              <button
                onClick={() => setShowApprovalModal(true)}
                className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                Review & Approve
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stage Progress */}
      <div className="mb-8">
        <div className="flex items-center gap-2 overflow-x-auto">
          {stages
            .filter((s) => !s.isTerminal)
            .map((stage, idx) => {
              const isCurrent = stage.id === lead.stage.id;
              const isPast = stage.sortOrder < lead.stage.sortOrder;
              const isTerminalCurrent = lead.stage.isTerminal;

              return (
                <React.Fragment key={stage.id}>
                  <div
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 transition ${
                      isCurrent
                        ? "ring-2 ring-offset-2"
                        : isPast
                        ? "opacity-60"
                        : "opacity-40"
                    }`}
                    style={{
                      backgroundColor: isCurrent || isPast ? `${stage.color || "#6366f1"}20` : "#f4f4f5",
                      // @ts-expect-error -- CSS custom property for Tailwind ring color
                      "--tw-ring-color": isCurrent ? stage.color || "#6366f1" : "transparent",
                    }}
                  >
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isPast || isCurrent ? "text-white" : "text-zinc-500 bg-zinc-300"
                      }`}
                      style={{
                        backgroundColor: isPast || isCurrent ? stage.color || "#6366f1" : undefined,
                      }}
                    >
                      {isPast ? "✓" : idx + 1}
                    </div>
                    <span className="text-sm font-medium text-zinc-700">{stage.name}</span>
                  </div>
                  {idx < stages.filter((s) => !s.isTerminal).length - 1 && (
                    <svg
                      className={`h-4 w-4 ${isPast ? "text-emerald-500" : "text-zinc-300"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </React.Fragment>
              );
            })}

          {/* Terminal State */}
          {lead.stage.isTerminal && (
            <>
              <svg className="h-4 w-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-2 ring-2 ring-offset-2"
                style={{
                  backgroundColor: `${lead.stage.color || "#6366f1"}20`,
                  // @ts-expect-error -- CSS custom property for Tailwind ring color
                  "--tw-ring-color": lead.stage.color || "#6366f1",
                }}
              >
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: lead.stage.color || "#6366f1" }}
                >
                  {lead.status === "WON" ? "🎉" : "✕"}
                </div>
                <span className="text-sm font-medium text-zinc-700">{lead.stage.name}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-zinc-200">
        <nav className="flex gap-8">
          {[
            { id: "details", label: "Details" },
            { id: "services", label: `Services (${lead.services.length})` },
            { id: "notes", label: `Notes (${lead.notes.length})` },
            { id: "activity", label: "Activity" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 pb-4 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
        {activeTab === "details" && (
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Contact Information */}
            <div>
              <h3 className="mb-4 text-lg font-semibold text-zinc-900">Contact Information</h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Representative</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.representative || "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Phone</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.primaryPhone}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Association</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.associationName || "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Source</dt>
                  <dd className="text-sm font-medium text-zinc-900">
                    {lead.source ? `${lead.source.name} (${lead.source.nameKa})` : "-"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Building Information */}
            <div>
              <h3 className="mb-4 text-lg font-semibold text-zinc-900">Building Information</h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">City</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.city}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Address</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.address}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Floors</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.floorsCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Entrances</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.entrancesCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Apartments/Floor</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.apartmentsPerFloor}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Elevators</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.elevatorsCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-zinc-500">Entrance Doors</dt>
                  <dd className="text-sm font-medium text-zinc-900">{lead.entranceDoorsCount}</dd>
                </div>
              </dl>
            </div>

            {/* Pricing Summary */}
            {(lead.totalMonthlyPrice || lead.totalOneTimePrice) && (
              <div className="lg:col-span-2">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900">Pricing Summary</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-emerald-50 p-4">
                    <div className="text-sm text-emerald-600">Monthly Revenue</div>
                    <div className="text-2xl font-bold text-emerald-700">
                      {lead.totalMonthlyPrice ? Number(lead.totalMonthlyPrice).toFixed(2) : "0.00"} GEL
                    </div>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-4">
                    <div className="text-sm text-blue-600">One-time Revenue</div>
                    <div className="text-2xl font-bold text-blue-700">
                      {lead.totalOneTimePrice ? Number(lead.totalOneTimePrice).toFixed(2) : "0.00"} GEL
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Assignment */}
            <div className="lg:col-span-2">
              <h3 className="mb-4 text-lg font-semibold text-zinc-900">Assignment</h3>
              {lead.responsibleEmployee ? (
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 text-lg font-bold text-zinc-600">
                    {lead.responsibleEmployee.firstName[0]}
                    {lead.responsibleEmployee.lastName[0]}
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900">
                      {lead.responsibleEmployee.firstName} {lead.responsibleEmployee.lastName}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {lead.responsibleEmployee.employeeId} • {lead.responsibleEmployee.email}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-lg font-bold text-zinc-400">
                    ?
                  </div>
                  <div>
                    <div className="font-medium text-zinc-600 italic">
                      {lead.responsibleEmployeeName || "Not assigned"}
                    </div>
                    <div className="text-sm text-zinc-400">
                      Employee record deleted
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lost Reason (if applicable) */}
            {lead.status === "LOST" && lead.lostReason && (
              <div className="lg:col-span-2 rounded-xl bg-red-50 p-4">
                <h3 className="mb-2 font-semibold text-red-800">Lost Reason</h3>
                <p className="text-sm text-red-700">{lead.lostReason}</p>
              </div>
            )}

            {/* Approval Notes (if applicable) */}
            {lead.approvalNotes && (
              <div className="lg:col-span-2 rounded-xl bg-amber-50 p-4">
                <h3 className="mb-2 font-semibold text-amber-800">Approval Notes</h3>
                <p className="text-sm text-amber-700">{lead.approvalNotes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "services" && (
          <LeadServicesSection
            leadId={leadId}
            services={lead.services}
            isLocked={lead.isLocked}
            onUpdate={fetchLead}
          />
        )}

        {activeTab === "notes" && (
          <LeadNotesSection
            leadId={leadId}
            notes={lead.notes}
            reminders={lead.reminders}
            appointments={lead.appointments}
            onUpdate={fetchLead}
          />
        )}

        {activeTab === "activity" && <LeadActivityTimeline leadId={leadId} />}
      </div>

      {/* Modals */}
      {showApprovalModal && (
        <ApprovalActionsModal
          open={showApprovalModal}
          onClose={() => setShowApprovalModal(false)}
          leadId={leadId}
          onSuccess={() => {
            setShowApprovalModal(false);
            fetchLead();
          }}
        />
      )}

      {showStageModal && (
        <ChangeStageModal
          open={showStageModal}
          onClose={() => setShowStageModal(false)}
          leadId={leadId}
          currentStageId={lead.stage.id}
          stages={stages}
          onSuccess={() => {
            setShowStageModal(false);
            fetchLead();
          }}
        />
      )}
    </div>
    </PermissionGuard>
  );
}
