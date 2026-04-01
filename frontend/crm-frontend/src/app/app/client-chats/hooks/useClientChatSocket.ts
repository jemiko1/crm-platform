"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { WS_BASE } from "@/lib/api";

type EventCallback = (...args: any[]) => void;

export function useClientChatSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<EventCallback>>>(new Map());

  useEffect(() => {
    const url = WS_BASE;
    if (!url) return;

    const socket = io(`${url}/ws/clientchats`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
    });

    socket.onAny((event: string, ...args: any[]) => {
      const callbacks = listenersRef.current.get(event);
      if (callbacks) {
        callbacks.forEach((cb) => cb(...args));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, []);

  const on = useCallback((event: string, callback: EventCallback) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);
  }, []);

  const off = useCallback((event: string, callback: EventCallback) => {
    listenersRef.current.get(event)?.delete(callback);
  }, []);

  return { on, off, isConnected };
}
