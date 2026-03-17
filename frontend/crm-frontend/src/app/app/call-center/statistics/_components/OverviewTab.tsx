"use client";

import type { OverviewKpis, OverviewExtended, AgentBreakdownRow } from "../../types";
import KpiCard from "./KpiCard";
import HoldDistributionCard from "./HoldDistributionCard";
import AgentChart from "./AgentChart";
import AgentTable from "./AgentTable";

function fmtSec(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}s`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

interface OverviewTabProps {
  kpis: OverviewKpis | null;
  extended: OverviewExtended | null;
  agents: AgentBreakdownRow[];
}

export default function OverviewTab({ kpis, extended, agents }: OverviewTabProps) {
  const vol = kpis?.volume;
  const total = vol?.totalCalls ?? 0;
  const answered = vol?.answered ?? 0;
  const lost = total - answered;
  const answeredPct = total > 0 ? ((answered / total) * 100).toFixed(1) : "—";
  const lostPct = total > 0 ? ((lost / total) * 100).toFixed(1) : "—";

  const answeredAvgHold = kpis?.speed?.avgAnswerTimeSec;
  const lostAvgHold = kpis?.speed?.avgAbandonWaitSec;
  const sla = kpis?.serviceLevel?.slaMetPercent;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total Calls" value={String(total)} borderColor="border-l-blue-500" />
        <KpiCard label="Answered" value={String(answered)} subtitle={`${answeredPct}%`} borderColor="border-l-emerald-500" />
        <KpiCard label="Lost" value={String(lost)} subtitle={`${lostPct}%`} borderColor="border-l-red-500" />
        <KpiCard label="Avg Hold (Answered)" value={fmtSec(answeredAvgHold)} borderColor="border-l-amber-500" />
        <KpiCard label="Avg Hold (Lost)" value={fmtSec(lostAvgHold)} borderColor="border-l-orange-500" />
        <KpiCard label="SLA %" value={fmtPct(sla)} borderColor="border-l-violet-500" />
      </div>

      {extended && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HoldDistributionCard title="Answered Calls — Hold Times" dist={extended.holdDistribution.answered} />
          <HoldDistributionCard title="Lost Calls — Hold Times" dist={extended.holdDistribution.lost} />
        </div>
      )}

      {agents.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-800">Agent Statistics</h2>
          <AgentChart data={agents} />
          <AgentTable data={agents} />
        </div>
      )}
    </div>
  );
}
