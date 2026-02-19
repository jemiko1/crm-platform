"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE, apiGet, apiPost } from "@/lib/api";
import type { Conversation, Message, ActiveChat } from "./types";

// ── Notification Sound ───────────────────────────────────
// Pre-load an Audio element from a static .wav file in /public.
// Chrome requires a user gesture before the first play(). We
// call load() eagerly so the file is cached, then play() after
// the first click.

let _notifAudio: HTMLAudioElement | null = null;

function getNotifAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!_notifAudio) {
    _notifAudio = new Audio("/notification.wav");
    _notifAudio.volume = 0.5;
    _notifAudio.load();
  }
  return _notifAudio;
}

export function playMessageSound() {
  const audio = getNotifAudio();
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ── Types ────────────────────────────────────────────────

interface ConversationsResponse {
  items: Conversation[];
  hasMore: boolean;
  nextCursor: string | null;
}

interface MessagesResponse {
  items: Message[];
  hasMore: boolean;
  nextCursor: string | null;
}

interface MessengerContextValue {
  conversations: Conversation[];
  unreadCount: number;
  onlineUsers: Set<string>;
  activeChats: ActiveChat[];
  isConnected: boolean;

  loadConversations: (
    filter?: string,
    search?: string,
    cursor?: string,
  ) => Promise<ConversationsResponse>;
  refreshConversations: () => void;

  openChat: (conversationId: string) => void;
  closeChat: (conversationId: string) => void;
  minimizeChat: (conversationId: string) => void;
  restoreChat: (conversationId: string) => void;

  openFullMessenger: (conversationId?: string) => void;
  closeFullMessenger: () => void;

  loadMessages: (
    conversationId: string,
    cursor?: string,
  ) => Promise<MessagesResponse>;
  sendMessage: (
    conversationId: string,
    content: string,
    replyToId?: string,
  ) => void;
  markAsRead: (conversationId: string) => void;

  sendTyping: (conversationId: string, isTyping: boolean) => void;

  socket: Socket | null;
  myEmployeeId: string | null;
}

const MessengerContext = createContext<MessengerContextValue>(
  {} as MessengerContextValue,
);

export const useMessenger = () => useContext(MessengerContext);

// ── Provider ─────────────────────────────────────────────

export function MessengerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [activeChats, setActiveChats] = useState<ActiveChat[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<Socket | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const myEmployeeIdRef = useRef(myEmployeeId);
  myEmployeeIdRef.current = myEmployeeId;
  const activeChatsRef = useRef(activeChats);
  activeChatsRef.current = activeChats;

  // Broadcast channel for cross-component message delivery
  // MessageList components subscribe to this to get new messages
  const messageListenersRef = useRef<Map<string, Set<(msg: Message) => void>>>(new Map());

  const subscribeToMessages = useCallback(
    (conversationId: string, handler: (msg: Message) => void) => {
      if (!messageListenersRef.current.has(conversationId)) {
        messageListenersRef.current.set(conversationId, new Set());
      }
      messageListenersRef.current.get(conversationId)!.add(handler);
      return () => {
        messageListenersRef.current.get(conversationId)?.delete(handler);
      };
    },
    [],
  );

  const broadcastMessage = useCallback((msg: Message) => {
    const listeners = messageListenersRef.current.get(msg.conversationId);
    if (listeners) {
      listeners.forEach((handler) => handler(msg));
    }
  }, []);

  // ── Fetch employee ID ──────────────────────────────────

  useEffect(() => {
    apiGet<{ unreadCount: number }>("/v1/messenger/unread-count")
      .then((data) => setUnreadCount(data.unreadCount))
      .catch(() => {});

    apiGet<{ employeeId: string }>("/v1/messenger/me")
      .then((data) => {
        if (data?.employeeId) {
          setMyEmployeeId(data.employeeId);
        }
      })
      .catch(() => {});
  }, []);

  // ── Socket Connection ──────────────────────────────────

  useEffect(() => {
    const socket = io(`${API_BASE}/messenger`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;
    setSocketState(socket);

    socket.on("connect", () => {
      console.log("[Messenger] Socket connected, id:", socket.id);
      setIsConnected(true);

      for (const chat of activeChatsRef.current) {
        socket.emit("conversation:join", {
          conversationId: chat.conversationId,
        });
      }

      socket.emit("online:check", {}, (data: { onlineIds: string[] }) => {
        if (data?.onlineIds) {
          setOnlineUsers(new Set(data.onlineIds));
        }
      });
    });

    socket.on("connect_error", (err) => {
      console.error("[Messenger] Socket connect_error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Messenger] Socket disconnected:", reason);
      setIsConnected(false);
    });

    // Global message:new listener — broadcasts to subscribed MessageList components
    socket.on("message:new", (msg: Message) => {
      console.log("[Messenger] WS message:new", msg?.id?.slice(0, 8), "conv:", msg?.conversationId?.slice(0, 8));
      broadcastMessage(msg);
    });

    socket.on("user:online", ({ employeeId }: { employeeId: string }) => {
      setOnlineUsers((prev) => new Set([...prev, employeeId]));
    });

    socket.on("user:offline", ({ employeeId }: { employeeId: string }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(employeeId);
        return next;
      });
    });

    socket.on(
      "conversation:updated",
      (data: {
        conversationId: string;
        lastMessageAt: string;
        lastMessageText: string;
        senderId: string;
      }) => {
        const isFromOther = data.senderId !== myEmployeeIdRef.current;

        // Update conversation list if it's loaded
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === data.conversationId);
          if (idx === -1) return prev;

          const updated = [...prev];
          const conv = { ...updated[idx] };
          conv.lastMessageAt = data.lastMessageAt;
          conv.lastMessageText = data.lastMessageText;
          if (isFromOther) {
            conv.unreadCount = (conv.unreadCount ?? 0) + 1;
          }
          updated.splice(idx, 1);
          updated.unshift(conv);
          return updated;
        });

        // Always update global unread count and play sound for messages from others
        // regardless of whether conversations list is loaded
        if (isFromOther) {
          setUnreadCount((prev) => prev + 1);
          playMessageSound();
        }
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketState(null);
    };
  }, [broadcastMessage]);

  // ── Polling fallback ────────────────────────────────────
  // Always poll unread count so the header badge stays current.
  // Also refresh conversations list if any chats are open.

  useEffect(() => {
    const interval = setInterval(() => {
      // Always poll unread count for the header badge
      apiGet<{ unreadCount: number }>("/v1/messenger/unread-count")
        .then((data) => {
          setUnreadCount(data.unreadCount);
        })
        .catch(() => {});

      // If chats are open, also refresh conversations list
      const chats = activeChatsRef.current;
      if (chats.length > 0) {
        apiGet<ConversationsResponse>("/v1/messenger/conversations?limit=20")
          .then((data) => {
            setConversations(data.items);
          })
          .catch(() => {});
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // ── Conversation Actions ───────────────────────────────

  const loadConversations = useCallback(
    async (filter?: string, search?: string, cursor?: string) => {
      const params = new URLSearchParams();
      if (filter) params.set("filter", filter);
      if (search) params.set("search", search);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");

      const data = await apiGet<ConversationsResponse>(
        `/v1/messenger/conversations?${params}`,
      );

      if (!cursor) {
        setConversations(data.items);
      } else {
        setConversations((prev) => [...prev, ...data.items]);
      }

      return data;
    },
    [],
  );

  const refreshConversations = useCallback(() => {
    loadConversations().catch(() => {});
  }, [loadConversations]);

  // ── Chat Bubble Actions ────────────────────────────────

  const openChat = useCallback((conversationId: string) => {
    setActiveChats((prev) => {
      const existing = prev.find((c) => c.conversationId === conversationId);
      if (existing) {
        return prev.map((c) =>
          c.conversationId === conversationId
            ? { ...c, minimized: false }
            : c,
        );
      }
      const newChats = [...prev, { conversationId, minimized: false }];
      if (newChats.length > 3) newChats.shift();
      return newChats;
    });
    socketRef.current?.emit("conversation:join", { conversationId });
  }, []);

  const closeChat = useCallback((conversationId: string) => {
    setActiveChats((prev) =>
      prev.filter((c) => c.conversationId !== conversationId),
    );
    socketRef.current?.emit("conversation:leave", { conversationId });
  }, []);

  const minimizeChat = useCallback((conversationId: string) => {
    setActiveChats((prev) =>
      prev.map((c) =>
        c.conversationId === conversationId ? { ...c, minimized: true } : c,
      ),
    );
  }, []);

  const restoreChat = useCallback((conversationId: string) => {
    setActiveChats((prev) =>
      prev.map((c) =>
        c.conversationId === conversationId ? { ...c, minimized: false } : c,
      ),
    );
  }, []);

  // ── Full Messenger (via modal stack) ───────────────────

  const openFullMessenger = useCallback((_conversationId?: string) => {
    window.dispatchEvent(
      new CustomEvent("messenger:open", {
        detail: { conversationId: _conversationId },
      }),
    );
  }, []);

  const closeFullMessenger = useCallback(() => {
    window.dispatchEvent(new CustomEvent("messenger:close"));
  }, []);

  // ── Message Actions ────────────────────────────────────

  const loadMessages = useCallback(
    async (conversationId: string, cursor?: string) => {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");

      return apiGet<MessagesResponse>(
        `/v1/messenger/conversations/${conversationId}/messages?${params}`,
      );
    },
    [],
  );

  const sendMessage = useCallback(
    (conversationId: string, content: string, replyToId?: string) => {
      // Use REST API — the backend controller will broadcast via WebSocket
      // to all participants including the sender
      apiPost<Message>(
        `/v1/messenger/conversations/${conversationId}/messages`,
        { content, replyToId },
      )
        .then((msg) => {
          if (msg?.id) {
            // Immediately show the sent message in the sender's UI
            broadcastMessage(msg);
          }
        })
        .catch((err) => {
          console.error("[Messenger] Failed to send message:", err);
        });
    },
    [broadcastMessage],
  );

  const markAsRead = useCallback((conversationId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("message:read", { conversationId });
    } else {
      apiPost(
        `/v1/messenger/conversations/${conversationId}/read`,
        {},
      ).catch(() => {});
    }
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      ),
    );
    setUnreadCount((prev) => {
      const conv = conversationsRef.current.find(
        (c) => c.id === conversationId,
      );
      return Math.max(0, prev - (conv?.unreadCount ?? 0));
    });
  }, []);

  const sendTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      socketRef.current?.emit("typing", { conversationId, isTyping });
    },
    [],
  );

  // ── Context Value ──────────────────────────────────────

  const value = useMemo<MessengerContextValue>(
    () => ({
      conversations,
      unreadCount,
      onlineUsers,
      activeChats,
      isConnected,
      loadConversations,
      refreshConversations,
      openChat,
      closeChat,
      minimizeChat,
      restoreChat,
      openFullMessenger,
      closeFullMessenger,
      loadMessages,
      sendMessage,
      markAsRead,
      sendTyping,
      socket: socketState,
      myEmployeeId,
    }),
    [
      conversations,
      unreadCount,
      onlineUsers,
      activeChats,
      isConnected,
      loadConversations,
      refreshConversations,
      openChat,
      closeChat,
      minimizeChat,
      restoreChat,
      openFullMessenger,
      closeFullMessenger,
      loadMessages,
      sendMessage,
      markAsRead,
      sendTyping,
      socketState,
      myEmployeeId,
    ],
  );

  // Expose subscribeToMessages via a second context to avoid re-renders
  return (
    <MessengerContext.Provider value={value}>
      <MessageBusContext.Provider value={subscribeToMessages}>
        {children}
      </MessageBusContext.Provider>
    </MessengerContext.Provider>
  );
}

// ── Message Bus Context ─────────────────────────────────
// Separate context so MessageList can subscribe without causing
// re-renders on every conversation state change

type MessageSubscriber = (conversationId: string, handler: (msg: Message) => void) => () => void;

const MessageBusContext = createContext<MessageSubscriber>(() => () => {});

export const useMessageBus = () => useContext(MessageBusContext);
