"use client";

import { Suspense } from "react";
import ModalManager from "./modal-manager";
import { ModalZIndexProvider } from "./modal-z-index-context";

// Wrapper component to handle Suspense boundary for useSearchParams
// Also provides the z-index context for action modals
export default function ModalProvider() {
  return (
    <ModalZIndexProvider>
      <Suspense fallback={null}>
        <ModalManager />
      </Suspense>
    </ModalZIndexProvider>
  );
}
