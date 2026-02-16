"use client";

import { Suspense } from "react";
import ModalManager from "./modal-manager";
import { ModalZIndexProvider } from "./modal-z-index-context";
import { ModalStackProvider } from "./modal-stack-context";

/**
 * ModalStackWrapper — wraps the entire app in the modal stack context.
 * Children (page content) can use useModalContext() to open/close modals.
 * The ModalRenderer (inside Suspense) handles URL sync and renders the modals.
 */
export function ModalStackWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ModalStackProvider>
      <ModalZIndexProvider>
        {children}
        {/* Modal renderer needs Suspense for useSearchParams */}
        <Suspense fallback={null}>
          <ModalManager />
        </Suspense>
      </ModalZIndexProvider>
    </ModalStackProvider>
  );
}

// Keep default export for backwards compat (used nowhere now, but safe)
export default function ModalProvider() {
  return (
    <ModalZIndexProvider>
      <Suspense fallback={null}>
        <ModalManager />
      </Suspense>
    </ModalZIndexProvider>
  );
}
