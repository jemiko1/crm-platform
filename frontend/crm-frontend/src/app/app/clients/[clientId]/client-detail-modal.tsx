"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import ClientDetailContent from "./client-detail-content";

const BRAND = "rgb(8, 117, 56)";

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

type Props = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onUpdate?: () => void;
};

export default function ClientDetailModal({ open, onClose, clientId, onUpdate }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [referrerUrl, setReferrerUrl] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Store referrer URL when modal opens
  useEffect(() => {
    if (open && !referrerUrl) {
      // Get the current URL before the modal query parameter was added
      const currentUrl = window.location.pathname + window.location.search;
      // Remove the current modal's query parameter to get the referrer
      const params = new URLSearchParams(window.location.search);
      params.delete("client");
      const referrer = params.toString() 
        ? `${window.location.pathname}?${params.toString()}` 
        : window.location.pathname;
      setReferrerUrl(referrer);
    } else if (!open) {
      // Reset referrer when modal closes
      setReferrerUrl(null);
    }
  }, [open, referrerUrl]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Opening animation
  useEffect(() => {
    if (open) {
      setIsOpening(true);
      setTimeout(() => setIsOpening(false), 300);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !clientId) return;

    let cancelled = false;

    async function fetchClient() {
      try {
        setLoading(true);
        setError(null);
        const clientCoreId = Number(clientId);
        const foundClient = await apiGet<Client>(`/v1/clients/${clientCoreId}`, { cache: "no-store" });

        if (!cancelled) {
          setClient(foundClient);
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

    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
      // Navigate back to referrer URL if available, otherwise remove query param
      if (referrerUrl) {
        router.push(referrerUrl);
      } else {
        const params = new URLSearchParams(searchParams?.toString() || "");
        params.delete("client");
        const newUrl = params.toString() 
          ? `${window.location.pathname}?${params.toString()}` 
          : window.location.pathname;
        router.push(newUrl);
      }
    }, 300);
  }

  if (!mounted || !open) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 z-[10001] flex items-end lg:items-center justify-end lg:justify-start bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <div className="relative w-full lg:w-[calc(100%-148px)] lg:ml-[148px] h-full">
        <div
          className={`relative w-full h-full bg-white shadow-2xl flex flex-col transition-transform duration-300 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none lg:rounded-br-none ${
            isClosing ? "translate-y-full lg:translate-y-0 lg:translate-x-full" : isOpening ? "translate-y-full lg:translate-y-0 lg:translate-x-full" : "translate-y-0"
          }`}
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: "100vh" }}
        >
          {/* Close button - integrated into popup, top left corner (desktop) */}
          <button
            onClick={handleClose}
            className="hidden lg:flex absolute -left-12 top-6 z-[10002] h-12 w-12 bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-colors items-center justify-center"
            aria-label="Close"
            style={{ 
              borderRadius: "9999px 0 0 9999px",
              clipPath: "inset(0 0 0 0 round 9999px 0 0 9999px)"
            }}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Mobile close button - inside popup, top right corner */}
          <button
            onClick={handleClose}
            className="lg:hidden absolute top-4 right-4 z-[10002] h-10 w-10 bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-colors flex items-center justify-center rounded-full"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Content - scrollable */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-zinc-600">Loading client details...</div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
                  <div className="text-sm font-semibold text-red-900">Error loading client</div>
                  <div className="mt-1 text-sm text-red-700">{error}</div>
                </div>
              </div>
            ) : client ? (
              <ClientDetailContent 
                client={client} 
                clientId={clientId}
                onUpdate={onUpdate}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
