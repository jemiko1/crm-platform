"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { apiGet } from "@/lib/api";
import { usePermissions } from "@/lib/use-permissions";

// Stack context (holds all state, provided higher in the tree)
import {
  useModalContext,
  useModalStackInternals,
  readEntryFromParams,
  type ModalType,
  type StackEntry,
} from "./modal-stack-context";

// Re-export so existing imports keep working
export { useModalContext } from "./modal-stack-context";

// Import content components
import BuildingDetailContent from "./buildings/[buildingId]/building-detail-content";
import ClientDetailContent from "./clients/[clientId]/client-detail-content";
import EmployeeDetailContent from "./employees/[employeeId]/employee-detail-content";
import IncidentDetailContent from "./incidents/incident-detail-content";
import FullMessengerContent from "./messenger/full-messenger-content";

// Base z-index for the stack. Each layer adds +10.
const STACK_BASE_Z_INDEX = 10000;
const Z_INDEX_PER_LAYER = 10;

// ─────────────────────────────────────────────────────────
// Type definitions for each entity
// ─────────────────────────────────────────────────────────

type Building = {
  coreId: number;
  name: string;
  address: string;
  city: string;
  clientCount: number;
  workOrderCount: number;
  products: Record<string, number>;
  updatedAt: string;
};

type ClientBuildingRef = {
  coreId: number;
  name: string;
};

type Client = {
  coreId: number;
  firstName: string | null;
  lastName: string | null;
  idNumber: string | null;
  paymentId: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  updatedAt: string;
  buildings: ClientBuildingRef[];
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeId: string;
  jobTitle?: string | null;
  extensionNumber?: string | null;
  birthday?: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
  avatar: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  user: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
  } | null;
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  position: {
    id: string;
    name: string;
    code: string;
  } | null;
  role: {
    id: string;
    name: string;
    code: string;
    permissions?: Array<{
      permission: {
        resource: string;
        action: string;
        description: string | null;
      };
    }>;
  } | null;
  manager: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  subordinates: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  workOrderAssignments: Array<{
    id: string;
    assignedAt: string;
    workOrder: {
      id: string;
      title: string;
      status: string;
      type: string;
      building: {
        name: string;
      };
    };
  }>;
  departmentId: string | null;
  roleId: string | null;
  managerId: string | null;
  hireDate?: string;
  exitDate?: string | null;
};

// ─────────────────────────────────────────────────────────
// ModalShell — stack-aware
// ─────────────────────────────────────────────────────────

interface ModalShellProps {
  children: React.ReactNode;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  loadingMessage?: string;
  zIndex: number;
  isTopmost: boolean;
  stackDepth: number;
  stackSize: number;
}

function ModalShell({
  children,
  onClose,
  loading,
  error,
  loadingMessage = "Loading...",
  zIndex,
  isTopmost,
  stackDepth,
  stackSize,
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(true);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setIsOpening(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Prevent body scroll only from the bottom-most modal
  // Use position:fixed on body for reliable scroll lock (especially on mobile)
  useEffect(() => {
    if (stackDepth === 0) {
      const scrollY = window.scrollY;
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const originalTop = document.body.style.top;
      const originalWidth = document.body.style.width;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.top = originalTop;
        document.body.style.width = originalWidth;
        window.scrollTo(0, scrollY);
      };
    }
  }, [stackDepth]);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  }

  if (!mounted) return null;

  const depthFromTop = stackSize - 1 - stackDepth;
  const offsetPx = isTopmost ? 0 : depthFromTop * 32;

  const modalContent = (
    <div
      className={`fixed inset-0 transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      style={{ zIndex }}
    >
      {stackDepth === 0 && (
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        />
      )}

      {!isTopmost && !isClosing && (
        <div
          className="absolute inset-0 bg-black/15 transition-opacity duration-200"
          style={{ zIndex: zIndex + 1 }}
        />
      )}

      <div className="absolute inset-0 flex items-end lg:items-center justify-end lg:justify-start pointer-events-none">
        <div
          className="relative w-full lg:w-[calc(100%-148px)] lg:ml-[148px] h-full pointer-events-none"
          style={{
            transform: offsetPx > 0 ? `translateX(-${offsetPx}px)` : undefined,
            transition: "transform 300ms ease",
          }}
        >
          <div
            className={`pointer-events-auto relative w-full h-full bg-white shadow-2xl flex flex-col transition-transform duration-300 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none lg:rounded-br-none ${
              isClosing
                ? "translate-y-full lg:translate-y-0 lg:translate-x-full"
                : isOpening
                ? "translate-y-full lg:translate-y-0 lg:translate-x-full"
                : "translate-y-0 lg:translate-x-0"
            }`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "min(100vh, 100dvh)" }}
          >
            {isTopmost && (
              <button
                onClick={handleClose}
                className="hidden lg:flex absolute -left-12 top-6 h-12 w-12 bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-colors items-center justify-center"
                style={{
                  zIndex: zIndex + 2,
                  borderRadius: "9999px 0 0 9999px",
                  clipPath: "inset(0 0 0 0 round 9999px 0 0 9999px)",
                }}
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {isTopmost && (
              <button
                onClick={handleClose}
                className="lg:hidden absolute top-4 right-4 h-10 w-10 bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-colors flex items-center justify-center rounded-full"
                style={{ zIndex: zIndex + 2 }}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-sm text-zinc-600">{loadingMessage}</div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full">
                  <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
                    <div className="text-sm font-semibold text-red-900">Error</div>
                    <div className="mt-1 text-sm text-red-700">{error}</div>
                  </div>
                </div>
              ) : (
                children
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// ─────────────────────────────────────────────────────────
// Permission denied shell
// ─────────────────────────────────────────────────────────

function PermissionDeniedShell({ onClose, zIndex, isTopmost, stackDepth, stackSize, message }: {
  onClose: () => void;
  zIndex: number;
  isTopmost: boolean;
  stackDepth: number;
  stackSize: number;
  message: string;
}) {
  return (
    <ModalShell onClose={onClose} zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize}>
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-sm rounded-2xl bg-rose-50 p-8 ring-1 ring-rose-200 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 ring-1 ring-rose-200">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <div className="mt-4 text-base font-semibold text-rose-900">Insufficient Permissions</div>
          <div className="mt-2 text-sm text-rose-700">{message}</div>
        </div>
      </div>
    </ModalShell>
  );
}

// Shared props for each modal wrapper
interface StackedModalProps {
  onClose: () => void;
  zIndex: number;
  isTopmost: boolean;
  stackDepth: number;
  stackSize: number;
  onRefresh: () => void;
}

// ─────────────────────────────────────────────────────────
// Building Modal Wrapper
// ─────────────────────────────────────────────────────────

function BuildingModal({ buildingId, onClose, zIndex, isTopmost, stackDepth, stackSize, onRefresh }: { buildingId: string } & StackedModalProps) {
  const { hasPermission, loading: permLoading } = usePermissions();
  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchBuilding = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const foundBuilding = await apiGet<Building>(`/v1/buildings/${buildingId}`, { cache: "no-store" });
      setBuilding(foundBuilding);
    } catch (err: any) {
      setError(err.message || "Failed to load building");
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => { fetchBuilding(); }, [fetchBuilding, refreshKey]);

  const handleUpdate = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onRefresh();
  }, [onRefresh]);

  if (!permLoading && !hasPermission("buildings.details_read")) {
    return <PermissionDeniedShell onClose={onClose} zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize} message="You do not have the required permissions to view building details." />;
  }

  return (
    <ModalShell onClose={onClose} loading={loading || permLoading} error={error} loadingMessage="Loading building details..." zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize}>
      {building && <BuildingDetailContent building={building} buildingId={buildingId} onUpdate={handleUpdate} />}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────
// Client Modal Wrapper
// ─────────────────────────────────────────────────────────

function ClientModal({ clientId, onClose, zIndex, isTopmost, stackDepth, stackSize, onRefresh }: { clientId: string } & StackedModalProps) {
  const { hasPermission, loading: permLoading } = usePermissions();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchClient = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const foundClient = await apiGet<Client>(`/v1/clients/${clientId}`, { cache: "no-store" });
      setClient(foundClient);
    } catch (err: any) {
      setError(err.message || "Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchClient(); }, [fetchClient, refreshKey]);

  const handleUpdate = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onRefresh();
  }, [onRefresh]);

  if (!permLoading && !hasPermission("clients.details_read")) {
    return <PermissionDeniedShell onClose={onClose} zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize} message="You do not have the required permissions to view client details." />;
  }

  return (
    <ModalShell onClose={onClose} loading={loading || permLoading} error={error} loadingMessage="Loading client details..." zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize}>
      {client && <ClientDetailContent client={client} clientId={clientId} onUpdate={handleUpdate} />}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────
// Employee Modal Wrapper
// ─────────────────────────────────────────────────────────

function EmployeeModal({ employeeId, onClose, zIndex, isTopmost, stackDepth, stackSize, onRefresh }: { employeeId: string } & StackedModalProps) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchEmployee = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<Employee>(`/v1/employees/${employeeId}`);
      setEmployee(data);
    } catch (err: any) {
      setError(err.message || "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchEmployee(); }, [fetchEmployee, refreshKey]);

  const handleUpdate = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onRefresh();
  }, [onRefresh]);

  return (
    <ModalShell onClose={onClose} loading={loading} error={error} loadingMessage="Loading employee details..." zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize}>
      {employee && <EmployeeDetailContent employee={employee} employeeId={employeeId} onUpdate={handleUpdate} />}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────
// Work Order Modal
// ─────────────────────────────────────────────────────────

function WorkOrderModal({ workOrderId, onClose, zIndex, isTopmost, stackDepth, stackSize, onRefresh }: { workOrderId: string } & StackedModalProps) {
  const { hasPermission, loading: permLoading } = usePermissions();
  const [WorkOrderDetailModalCmp, setWorkOrderDetailModalCmp] = useState<React.ComponentType<any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import("./work-orders/[id]/work-order-detail-modal").then((mod) => {
      setWorkOrderDetailModalCmp(() => mod.default);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load work order modal:", err);
      setLoading(false);
    });
  }, []);

  const handleUpdate = useCallback(() => { onRefresh(); }, [onRefresh]);

  if (!permLoading && !hasPermission("work_orders.read")) {
    return <PermissionDeniedShell onClose={onClose} zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize} message="You do not have the required permissions to view work order details." />;
  }

  if (loading || permLoading || !WorkOrderDetailModalCmp) {
    return (
      <ModalShell onClose={onClose} loading={true} loadingMessage="Loading work order..." zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize}>
        <div />
      </ModalShell>
    );
  }

  return <WorkOrderDetailModalCmp open={true} onClose={onClose} workOrderId={workOrderId} onUpdate={handleUpdate} zIndex={zIndex} />;
}

// ─────────────────────────────────────────────────────────
// Incident Modal Wrapper
// ─────────────────────────────────────────────────────────

function IncidentModal({ incidentId, onClose, zIndex, isTopmost, stackDepth, stackSize, onRefresh }: { incidentId: string } & StackedModalProps) {
  const { hasPermission, loading: permLoading } = usePermissions();
  const handleStatusChange = useCallback(() => { onRefresh(); }, [onRefresh]);

  if (!permLoading && !hasPermission("incidents.details_read")) {
    return <PermissionDeniedShell onClose={onClose} zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize} message="You do not have the required permissions to view incident details." />;
  }

  if (permLoading) {
    return (
      <ModalShell onClose={onClose} loading={true} loadingMessage="Loading incident details..." zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize}>
        <div />
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize}>
      <div className="p-6">
        <IncidentDetailContent incidentId={incidentId} onStatusChange={handleStatusChange} />
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────
// Messenger Modal Wrapper
// ─────────────────────────────────────────────────────────

function MessengerModal({ conversationId, onClose, zIndex, isTopmost, stackDepth, stackSize, onRefresh }: { conversationId: string } & StackedModalProps) {
  return (
    <ModalShell onClose={onClose} zIndex={zIndex} isTopmost={isTopmost} stackDepth={stackDepth} stackSize={stackSize}>
      <FullMessengerContent initialConversationId={conversationId !== "_" ? conversationId : undefined} />
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────
// Main ModalManager — Renderer + URL Sync
// ─────────────────────────────────────────────────────────

export default function ModalManager() {
  const searchParams = useSearchParams();
  const { stack, closeModal, emitRefresh } = useModalContext();
  const { _seedFromUrl, _restoreFromState, _syncFromSearchParams, _clearStack, handlingPopstateRef } = useModalStackInternals();

  const initializedRef = useRef(false);

  // Initialize from URL on first mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const existingState = window.history.state?.["__modalStack"];
    if (Array.isArray(existingState) && existingState.length > 0) {
      _restoreFromState(existingState);
      return;
    }

    const params = new URLSearchParams(searchParams?.toString() || "");
    const entry = readEntryFromParams(params);
    if (entry) {
      _seedFromUrl(entry);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Respond to URL changes from Next.js navigation
  useEffect(() => {
    if (!initializedRef.current) return;
    if (handlingPopstateRef.current) return;

    const params = new URLSearchParams(searchParams?.toString() || "");
    const entry = readEntryFromParams(params);

    if (!entry) {
      _clearStack();
      return;
    }

    _syncFromSearchParams(entry);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Render all stack entries
  return (
    <>
      {stack.map((entry, index) => {
        const zIndex = STACK_BASE_Z_INDEX + index * Z_INDEX_PER_LAYER;
        const isTopmost = index === stack.length - 1;
        const sharedProps: StackedModalProps = {
          onClose: closeModal,
          zIndex,
          isTopmost,
          stackDepth: index,
          stackSize: stack.length,
          onRefresh: emitRefresh,
        };

        switch (entry.type) {
          case "building":
            return <BuildingModal key={entry.key} buildingId={entry.id} {...sharedProps} />;
          case "client":
            return <ClientModal key={entry.key} clientId={entry.id} {...sharedProps} />;
          case "employee":
            return <EmployeeModal key={entry.key} employeeId={entry.id} {...sharedProps} />;
          case "workOrder":
            return <WorkOrderModal key={entry.key} workOrderId={entry.id} {...sharedProps} />;
          case "incident":
            return <IncidentModal key={entry.key} incidentId={entry.id} {...sharedProps} />;
          case "messenger":
            return <MessengerModal key={entry.key} conversationId={entry.id} {...sharedProps} />;
          default:
            return null;
        }
      })}
    </>
  );
}
