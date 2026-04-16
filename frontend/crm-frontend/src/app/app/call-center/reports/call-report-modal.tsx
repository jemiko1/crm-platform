"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { useListItems } from "@/hooks/useListItems";
import { useI18n } from "@/hooks/useI18n";

interface PaymentResult {
  paymentId: string;
  client: { id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null; idNumber: string | null };
  apartment: { id: string; apartmentNumber: string | null; entranceNumber: string | null; floorNumber: string | null; balance: number | null };
  building: { id: string; name: string; address: string | null };
}

interface CallReportData {
  id?: string;
  callSessionId: string;
  callerClientId?: string | null;
  paymentId?: string | null;
  subjectClientId?: string | null;
  clientBuildingId?: string | null;
  buildingId?: string | null;
  labels?: { categoryCode: string }[];
  notes?: string | null;
  status?: "DRAFT" | "COMPLETED";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  trigger?: {
    callSessionId: string;
    direction: string;
    callerNumber: string | null;
    calleeNumber: string | null;
    callerClient: { id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null } | null;
  };
  editReport?: CallReportData;
}

export function CallReportModal({ open, onClose, onSuccess, trigger, editReport }: Props) {
  const { t, language } = useI18n();
  const { items: categories } = useListItems("CALL_REPORT_CATEGORY");
  const [mounted, setMounted] = useState(false);

  const [paymentIdInput, setPaymentIdInput] = useState("");
  const [paymentResults, setPaymentResults] = useState<PaymentResult[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setMounted(true); }, []);

  // Pre-fill from trigger or editReport
  useEffect(() => {
    if (!open) return;
    if (editReport) {
      setPaymentIdInput(editReport.paymentId || "");
      setSelectedLabels(new Set(editReport.labels?.map((l) => l.categoryCode) || []));
      setNotes(editReport.notes || "");
      // If paymentId exists, do a lookup to show the card
      if (editReport.paymentId) {
        lookupPayment(editReport.paymentId).then((results) => {
          const match = results.find((r) => r.paymentId === editReport.paymentId);
          if (match) setSelectedPayment(match);
        });
      }
    } else {
      setPaymentIdInput("");
      setPaymentResults([]);
      setSelectedPayment(null);
      setSelectedLabels(new Set());
      setCategoryFilter("");
      setNotes("");
      setError(null);
    }
  }, [open, editReport]);

  const lookupPayment = async (q: string): Promise<PaymentResult[]> => {
    try {
      const res = await apiGet<{ results: PaymentResult[] }>(`/v1/call-reports/payment-lookup?q=${encodeURIComponent(q)}`);
      return res.results;
    } catch { return []; }
  };

  const handlePaymentInput = useCallback((val: string) => {
    setPaymentIdInput(val);
    setSelectedPayment(null);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (val.length < 3) {
      setPaymentResults([]);
      return;
    }
    setLookupLoading(true);
    lookupTimer.current = setTimeout(async () => {
      const results = await lookupPayment(val);
      setPaymentResults(results);
      setLookupLoading(false);
    }, 300);
  }, []);

  const selectPayment = (r: PaymentResult) => {
    setSelectedPayment(r);
    setPaymentIdInput(r.paymentId || "");
    setPaymentResults([]);
  };

  const toggleLabel = (code: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const save = async (status: "DRAFT" | "COMPLETED") => {
    if (status === "COMPLETED" && selectedLabels.size === 0) {
      setError(t("callReports.minOneLabel", "At least one category is required"));
      return;
    }
    setError(null);
    setSaving(true);

    const body = {
      callSessionId: editReport?.callSessionId || trigger?.callSessionId,
      callerClientId: trigger?.callerClient?.id || editReport?.callerClientId || undefined,
      paymentId: selectedPayment?.paymentId || paymentIdInput || undefined,
      subjectClientId: selectedPayment?.client?.id || undefined,
      clientBuildingId: selectedPayment?.apartment?.id || undefined,
      buildingId: selectedPayment?.building?.id || undefined,
      labels: Array.from(selectedLabels),
      notes: notes || undefined,
      status,
    };

    try {
      if (editReport?.id) {
        await apiPatch(`/v1/call-reports/${editReport.id}`, body);
      } else {
        await apiPost("/v1/call-reports", body);
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  const filteredCategories = categories.filter((c) => {
    if (!categoryFilter) return true;
    const name = language === "ka" ? (c.displayNameKa || c.displayName) : c.displayName;
    return name.toLowerCase().includes(categoryFilter.toLowerCase());
  });

  const callerName = trigger?.callerClient
    ? `${trigger.callerClient.firstName || ""} ${trigger.callerClient.lastName || ""}`.trim()
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-zinc-900">
            {editReport?.id ? t("callReports.editReport", "Edit Report") : t("callReports.newReport", "New Report")}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Caller info */}
          {trigger && (
            <div className="rounded-xl bg-zinc-50 p-3 text-sm">
              <div className="flex items-center gap-4 text-zinc-700">
                <span>{t("callReports.caller", "Caller")}: <strong>{callerName || trigger.callerNumber || "—"}</strong></span>
                <span>{t("callReports.direction", "Direction")}: <strong>{trigger.direction === "IN" ? t("callReports.inbound", "Inbound") : t("callReports.outbound", "Outbound")}</strong></span>
              </div>
            </div>
          )}

          {/* Payment ID search */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">{t("callReports.paymentId", "Payment ID")}</label>
            <input
              type="text"
              value={paymentIdInput}
              onChange={(e) => handlePaymentInput(e.target.value)}
              placeholder={t("callReports.paymentIdPlaceholder", "Start typing payment ID...")}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
            {lookupLoading && <p className="mt-1 text-xs text-zinc-400">{t("common.loading", "Loading...")}</p>}
            {paymentResults.length > 0 && !selectedPayment && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
                {paymentResults.map((r) => (
                  <button key={r.paymentId} onClick={() => selectPayment(r)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-teal-50">
                    <span className="font-medium text-zinc-900">{r.paymentId}</span>
                    <span className="text-zinc-500">{r.client.firstName} {r.client.lastName}</span>
                    <span className="ml-auto text-xs text-zinc-400">{r.building.name}</span>
                  </button>
                ))}
              </div>
            )}
            {paymentIdInput.length >= 3 && paymentResults.length === 0 && !lookupLoading && !selectedPayment && (
              <p className="mt-1 text-xs text-zinc-400">{t("callReports.noMatch", "No matching results found")}</p>
            )}
          </div>

          {/* Resolved customer card */}
          {selectedPayment && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-teal-700">{t("callReports.resolvedCustomer", "Resolved Customer")}</p>
              <div className="grid grid-cols-2 gap-2 text-sm text-zinc-700">
                <div><span className="text-zinc-500">{t("callReports.client", "Client")}:</span> {selectedPayment.client.firstName} {selectedPayment.client.lastName}</div>
                <div><span className="text-zinc-500">{t("callReports.phone", "Phone")}:</span> {selectedPayment.client.primaryPhone || "—"}</div>
                <div><span className="text-zinc-500">{t("callReports.building", "Building")}:</span> {selectedPayment.building.name}</div>
                <div><span className="text-zinc-500">{t("callReports.apartment", "Apartment")}:</span> #{selectedPayment.apartment.apartmentNumber}</div>
                <div><span className="text-zinc-500">{t("callReports.floor", "Floor")}:</span> {selectedPayment.apartment.floorNumber || "—"}</div>
                <div><span className="text-zinc-500">{t("callReports.entrance", "Entrance")}:</span> {selectedPayment.apartment.entranceNumber || "—"}</div>
                <div><span className="text-zinc-500">{t("callReports.balance", "Balance")}:</span> <strong className={selectedPayment.apartment.balance && selectedPayment.apartment.balance < 0 ? "text-red-600" : "text-zinc-900"}>{selectedPayment.apartment.balance?.toFixed(2) ?? "—"} ₾</strong></div>
              </div>
            </div>
          )}

          {/* Categories */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">{t("callReports.categories", "Categories")}</label>
            <input
              type="text"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder={t("callReports.searchCategories", "Search categories...")}
              className="mb-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {filteredCategories.map((cat) => {
                const label = language === "ka" ? (cat.displayNameKa || cat.displayName) : cat.displayName;
                return (
                  <label key={cat.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      checked={selectedLabels.has(cat.value)}
                      onChange={() => toggleLabel(cat.value)}
                      className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-zinc-700">{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">{t("callReports.notes", "Notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("callReports.notesPlaceholder", "Add notes about the call...")}
              rows={3}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Error */}
          {error && <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => save("DRAFT")}
              disabled={saving}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {t("callReports.saveDraft", "Save Draft")}
            </button>
            <button
              onClick={() => save("COMPLETED")}
              disabled={saving}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {t("callReports.complete", "Complete")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
