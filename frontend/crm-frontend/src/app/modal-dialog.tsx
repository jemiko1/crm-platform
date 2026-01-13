"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ModalDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "6xl";
};

export default function ModalDialog({
  open,
  onClose,
  title,
  children,
  maxWidth = "2xl",
}: ModalDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  // Ensure we're mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

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

  if (!open || !mounted) return null;

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl",
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fadeIn"
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
      onClick={(e) => {
        // Close when clicking backdrop (not the content)
        if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm"
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Modal content - centered in viewport */}
      <div
        ref={contentRef}
        className={`relative w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200 animate-scaleIn overflow-hidden`}
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{title || "Details"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
}
