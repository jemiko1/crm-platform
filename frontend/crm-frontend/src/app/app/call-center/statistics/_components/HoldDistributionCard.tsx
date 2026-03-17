"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { HoldTimeDistribution } from "../../types";

const COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444"];
const LABELS = ["< 15 sec", "< 30 sec", "< 60 sec", "> 60 sec"];
const BAR_COLORS = ["bg-green-500", "bg-yellow-500", "bg-orange-500", "bg-red-500"];

interface HoldDistributionCardProps {
  title: string;
  dist: HoldTimeDistribution;
}

export default function HoldDistributionCard({ title, dist }: HoldDistributionCardProps) {
  const buckets = [dist.under15, dist.under30, dist.under60, dist.over60];
  const segments = buckets.map((b, i) => ({ name: LABELS[i], value: b.count }));
  const hasData = buckets.some((b) => b.count > 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
      <h3 className="text-sm font-semibold text-zinc-700 mb-4">{title}</h3>
      {!hasData ? (
        <p className="text-sm text-zinc-400 py-8 text-center">No data</p>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-3">
            {buckets.map((b, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs text-zinc-600 mb-1">
                  <span>{LABELS[i]}</span>
                  <span className="font-mono tabular-nums">{b.percent}% — {b.count} Calls</span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${BAR_COLORS[i]}`}
                    style={{ width: `${b.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="w-full md:w-48 shrink-0">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={segments} innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {segments.map((_, i) => (
                    <Cell key={i} fill={COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
              {LABELS.map((l, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
