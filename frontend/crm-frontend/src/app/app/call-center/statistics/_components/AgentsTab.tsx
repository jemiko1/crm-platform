"use client";

import type { AgentBreakdownRow } from "../../types";
import AgentChart from "./AgentChart";
import AgentTable from "./AgentTable";

interface AgentsTabProps {
  data: AgentBreakdownRow[];
}

export default function AgentsTab({ data }: AgentsTabProps) {
  return (
    <div className="space-y-6">
      <AgentChart data={data} layout="vertical" />
      <AgentTable data={data} />
    </div>
  );
}
