"use client";

import React, { useEffect, useState, createContext, useContext, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { apiGet } from "@/lib/api";
import { usePermissions } from "@/lib/use-permissions";

// Import content components (not modals)
import BuildingDetailContent from "./buildings/[buildingId]/building-detail-content";
import ClientDetailContent from "./clients/[clientId]/client-detail-content";
import EmployeeDetailContent from "./employees/[employeeId]/employee-detail-content";

const BRAND = "rgb(8, 117, 56)";

// Modal type definitions
type ModalType = "building" | "client" | "employee" | "workOrder";

// Context for modal navigation
interface ModalContextValue {
  openModal: (type: ModalType, id: string) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextValue>({
  openModal: () => {},
  closeModal: () => {},
});

export const useModalContext = () => useContext(ModalContext);

// Fixed z-index for all detail modals (action modals use 50000+)
const MODAL_Z_INDEX = 10000;

// Type definitions for each entity
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

// Generic Modal Shell Component
interface ModalShellProps {
  children: React.ReactNode;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  loadingMessage?: string;
}

function ModalShell({ children, onClose, loading, error, loadingMessage = "Loading..." }: ModalShellProps) {
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(true);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setIsOpening(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Prevent body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  }

  if (!mounted) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 flex items-end lg:items-center justify-end lg:justify-start bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      style={{ zIndex: MODAL_Z_INDEX }}
      onClick={handleClose}
    >
      <div className="relative w-full lg:w-[calc(100%-148px)] lg:ml-[148px] h-full">
        <div
          className={`relative w-full h-full bg-white shadow-2xl flex flex-col transition-transform duration-300 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none lg:rounded-br-none ${
            isClosing ? "translate-y-full lg:translate-y-0 lg:translate-x-full" : isOpening ? "translate-y-full lg:translate-y-0 lg:translate-x-full" : "translate-y-0 lg:translate-x-0"
          }`}
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: "100vh" }}
        >
          {/* Close button - desktop */}
          <button
            onClick={handleClose}
            className="hidden lg:flex absolute -left-12 top-6 h-12 w-12 bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-colors items-center justify-center"
            style={{ 
              zIndex: MODAL_Z_INDEX + 1,
              borderRadius: "9999px 0 0 9999px",
              clipPath: "inset(0 0 0 0 round 9999px 0 0 9999px)"
            }}
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Close button - mobile */}
          <button
            onClick={handleClose}
            className="lg:hidden absolute top-4 right-4 h-10 w-10 bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-colors flex items-center justify-center rounded-full"
            style={{ zIndex: MODAL_Z_INDEX + 1 }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Content */}
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
  );

  return createPortal(modalContent, document.body);
}

// Building Modal Wrapper
function BuildingModal({ buildingId, onClose }: { buildingId: string; onClose: () => void }) {
  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchBuilding() {
      try {
        setLoading(true);
        setError(null);
        // Fetch all buildings and find by coreId (matches original modal behavior)
        const data = await apiGet<Building[]>("/v1/buildings", { cache: "no-store" });
        const foundBuilding = Array.isArray(data) 
          ? data.find((b) => String(b.coreId) === buildingId)
          : null;
        
        if (!cancelled) {
          if (foundBuilding) {
            setBuilding(foundBuilding);
          } else {
            setError(`Building ${buildingId} not found`);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load building");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchBuilding();
    return () => { cancelled = true; };
  }, [buildingId]);

  return (
    <ModalShell 
      onClose={onClose} 
      loading={loading} 
      error={error}
      loadingMessage="Loading building details..."
    >
      {building && (
        <BuildingDetailContent 
          building={building} 
          buildingId={buildingId}
          onUpdate={() => window.location.reload()}
        />
      )}
    </ModalShell>
  );
}

// Client Modal Wrapper
function ClientModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchClient() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiGet<Client[]>("/v1/clients", { cache: "no-store" });
        const clientCoreId = Number(clientId);
        const foundClient = Array.isArray(data) ? data.find((c) => Number(c.coreId) === clientCoreId) : null;
        
        if (!cancelled) {
          if (foundClient) {
            setClient(foundClient);
          } else {
            setError(`Client ${clientId} not found`);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load client");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchClient();
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <ModalShell 
      onClose={onClose} 
      loading={loading} 
      error={error}
      loadingMessage="Loading client details..."
    >
      {client && (
        <ClientDetailContent 
          client={client} 
          clientId={clientId}
          onUpdate={() => window.location.reload()}
        />
      )}
    </ModalShell>
  );
}

// Employee Modal Wrapper
function EmployeeModal({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEmployee() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiGet<Employee>(`/v1/employees/${employeeId}`);
        if (!cancelled) {
          setEmployee(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load employee");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEmployee();
    return () => { cancelled = true; };
  }, [employeeId]);

  return (
    <ModalShell 
      onClose={onClose} 
      loading={loading} 
      error={error}
      loadingMessage="Loading employee details..."
    >
      {employee && (
        <EmployeeDetailContent 
          employee={employee} 
          employeeId={employeeId}
          onUpdate={() => window.location.reload()}
        />
      )}
    </ModalShell>
  );
}

// Work Order Modal - uses lazy import of the full existing modal
// The work order modal is complex and has its own internal state management
function WorkOrderModal({ workOrderId, onClose }: { workOrderId: string; onClose: () => void }) {
  const { hasPermission, loading: permLoading } = usePermissions();
  const [WorkOrderDetailModal, setWorkOrderDetailModal] = useState<React.ComponentType<any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dynamic import the existing work order modal
    import("./work-orders/[id]/work-order-detail-modal").then((mod) => {
      setWorkOrderDetailModal(() => mod.default);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load work order modal:", err);
      setLoading(false);
    });
  }, []);

  // Check permission – show error inside modal shell if denied
  if (!permLoading && !hasPermission('work_orders.read')) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-sm rounded-2xl bg-rose-50 p-8 ring-1 ring-rose-200 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 ring-1 ring-rose-200">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-600">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <div className="mt-4 text-base font-semibold text-rose-900">Insufficient Permissions</div>
            <div className="mt-2 text-sm text-rose-700">
              You do not have the required permissions to view work order details.
            </div>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (loading || permLoading || !WorkOrderDetailModal) {
    return (
      <ModalShell 
        onClose={onClose} 
        loading={true}
        loadingMessage="Loading work order..."
      >
        <div />
      </ModalShell>
    );
  }

  // Render the existing modal
  return (
    <WorkOrderDetailModal
      open={true}
      onClose={onClose}
      workOrderId={workOrderId}
      onUpdate={() => window.location.reload()}
      zIndex={MODAL_Z_INDEX}
    />
  );
}

// Main ModalManager Component
export default function ModalManager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current modal params
  const searchParamsString = searchParams?.toString() || "";
  const params = new URLSearchParams(searchParamsString);
  
  const buildingId = params.get("building");
  const clientId = params.get("client");
  const employeeId = params.get("employee");
  const workOrderId = params.get("workOrder");

  // Determine which modal to show (only one at a time)
  // Priority: workOrder > employee > client > building
  // This determines which modal is "active" when URL has multiple params
  const activeModal = workOrderId 
    ? { type: "workOrder" as ModalType, id: workOrderId }
    : employeeId 
    ? { type: "employee" as ModalType, id: employeeId }
    : clientId 
    ? { type: "client" as ModalType, id: clientId }
    : buildingId 
    ? { type: "building" as ModalType, id: buildingId }
    : null;

  // Open a new modal - navigates to new URL (adds to browser history)
  const openModal = useCallback((type: ModalType, id: string) => {
    const currentPath = pathname || "/app";
    router.push(`${currentPath}?${type}=${id}`);
  }, [router, pathname]);

  // Close modal - go back in browser history
  const closeModal = useCallback(() => {
    router.back();
  }, [router]);

  // Render the active modal
  return (
    <ModalContext.Provider value={{ openModal, closeModal }}>
      {activeModal?.type === "building" && activeModal.id && (
        <BuildingModal
          key={`building-${activeModal.id}`}
          buildingId={activeModal.id}
          onClose={closeModal}
        />
      )}
      {activeModal?.type === "client" && activeModal.id && (
        <ClientModal
          key={`client-${activeModal.id}`}
          clientId={activeModal.id}
          onClose={closeModal}
        />
      )}
      {activeModal?.type === "employee" && activeModal.id && (
        <EmployeeModal
          key={`employee-${activeModal.id}`}
          employeeId={activeModal.id}
          onClose={closeModal}
        />
      )}
      {activeModal?.type === "workOrder" && activeModal.id && (
        <WorkOrderModal
          key={`workOrder-${activeModal.id}`}
          workOrderId={activeModal.id}
          onClose={closeModal}
        />
      )}
    </ModalContext.Provider>
  );
}
