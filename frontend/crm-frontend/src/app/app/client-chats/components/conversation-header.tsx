"use client";

import { useState } from "react";
import { apiPatch, apiPost, apiGet } from "@/lib/api";
import type { ConversationDetail, ConversationStatus, AgentOption } from "../types";
import ChannelBadge from "./channel-badge";

interface ConversationHeaderProps {
  conversation: ConversationDetail;
  onUpdate: () => void;
}

const STATUS_OPTIONS: ConversationStatus[] = ["OPEN", "PENDING", "CLOSED", "SPAM"];

const statusStyles: Record<ConversationStatus, string> = {
  OPEN: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  CLOSED: "bg-gray-100 text-gray-600",
  SPAM: "bg-red-100 text-red-700",
};

export default function ConversationHeader({ conversation, onUpdate }: ConversationHeaderProps) {
  const [showAssign, setShowAssign] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<{ id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null }[]>([]);

  const clientName = conversation.client
    ? `${conversation.client.firstName ?? ""} ${conversation.client.lastName ?? ""}`.trim() || `Client #${conversation.client.coreId}`
    : null;

  async function handleStatusChange(status: ConversationStatus) {
    await apiPatch(`/v1/clientchats/conversations/${conversation.id}/status`, { status });
    onUpdate();
  }

  async function openAssignDropdown() {
    if (!showAssign) {
      try {
        const res = await apiGet<{ data: { userId: string; user: { id: string; email: string } }[] }>("/v1/employees?limit=100");
        setAgents(res.data.map((e) => ({ id: e.user?.id ?? e.userId, email: e.user?.email ?? "—" })));
      } catch {
        setAgents([]);
      }
    }
    setShowAssign(!showAssign);
  }

  async function handleAssign(userId: string | null) {
    await apiPatch(`/v1/clientchats/conversations/${conversation.id}/assign`, { userId });
    setShowAssign(false);
    onUpdate();
  }

  async function searchClients() {
    if (!linkSearch.trim()) return;
    try {
      const res = await apiGet<ClientSearchResult[]>(`/v1/clients?search=${encodeURIComponent(linkSearch)}`);
      setLinkResults(Array.isArray(res) ? res.slice(0, 10) : []);
    } catch {
      setLinkResults([]);
    }
  }

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <ChannelBadge channel={conversation.channelType} />
          <span className="text-sm font-medium text-gray-700">
            {clientName ?? conversation.externalConversationId.slice(0, 20)}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  conversation.status === s ? statusStyles[s] : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Assignment dropdown */}
          <div className="relative">
            <button
              onClick={openAssignDropdown}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
            >
              {conversation.assignedUser ? conversation.assignedUser.email : "Assign"}
            </button>
            {showAssign && (
              <div className="absolute right-0 top-full mt-1 w-60 bg-white rounded-xl shadow-lg border border-gray-200 z-20 max-h-60 overflow-y-auto">
                <button
                  onClick={() => handleAssign(null)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100"
                >
                  Unassign
                </button>
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleAssign(a.id)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-emerald-50"
                  >
                    {a.email}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Client link */}
          {conversation.client ? (
            <div className="flex items-center gap-1">
              <a
                href={`/app/clients/${conversation.client.id}`}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                {clientName}
              </a>
              <button
                onClick={handleUnlink}
                className="px-1.5 py-1.5 text-xs text-red-500 hover:text-red-700"
                title="Unlink client"
              >
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
                  <div className="flex gap-1 mb-2">
                    <input
                      type="text"
                      placeholder="Search by name or phone..."
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchClients()}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                    <button onClick={searchClients} className="px-2 py-1 bg-emerald-500 text-white rounded-lg text-xs">
                      Go
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {linkResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleLink(c.id)}
                        className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-emerald-50 rounded"
                      >
                        {`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "—"} · {c.primaryPhone ?? "—"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ClientSearchResult = { id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null };
