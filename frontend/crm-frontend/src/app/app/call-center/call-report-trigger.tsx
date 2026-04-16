"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { WS_BASE } from "@/lib/api";
import { usePermissions } from "@/lib/use-permissions";
import { CallReportModal } from "./reports/call-report-modal";

interface ReportTrigger {
  callSessionId: string;
  direction: string;
  callerNumber: string | null;
  calleeNumber: string | null;
  callerClient: { id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null } | null;
}

/**
 * Listens for call:report-trigger on the /telephony Socket.IO namespace.
 * When triggered, opens the CallReportModal.
 * Only connects for users with call_center.reports permission.
 */
export function CallReportTriggerListener() {
  const { hasPermission, loading } = usePermissions();
  const [trigger, setTrigger] = useState<ReportTrigger | null>(null);
  const [showModal, setShowModal] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const hasAccess = !loading && hasPermission("call_center.reports");

  useEffect(() => {
    if (!hasAccess) return;

    const socket = io(`${WS_BASE}/telephony`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;

    socket.on("call:report-trigger", (data: ReportTrigger) => {
      setTrigger(data);
      setShowModal(true);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [hasAccess]);

  const handleClose = () => {
    setShowModal(false);
    setTrigger(null);
  };

  if (!hasAccess) return null;

  return (
    <CallReportModal
      open={showModal}
      onClose={handleClose}
      trigger={trigger || undefined}
    />
  );
}
