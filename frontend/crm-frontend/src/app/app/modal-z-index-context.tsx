"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";

/**
 * Modal Z-Index Context
 * 
 * Provides a centralized way to manage z-index values for modals.
 * Any modal that needs to appear on top of other content should use
 * the `useModalZIndex` hook to get a z-index value.
 * 
 * How it works:
 * - Detail modals (building, client, employee, work-order) use z-index 10000-10100
 * - Action modals (add, edit, report, etc.) use z-index 50000+
 * - Each new action modal gets z-index = 50000 + (incrementing counter * 10)
 * 
 * Usage in a modal component:
 * ```
 * const { getNextZIndex, releaseZIndex } = useModalZIndex();
 * const [zIndex] = useState(() => getNextZIndex());
 * 
 * useEffect(() => {
 *   return () => releaseZIndex(zIndex);
 * }, []);
 * ```
 */

// Base z-index for action modals - must be higher than detail modals (which use 10000-10100)
const ACTION_MODAL_BASE_Z_INDEX = 50000;
const Z_INDEX_INCREMENT = 10;

interface ModalZIndexContextValue {
  getNextZIndex: () => number;
  releaseZIndex: (zIndex: number) => void;
  currentMaxZIndex: number;
}

const ModalZIndexContext = createContext<ModalZIndexContextValue>({
  getNextZIndex: () => ACTION_MODAL_BASE_Z_INDEX,
  releaseZIndex: () => {},
  currentMaxZIndex: ACTION_MODAL_BASE_Z_INDEX,
});

export function ModalZIndexProvider({ children }: { children: React.ReactNode }) {
  const counterRef = useRef(0);
  const [currentMaxZIndex, setCurrentMaxZIndex] = useState(ACTION_MODAL_BASE_Z_INDEX);
  const activeZIndexes = useRef<Set<number>>(new Set());

  const getNextZIndex = useCallback(() => {
    counterRef.current += 1;
    const newZIndex = ACTION_MODAL_BASE_Z_INDEX + (counterRef.current * Z_INDEX_INCREMENT);
    activeZIndexes.current.add(newZIndex);
    setCurrentMaxZIndex(Math.max(...activeZIndexes.current, ACTION_MODAL_BASE_Z_INDEX));
    return newZIndex;
  }, []);

  const releaseZIndex = useCallback((zIndex: number) => {
    activeZIndexes.current.delete(zIndex);
    if (activeZIndexes.current.size > 0) {
      setCurrentMaxZIndex(Math.max(...activeZIndexes.current));
    } else {
      setCurrentMaxZIndex(ACTION_MODAL_BASE_Z_INDEX);
    }
  }, []);

  return (
    <ModalZIndexContext.Provider value={{ getNextZIndex, releaseZIndex, currentMaxZIndex }}>
      {children}
    </ModalZIndexContext.Provider>
  );
}

export function useModalZIndex() {
  return useContext(ModalZIndexContext);
}

/**
 * Hook to get a stable z-index for a modal.
 * Call this in your modal component and it will return a z-index
 * that's guaranteed to be higher than any detail modal.
 * 
 * The z-index is allocated when the hook is first called and
 * released when the component unmounts.
 */
export function useActionModalZIndex() {
  const { getNextZIndex, releaseZIndex } = useModalZIndex();
  const [zIndex] = useState(() => getNextZIndex());
  
  React.useEffect(() => {
    return () => releaseZIndex(zIndex);
  }, [zIndex, releaseZIndex]);
  
  return zIndex;
}

// Export a constant that can be used directly in modals that don't need dynamic z-index
// This is simpler and works for most cases
export const ACTION_MODAL_Z_INDEX = 50000;
