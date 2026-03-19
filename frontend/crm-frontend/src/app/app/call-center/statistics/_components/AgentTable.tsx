"use client";

import { useMemo, useState } from "react";
import type { AgentBreakdownRow } from "../../types";
import ExportButtons from "./ExportButtons";

interface AgentTableProps {
  data: AgentBreakdownRow[];
}

type SortField = "displayName" | "answeredCalls" | "noAnswerCalls" | "busyCalls" | "totalCallsDurationMin" | "avgCallDurationSec" | "answeredAvgRingTimeSec" | "noAnswerAvgRingTimeSec";
type SortDir = "asc" | "desc";

const COLS: { key: SortField; header: string; fmt: (v: unknown) => string; color?: (v: unknown) => string }[] = [
  { key: "displayName", header: "Agent", fmt: (v) => String(v ?? "—") },
  { key: "answeredCalls", header: "Answered", fmt: (v) => String(v ?? 0), color: () => "text-teal-900" },
  { key: "noAnswerCalls", header: "No Answer", fmt: (v) => String(v ?? 0), color: (v) => (Number(v) > 0 ? "text-red-600" : "") },
  { key: "busyCalls", header: "Busy", fmt: (v) => String(v ?? 0) },
  { key: "totalCallsDurationMin", header: "Total Duration", fmt: (v) => v != null ? `${Number(v).toFixed(1)} min` : "—" },
  { key: "avgCallDurationSec", header: "Avg Duration", fmt: (v) => v != null ? `${Number(v).toFixed(1)} sec` : "—" },
  { key: "answeredAvgRingTimeSec", header: "Ans. Ring Time", fmt: (v) => v != null ? `${Number(v).toFixed(1)} sec` : "—" },
  { key: "noAnswerAvgRingTimeSec", header: "No Ans. Ring", fmt: (v) => v != null ? `${Number(v).toFixed(1)} sec` : "—" },
];

export default function AgentTable({ data }: AgentTableProps) {
  const [sortField, setSortField] = useState<SortField>("answeredCalls");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((a) =>
      (a.displayName?.toLowerCase().includes(q)) || (a.extension?.toLowerCase().includes(q))
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir("desc"); }
  };

  const exportCols = COLS.map((c) => ({ key: c.key, header: c.header }));
  const exportData = sorted.map((a) => ({
    displayName: a.displayName ?? a.extension ?? a.userId,
    answeredCalls: a.answeredCalls,
    noAnswerCalls: a.noAnswerCalls,
    busyCalls: a.busyCalls,
    totalCallsDurationMin: a.totalCallsDurationMin,
    avgCallDurationSec: a.avgCallDurationSec,
    answeredAvgRingTimeSec: a.answeredAvgRingTimeSec,
    noAnswerAvgRingTimeSec: a.noAnswerAvgRingTimeSec,
  }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-zinc-100">
        <h3 className="text-sm font-semibold text-zinc-700">Agent Details</h3>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agent..."
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)] w-48"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/80">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 cursor-pointer hover:text-zinc-700 select-none ${c.key === "displayName" ? "text-left" : "text-right"}`}
                >
                  {c.header}
                  {sortField === c.key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={COLS.length} className="px-3 py-8 text-center text-zinc-400">No agent data</td></tr>
            ) : sorted.map((a) => (
              <tr key={a.userId} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                {COLS.map((c) => {
                  const raw = a[c.key as keyof AgentBreakdownRow];
                  const display = c.key === "displayName"
                    ? `${a.displayName ?? "Agent"} ${a.extension ? `(${a.extension})` : ""}`
                    : c.fmt(raw);
                  const color = c.color ? c.color(raw) : "";
                  return (
                    <td key={c.key} className={`px-3 py-2.5 font-mono tabular-nums ${c.key === "displayName" ? "text-left text-zinc-900 font-medium" : "text-right text-zinc-600"} ${color}`}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-zinc-100">
        <ExportButtons data={exportData as unknown as Record<string, unknown>[]} columns={exportCols} filename="agents" />
      </div>
    </div>
  );
}
