"use client";

import { useState } from "react";
import { PermissionGuard } from "@/lib/permission-guard";
import InboxSidebar from "./components/inbox-sidebar";
import ConversationPanel from "./components/conversation-panel";
import EmptyState from "./components/empty-state";

function ClientChatsContent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white/40 backdrop-blur-sm rounded-2xl shadow-sm border border-white/60 overflow-hidden">
      {/* Left panel — conversation list */}
      <div className="w-[350px] min-w-[280px] border-r border-gray-200 flex-shrink-0 bg-white/50">
        <InboxSidebar selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Right panel — conversation thread */}
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <ConversationPanel key={selectedId} conversationId={selectedId} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

export default function ClientChatsPage() {
  return (
    <PermissionGuard permission="client_chats.menu">
      <ClientChatsContent />
    </PermissionGuard>
  );
}
