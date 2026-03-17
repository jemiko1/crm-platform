"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { AgentBreakdownRow } from "../../types";

interface AgentChartProps {
  data: AgentBreakdownRow[];
  layout?: "vertical" | "horizontal";
}

export default function AgentChart({ data, layout = "horizontal" }: AgentChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-zinc-400 py-12 text-center">No agent data for chart</p>;
  }

  const chartData = data.slice(0, 15).map((a) => ({
    name: a.displayName || a.extension || a.userId.slice(0, 8),
    answered: a.answeredCalls,
  }));

  if (layout === "vertical") {
    const h = Math.max(300, chartData.length * 45);
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
        <h3 className="text-sm font-semibold text-zinc-700 mb-4">Answered Calls by Agent</h3>
        <ResponsiveContainer width="100%" height={h}>
          <BarChart data={chartData} layout="vertical" barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis type="number" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} stroke="#a1a1aa" />
            <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e4e4e7", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
            <Bar dataKey="answered" name="Answered" fill="rgb(8,117,56)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
      <h3 className="text-sm font-semibold text-zinc-700 mb-4">Answered Calls by Agent</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} barCategoryGap="15%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#a1a1aa" />
          <YAxis tick={{ fontSize: 12 }} stroke="#a1a1aa" />
          <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e4e4e7", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
          <Bar dataKey="answered" name="Answered" fill="rgb(8,117,56)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
