"use client";

import { useEffect, useRef } from "react";
import { useModalContext } from "../modal-stack-context";

/**
 * Bridges custom events from MessengerContext to the modal stack system.
 * Listens for `messenger:open` and `messenger:close` window events.
 */
export default function MessengerModalBridge() {
  const { openModal, closeModal, stack } = useModalContext();
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useEffect(() => {
    function handleOpen(e: Event) {
      const detail = (e as CustomEvent).detail;
      const conversationId = detail?.conversationId || "_";
      openModal("messenger", conversationId);
    }

    function handleClose() {
      const hasMessenger = stackRef.current.some(
        (s) => s.type === "messenger",
      );
      if (hasMessenger) closeModal();
    }

    window.addEventListener("messenger:open", handleOpen);
    window.addEventListener("messenger:close", handleClose);
    return () => {
      window.removeEventListener("messenger:open", handleOpen);
      window.removeEventListener("messenger:close", handleClose);
    };
  }, [openModal, closeModal]);

  return null;
}
