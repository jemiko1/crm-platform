"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost } from "@/lib/api";
import type { Employee } from "./types";

interface CreateGroupDialogProps {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export default function CreateGroupDialog({ onClose, onCreated }: CreateGroupDialogProps) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const results = await apiGet<Employee[]>(
          `/v1/messenger/search/employees?q=${encodeURIComponent(search)}`,
        );
        setSearchResults(results.filter((e) => !selectedEmployees.some((s) => s.id === e.id)));
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, selectedEmployees]);

  const handleAddEmployee = (emp: Employee) => {
    setSelectedEmployees((prev) => [...prev, emp]);
    setSearch("");
    setSearchResults([]);
  };

  const handleRemoveEmployee = (id: string) => {
    setSelectedEmployees((prev) => prev.filter((e) => e.id !== id));
  };

  const handleCreate = useCallback(async () => {
    if (!name.trim() || selectedEmployees.length === 0) return;
    setCreating(true);
    try {
      const conv = await apiPost<{ id: string }>("/v1/messenger/conversations", {
        type: "GROUP",
        name: name.trim(),
        participantIds: selectedEmployees.map((e) => e.id),
      });
      onCreated(conv.id);
    } catch {
      // handle error
    } finally {
      setCreating(false);
    }
  }, [name, selectedEmployees, onCreated]);

  return createPortal(
    <div className="fixed inset-0 z-[65000] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">Create Group</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Group name */}
          <div>
            <label className="text-xs font-medium text-zinc-600 block mb-1.5">Group Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter group name..."
              className="w-full px-3 py-2 text-sm bg-zinc-100/80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-zinc-400"
            />
          </div>

          {/* Search members */}
          <div>
            <label className="text-xs font-medium text-zinc-600 block mb-1.5">
              Add Members ({selectedEmployees.length} selected)
            </label>

            {/* Selected chips */}
            {selectedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedEmployees.map((emp) => (
                  <div
                    key={emp.id}
                    className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs"
                  >
                    <span>{emp.firstName} {emp.lastName}</span>
                    <button onClick={() => handleRemoveEmployee(emp.id)} className="hover:text-red-500">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="w-full px-3 py-2 text-sm bg-zinc-100/80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-zinc-400"
            />

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-[200px] overflow-y-auto border border-zinc-100 rounded-xl">
                {searchResults.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => handleAddEmployee(emp)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 text-left transition-colors"
                  >
                    {emp.avatar ? (
                      <img src={emp.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[10px] font-semibold">
                        {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-800">{emp.firstName} {emp.lastName}</div>
                      <div className="text-[10px] text-zinc-500">{emp.position?.name ?? emp.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || selectedEmployees.length === 0 || creating}
            className="px-4 py-2 text-sm bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-zinc-200 disabled:text-zinc-400 rounded-xl transition-colors font-medium"
          >
            {creating ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
