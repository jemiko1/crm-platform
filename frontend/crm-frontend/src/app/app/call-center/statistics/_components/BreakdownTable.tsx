"use client";

import { useMemo, useState } from "react";
import type { BreakdownRow } from "../../types";
import ExportButtons from "./ExportButtons";

interface BreakdownTableProps {
  data: BreakdownRow[];
  groupByLabel: string;
}

type SortField = keyof BreakdownRow;
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortField; header: string; align?: "right"; color?: (v: number | null) => string }[] = [
  { key: "label", header: "" },
  { key: "totalCalls", header: "Total Calls", align: "right" },
  { key: "answeredCalls", header: "Answered", align: "right", color: () => "text-teal-900" },
  { key: "lostCalls", header: "Lost", align: "right", color: () => "text-red-600" },
  { key: "callsLostBefore5Sec", header: "Lost < 5s", align: "right", color: (v) => (v && v > 0 ? "text-teal-800" : "") },
  { key: "totalCallsDurationMin", header: "Total Duration", align: "right" },
  { key: "avgCallDurationSec", header: "Avg Duration", align: "right" },
  { key: "answeredAvgHoldTimeSec", header: "Ans. Hold Time", align: "right" },
  { key: "lostAvgHoldTimeSec", header: "Lost Hold Time", align: "right" },
  { key: "slaPercent", header: "SLA %", align: "right", color: (v) => {
    if (v == null) return "";
    if (v >= 80) return "text-teal-900";
    if (v >= 60) return "text-amber-600";
    return "text-red-600";
  }},
];

function fmtVal(key: SortField, v: unknown): string {
  if (v == null) return "—";
  if (key === "label") return String(v);
  if (key === "totalCallsDurationMin" || key === "avgCallDurationSec" || key === "answeredAvgHoldTimeSec" || key === "lostAvgHoldTimeSec")
    return Number(v).toFixed(2);
  if (key === "slaPercent") return `${v}%`;
  return String(v);
}

export default function BreakdownTable({ data, groupByLabel }: BreakdownTableProps) {
  const [sortField, setSortField] = useState<SortField>("label");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const cols = useMemo(() => {
    const c = [...COLUMNS];
    c[0] = { ...c[0], header: groupByLabel };
    return c;
  }, [groupByLabel]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((r) => r.label.toLowerCase().includes(q));
  }, [data, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir("asc"); }
  };

  const exportCols = cols.map((c) => ({ key: c.key, header: c.header }));
  const exportData = sorted as unknown as Record<string, unknown>[];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-zinc-100">
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-500">Show</label>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700">
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search..."
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)] w-48"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/80">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 cursor-pointer hover:text-zinc-700 select-none ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  {c.header}
                  {sortField === c.key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-zinc-400">No data</td></tr>
            ) : paged.map((row, i) => (
              <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                {cols.map((c) => {
                  const v = row[c.key];
                  const colorFn = c.color;
                  const color = colorFn ? colorFn(typeof v === "number" ? v : null) : "";
                  return (
                    <td key={c.key} className={`px-3 py-2.5 font-mono tabular-nums ${c.align === "right" ? "text-right" : ""} ${c.key === "label" ? "text-zinc-900 font-medium" : "text-zinc-600"} ${color}`}>
                      {fmtVal(c.key, v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between p-4 border-t border-zinc-100">
        <ExportButtons data={exportData} columns={exportCols} filename="breakdown" />
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Page {page}/{totalPages}</span>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-40">Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
