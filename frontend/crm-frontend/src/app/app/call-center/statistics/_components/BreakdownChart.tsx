"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { BreakdownRow } from "../../types";

interface BreakdownChartProps {
  data: BreakdownRow[];
}

export default function BreakdownChart({ data }: BreakdownChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-zinc-400 py-12 text-center">No data for chart</p>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data} barGap={2} barCategoryGap="15%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
          <YAxis tick={{ fontSize: 12 }} stroke="#a1a1aa" />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e4e4e7",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          />
          <Legend />
          <Bar dataKey="totalCalls" name="Total Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="answeredCalls" name="Answered" fill="rgb(8,117,56)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="lostCalls" name="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
