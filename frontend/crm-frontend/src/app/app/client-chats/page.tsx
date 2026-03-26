"use client";

import { useState } from "react";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import { useNotifications } from "./hooks/useNotifications";
import InboxSidebar from "./components/inbox-sidebar";
import ConversationPanel from "./components/conversation-panel";
import EmptyState from "./components/empty-state";
import ManagerDashboard from "./components/manager-dashboard";

type PageView = "inbox" | "dashboard";

function ClientChatsContent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<PageView>("inbox");
  const { hasPermission } = usePermissions();
  const isManager = hasPermission("client_chats.manage");
  const { showBanner, soundEnabled, requestPermission, dismissBanner, toggleSound, notify } = useNotifications();

  return (
    <div className="-m-4 sm:-m-6 flex min-h-0 min-w-0 flex-col overflow-hidden bg-white h-[calc(100dvh-52px-16px-24px)] sm:h-[calc(100dvh-52px-16px-48px)] lg:h-[calc(100dvh-52px-16px-48px)] lg:rounded-l-3xl">
      {isManager && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1 border-b border-gray-200 bg-white px-4 py-2">
          <button
            onClick={() => setView("inbox")}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              view === "inbox"
                ? "bg-teal-100 text-teal-900"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            Inbox
          </button>
          <button
            onClick={() => setView("dashboard")}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              view === "dashboard"
                ? "bg-teal-100 text-teal-900"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            Manager Dashboard
          </button>
        </div>
      )}

      {showBanner && view === "inbox" && (
        <div className="flex flex-shrink-0 flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0">Enable notifications to get alerted about new messages</span>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={requestPermission} className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Allow</button>
            <button onClick={dismissBanner} className="px-2 py-1 text-amber-600 hover:text-amber-800 text-xs">Dismiss</button>
          </div>
        </div>
      )}

      {view === "inbox" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
          <div
            className={`flex w-full shrink-0 flex-col min-h-0 border-gray-200 bg-white lg:w-[350px] lg:min-w-[280px] lg:border-r ${
              selectedId ? "hidden lg:flex" : "flex"
            }`}
          >
            <InboxSidebar selectedId={selectedId} onSelect={setSelectedId} isManager={isManager} notify={notify} soundToggle={
              <button
                onClick={toggleSound}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
              >
                {soundEnabled ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 0 1 1.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            } />
          </div>
          <div
            className={`min-h-0 min-w-0 flex-1 flex-col bg-zinc-50/50 ${
              selectedId ? "flex" : "hidden lg:flex"
            }`}
          >
            {selectedId ? (
              <ConversationPanel
                key={selectedId}
                conversationId={selectedId}
                onDeleted={() => setSelectedId(null)}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          <ManagerDashboard visible={view === "dashboard"} />
        </div>
      )}
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
