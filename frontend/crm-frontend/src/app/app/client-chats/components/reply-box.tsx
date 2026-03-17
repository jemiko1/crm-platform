"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { ChannelType } from "../types";

interface CannedResponse {
  id: string;
  title: string;
  content: string;
  category: string | null;
  channelType: string | null;
  isGlobal: boolean;
}

interface ReplyBoxProps {
  conversationId: string;
  channelType?: ChannelType;
  clientName?: string;
  onSent: () => void;
}

export default function ReplyBox({ conversationId, channelType, clientName, onSent }: ReplyBoxProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showSlash, setShowSlash] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [slashFilter, setSlashFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchResponses = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (channelType) params.set("channelType", channelType);
      const data = await apiGet<CannedResponse[]>(`/v1/clientchats/canned-responses?${params}`);
      setResponses(data);
    } catch {
      setResponses([]);
    }
  }, [channelType]);

  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  function insertResponse(resp: CannedResponse) {
    let content = resp.content;
    if (clientName) {
      content = content.replace(/\{clientName\}/g, clientName);
    } else {
      content = content.replace(/\{clientName\}/g, "").replace(/\s{2,}/g, " ").trim();
    }
    setText(content);
    setShowSlash(false);
    setShowPicker(false);
    setSlashFilter("");
    textareaRef.current?.focus();
  }

  const filtered = responses.filter((r) => {
    if (!slashFilter) return true;
    const term = slashFilter.toLowerCase();
    return (
      r.title.toLowerCase().includes(term) ||
      r.content.toLowerCase().includes(term)
    );
  });

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);

    if (val.startsWith("/")) {
      setShowSlash(true);
      setSlashFilter(val.slice(1));
      setSelectedIdx(0);
    } else {
      setShowSlash(false);
      setSlashFilter("");
    }
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!ALLOWED_TYPES.includes(selected.type)) {
      alert('File type not allowed. Use JPEG, PNG, WebP, GIF, or PDF.');
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      alert('File too large. Maximum 10 MB.');
      return;
    }

    setFile(selected);
    setFilePreview(selected.type.startsWith('image/') ? URL.createObjectURL(selected) : null);
  }

  function clearFile() {
    setFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    if ((!text.trim() && !file) || sending) return;
    setSending(true);
    try {
      if (file) {
        const formData = new FormData();
        if (text.trim()) formData.append('text', text.trim());
        formData.append('file', file);

        const res = await fetch(`/v1/clientchats/conversations/${conversationId}/reply`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Send failed');
      } else {
        await apiPost(`/v1/clientchats/conversations/${conversationId}/reply`, {
          text: text.trim(),
        });
      }
      setText('');
      clearFile();
      onSent();
    } catch {
      // keep text for retry
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showSlash && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => (prev - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertResponse(filtered[selectedIdx]);
        return;
      }
    }

    if (e.key === "Escape") {
      setShowSlash(false);
      setShowPicker(false);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSlash(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const grouped = responses.reduce<Record<string, CannedResponse[]>>((acc, r) => {
    const cat = r.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  return (
    <div className="border-t border-gray-200 p-3 bg-white/60 relative">
      {showSlash && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-3 right-3 mb-1 max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg z-50"
        >
          {filtered.map((r, i) => (
            <button
              key={r.id}
              onClick={() => insertResponse(r)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition ${
                i === selectedIdx ? "bg-emerald-50" : ""
              }`}
            >
              <span className="font-medium text-zinc-900">{r.title}</span>
              {r.category && (
                <span className="ml-2 text-xs text-zinc-400">{r.category}</span>
              )}
              <p className="text-xs text-zinc-500 truncate mt-0.5">{r.content}</p>
            </button>
          ))}
        </div>
      )}

      {showPicker && (
        <div className="absolute bottom-full left-3 right-3 mb-1 max-h-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg z-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-zinc-800">Quick Replies</span>
            <button
              onClick={() => setShowPicker(false)}
              className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
            >
              &times;
            </button>
          </div>
          {Object.keys(grouped).length === 0 ? (
            <p className="text-xs text-zinc-400 py-4 text-center">No canned responses yet</p>
          ) : (
            Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="mb-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">{cat}</p>
                {items.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => insertResponse(r)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-sm hover:bg-emerald-50 transition"
                  >
                    <span className="font-medium text-zinc-800">{r.title}</span>
                    <p className="text-xs text-zinc-500 truncate">{r.content}</p>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          {filePreview ? (
            <img src={filePreview} alt="" className="h-10 w-10 rounded object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-200 text-xs text-zinc-500">PDF</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-700 truncate">{file.name}</p>
            <p className="text-xs text-zinc-400">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button onClick={clearFile} className="text-zinc-400 hover:text-red-500 text-lg">&times;</button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder='Type a reply... (start with "/" for quick replies)'
          rows={2}
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white/80"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          className="p-2 rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-emerald-600 transition"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <button
          onClick={() => { setShowPicker(!showPicker); setShowSlash(false); }}
          title="Quick replies"
          className="p-2 rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-emerald-600 transition"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </button>
        <button
          onClick={handleSend}
          disabled={(!text.trim() && !file) || sending}
          className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 transition-colors"
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
