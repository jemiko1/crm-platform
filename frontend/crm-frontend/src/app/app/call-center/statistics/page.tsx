"use client";

import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
import {
  fetchOverviewKpis,
  fetchOverviewExtended,
  fetchBreakdown,
  fetchAgentBreakdown,
} from "../api";
import type {
  OverviewKpis,
  OverviewExtended,
  BreakdownRow,
  AgentBreakdownRow,
} from "../types";
import SubTabNav, { type SubTab } from "./_components/SubTabNav";
import StatisticsFilters from "./_components/StatisticsFilters";
import OverviewTab from "./_components/OverviewTab";
import BreakdownTab from "./_components/BreakdownTab";
import AgentsTab from "./_components/AgentsTab";

const SPINNER = (
  <div className="flex min-h-[400px] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[rgb(8,117,56)]" />
  </div>
);

export default function StatisticsPage() {
  const today = new Date();
  const [from, setFrom] = useState(format(subDays(today, 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [queueId, setQueueId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [activeTab, setActiveTab] = useState<SubTab>("overview");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<OverviewKpis | null>(null);
  const [extended, setExtended] = useState<OverviewExtended | null>(null);
  const [agents, setAgents] = useState<AgentBreakdownRow[]>([]);
  const [breakdownRows, setBreakdownRows] = useState<BreakdownRow[]>([]);

  const [trigger, setTrigger] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const dateParams = {
      from: new Date(from).toISOString(),
      to: new Date(to + "T23:59:59").toISOString(),
    };
    const q = queueId || undefined;

    try {
      if (activeTab === "overview") {
        const [kpiRes, extRes, agentRes] = await Promise.all([
          fetchOverviewKpis({ ...dateParams, queueId: q }),
          fetchOverviewExtended({ ...dateParams, queueId: q }),
          fetchAgentBreakdown({ ...dateParams, queueId: q }),
        ]);
        const raw = kpiRes as unknown as Record<string, unknown>;
        setKpis((raw?.current as OverviewKpis) ?? kpiRes ?? null);
        setExtended(extRes);
        const agentArr = Array.isArray(agentRes) ? agentRes : [];
        setAgents(agentArr);
      } else if (activeTab === "agents") {
        const agentRes = await fetchAgentBreakdown({ ...dateParams, queueId: q });
        const agentArr = Array.isArray(agentRes) ? agentRes : [];
        setAgents(agentArr);
      } else {
        const groupBy = activeTab === "hourly" ? "hour" : activeTab === "daily" ? "day" : "weekday";
        const res = await fetchBreakdown({
          ...dateParams,
          groupBy,
          queueId: q,
          agentId: agentId || undefined,
        });
        setBreakdownRows(res?.rows ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load statistics");
    } finally {
      setLoading(false);
    }
  }, [from, to, queueId, agentId, activeTab, trigger]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = () => setTrigger((t) => t + 1);

  const groupByLabel =
    activeTab === "hourly" ? "Hour" : activeTab === "daily" ? "Day" : "Weekday";

  return (
    <div className="space-y-5">
      <StatisticsFilters
        from={from}
        to={to}
        queueId={queueId}
        agentId={agentId}
        onFromChange={setFrom}
        onToChange={setTo}
        onQueueIdChange={setQueueId}
        onAgentIdChange={setAgentId}
        onSubmit={handleSubmit}
      />
      <SubTabNav active={activeTab} onChange={setActiveTab} />

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        SPINNER
      ) : activeTab === "overview" ? (
        <OverviewTab kpis={kpis} extended={extended} agents={agents} />
      ) : activeTab === "agents" ? (
        <AgentsTab data={agents} />
      ) : (
        <BreakdownTab data={breakdownRows} groupByLabel={groupByLabel} />
      )}
    </div>
  );
}
