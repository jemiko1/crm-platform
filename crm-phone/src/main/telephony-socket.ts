import { io, Socket } from "socket.io-client";
import type { BrowserWindow } from "electron";
import { IPC } from "../shared/ipc-channels";

/**
 * Backend → softphone live event channel.
 *
 * Connects to the CRM's `/telephony` Socket.IO namespace with the
 * operator's JWT in the `Authorization` header (gateway expects this
 * exact header per `telephony.gateway.ts:authenticateSocket`). The
 * connection joins the per-user `agent:${userId}` room automatically
 * server-side, so events emitted to that room reach this socket.
 *
 * Events handled here in the main process:
 *   - `extension:changed` — admin re-linked / unlinked / edited / deleted
 *     the operator's extension. Forward to renderer; renderer rebinds
 *     SIP after fetching fresh credentials. Renderer soft-defers if the
 *     operator is on an active call (NEVER drop a call).
 *
 * Why main process and not renderer:
 *   - Keeps the JWT in main-process memory only (P0-A audit posture).
 *   - One socket per softphone instance, not per renderer window.
 *   - Reconnection lifecycle is decoupled from window open/close.
 */

let socket: Socket | null = null;

/**
 * Open or replace the backend Socket.IO connection. Call this:
 *   - After successful login (we have JWT + user id)
 *   - After session restore at app startup (same)
 *
 * Calling twice with the same session is idempotent — we close the
 * previous socket first. This handles JWT rotation cleanly.
 */
export function connectTelephonySocket(
  baseUrl: string,
  accessToken: string,
  mainWindow: BrowserWindow | null,
): void {
  // Close any prior connection — JWT rotation, user switch, etc.
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // The backend gateway lives at `/telephony` namespace. Path is the
  // default `/socket.io`. Auth via Authorization header is read by
  // `authenticateSocket()` (Silent Override Risk #12 — payload.sub).
  const url = baseUrl.replace(/\/$/, "");
  const conn = io(`${url}/telephony`, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
    extraHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  conn.on("connect", () => {
    console.log("[TELEPHONY-SOCKET] connected");
  });

  conn.on("disconnect", (reason) => {
    console.log(`[TELEPHONY-SOCKET] disconnected: ${reason}`);
  });

  conn.on("connect_error", (err) => {
    console.warn(`[TELEPHONY-SOCKET] connect_error: ${err.message}`);
  });

  // Forward `extension:changed` to the renderer. The renderer's rebind
  // handler decides whether to re-register immediately or soft-defer
  // until the active call ends.
  conn.on(
    "extension:changed",
    (payload: { reason: string; timestamp: string }) => {
      console.log(
        `[TELEPHONY-SOCKET] extension:changed reason=${payload.reason}`,
      );
      mainWindow?.webContents.send(IPC.EXTENSION_CHANGED, payload);
    },
  );

  socket = conn;
}

/**
 * Close the backend socket. Call on logout, app quit.
 */
export function disconnectTelephonySocket(): void {
  if (!socket) return;
  console.log("[TELEPHONY-SOCKET] closing");
  socket.disconnect();
  socket = null;
}

/**
 * For tests / debugging: is the socket currently connected?
 */
export function isTelephonySocketConnected(): boolean {
  return socket?.connected ?? false;
}
