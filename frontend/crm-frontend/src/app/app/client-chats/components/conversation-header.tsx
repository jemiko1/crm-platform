"use client";

import { useState, useEffect, useRef } from "react";
import { apiPatch, apiPost, apiGet, apiGetList, apiDelete } from "@/lib/api";
import { usePermissions } from "@/lib/use-permissions";
import type { ConversationDetail, AgentOption } from "../types";
import ChannelBadge from "./channel-badge";

interface ConversationHeaderProps {
  conversation: ConversationDetail;
  currentUserId: string | null;
  onUpdate: () => void;
  onDeleted?: () => void;
}

export default function ConversationHeader({ conversation, currentUserId, onUpdate, onDeleted }: ConversationHeaderProps) {
  const [showAssign, setShowAssign] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<{ id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null }[]>([]);
  const { hasPermission } = usePermissions();
  const isManager = hasPermission("client_chats.manage");

  const clientName = conversation.client
    ? `${conversation.client.firstName ?? ""} ${conversation.client.lastName ?? ""}`.trim() || `Client #${conversation.client.coreId}`
    : null;
  const displayName = clientName ?? conversation.participant?.displayName ?? "Unknown Customer";

  const assignedName = conversation.assignedUser
    ? conversation.assignedUser.employee
      ? `${conversation.assignedUser.employee.firstName} ${conversation.assignedUser.employee.lastName}`.trim()
      : conversation.assignedUser.email
    : null;

  const isPaused = !!conversation.pausedOperatorId;
  const hasReopenRequest = !!conversation.reopenRequestedBy;
  const isLive = conversation.status === "LIVE";
  const isClosed = conversation.status === "CLOSED";
  const isMyChat = conversation.assignedUserId === currentUserId;
  const imPaused = conversation.pausedOperatorId === currentUserId;

  async function handleClose() {
    await apiPatch(`/v1/clientchats/conversations/${conversation.id}/status`, { status: "CLOSED" });
    onUpdate();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiDelete(`/v1/clientchats/queue/conversations/${conversation.id}`);
      setShowDeleteConfirm(false);
      onDeleted?.();
    } catch {
      alert("Failed to delete conversation");
    } finally {
      setDeleting(false);
    }
  }

  async function openAssignDropdown() {
    if (!showAssign) {
      try {
        const res = await apiGetList<{ userId: string; user: { id: string; email: string }; firstName: string; lastName: string }>("/v1/employees?limit=100");
        setAgents(res.map((e) => ({
          id: e.user?.id ?? e.userId,
          email: e.user?.email ?? "---",
          name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || e.user?.email || "---",
        })));
      } catch {
        setAgents([]);
      }
    }
    setShowAssign(!showAssign);
  }

  async function handleAssign(userId: string) {
    await apiPatch(`/v1/clientchats/conversations/${conversation.id}/assign`, { userId });
    setShowAssign(false);
    onUpdate();
  }

  async function handlePause() {
    await apiPost(`/v1/clientchats/queue/conversations/${conversation.id}/pause-operator`, {});
    onUpdate();
  }

  async function handleUnpause() {
    await apiPost(`/v1/clientchats/queue/conversations/${conversation.id}/unpause-operator`, {});
    onUpdate();
  }

  async function handleRequestReopen() {
    await apiPost(`/v1/clientchats/conversations/${conversation.id}/request-reopen`, {});
    onUpdate();
  }

  async function handleReopen(keepOperator: boolean) {
    await apiPost(`/v1/clientchats/queue/conversations/${conversation.id}/reopen`, { keepOperator });
    setShowReopenModal(false);
    onUpdate();
  }

  async function handleApproveReopen(keepOperator: boolean) {
    await apiPost(`/v1/clientchats/queue/conversations/${conversation.id}/approve-reopen`, { keepOperator });
    setShowReopenModal(false);
    onUpdate();
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showLink) return;
    const q = linkSearch.trim();
    if (!q) { setLinkResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiGetList<{ id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null }>(`/v1/clients?search=${encodeURIComponent(q)}&pageSize=10`);
        setLinkResults(res.slice(0, 10));
      } catch { setLinkResults([]); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [linkSearch, showLink]);

  async function handleLink(clientId: string) {
    await apiPost(`/v1/clientchats/conversations/${conversation.id}/link-client`, { clientId });
    setShowLink(false);
    setLinkSearch("");
    onUpdate();
  }

  async function handleUnlink() {
    await apiPost(`/v1/clientchats/conversations/${conversation.id}/unlink-client`, {});
    onUpdate();
  }

  return (
    <div className="border-b border-gray-200 bg-white/70 backdrop-blur-sm px-4 py-3">
      {/* Row 1: Name + Channel + Close button */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <ChannelBadge channel={conversation.channelType} />
          <span className="text-sm font-semibold text-gray-800 truncate">{displayName}</span>
          {isPaused && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">
              Manager Takeover
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isLive && (isMyChat || isManager) && (
            <button
              onClick={handleClose}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
            >
              Close Chat
            </button>
          )}
          {isClosed && isManager && (
            <button
              onClick={() => setShowReopenModal(true)}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
            >
              Reopen
            </button>
          )}
          {isClosed && !isManager && isMyChat && !hasReopenRequest && (
            <button
              onClick={handleRequestReopen}
              className="px-4 py-1.5 text-sm font-medium rounded-lg border border-emerald-400 text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              Request Reopen
            </button>
          )}
          {isClosed && hasReopenRequest && !isManager && (
            <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              Reopen Pending Approval
            </span>
          )}
          {isClosed && hasReopenRequest && isManager && (
            <button
              onClick={() => setShowReopenModal(true)}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm animate-pulse"
            >
              Approve Reopen
            </button>
          )}
          {hasPermission("client_chats.delete") && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
              title="Delete conversation permanently"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Assignment + Manager controls + Client link */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Assigned operator display */}
        {assignedName && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200">
            <span className={`w-2 h-2 rounded-full ${isPaused ? "bg-amber-400" : "bg-emerald-500"}`} />
            <span className="text-xs font-medium text-blue-700">
              {assignedName}
            </span>
          </div>
        )}

        {/* Assign button (manager only) */}
        {isManager && isLive && (
          <div className="relative">
            <button
              onClick={openAssignDropdown}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors shadow-sm"
            >
              {conversation.assignedUser ? "Reassign" : "Assign"}
            </button>
            {showAssign && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-20 max-h-60 overflow-y-auto">
                {agents.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">No employees found</div>
                ) : (
                  agents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleAssign(a.id)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 border-b border-gray-50 ${
                        conversation.assignedUserId === a.id ? "bg-indigo-50 font-semibold text-indigo-700" : "text-gray-700"
                      }`}
                    >
                      <div className="font-medium">{a.name}</div>
                      <div className="text-gray-400">{a.email}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Manager: Pause / Unpause operator */}
        {isManager && isLive && conversation.assignedUserId && (
          isPaused ? (
            <button
              onClick={handleUnpause}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-400 text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              Unpause Operator
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-50 transition-colors"
            >
              Pause Operator
            </button>
          )
        )}

        <div className="flex-1" />

        {/* Client link */}
        {conversation.client ? (
          <div className="flex items-center gap-1">
            <a
              href={`/app/clients/${conversation.client.id}`}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              {clientName}
            </a>
            <button onClick={handleUnlink} className="px-1.5 py-1.5 text-xs text-red-500 hover:text-red-700" title="Unlink client">
              ✕
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowLink(!showLink)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-emerald-400 hover:text-emerald-600"
            >
              Link Client
            </button>
            {showLink && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-20 p-2">
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 mb-2"
                />
                <div className="max-h-40 overflow-y-auto">
                  {linkResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleLink(c.id)}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-emerald-50 rounded"
                    >
                      {`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "---"} · {c.primaryPhone ?? "---"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reopen modal */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowReopenModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              {hasReopenRequest ? "Approve Reopen Request" : "Reopen Conversation"}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              How should this conversation be handled?
            </p>
            <div className="flex flex-col gap-2">
              {conversation.assignedUserId && (
                <button
                  onClick={() => hasReopenRequest ? handleApproveReopen(true) : handleReopen(true)}
                  className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                >
                  Keep Current Operator
                </button>
              )}
              <button
                onClick={() => hasReopenRequest ? handleApproveReopen(false) : handleReopen(false)}
                className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
              >
                Send to Queue
              </button>
              <button
                onClick={() => setShowReopenModal(false)}
                className="w-full px-4 py-2 text-sm font-medium rounded-lg text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-red-700 mb-2">Delete Conversation</h3>
            <p className="text-xs text-gray-600 mb-1">
              This will <strong>permanently delete</strong> this conversation, all messages, and the entire linked history chain.
            </p>
            <p className="text-[11px] text-red-500 mb-4">This action cannot be undone.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, Delete Everything"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="w-full px-4 py-2 text-sm font-medium rounded-lg text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
