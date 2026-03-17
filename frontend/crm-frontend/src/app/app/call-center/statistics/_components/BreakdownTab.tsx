"use client";

import type { BreakdownRow } from "../../types";
import BreakdownChart from "./BreakdownChart";
import BreakdownTable from "./BreakdownTable";

interface BreakdownTabProps {
  data: BreakdownRow[];
  groupByLabel: string;
}

export default function BreakdownTab({ data, groupByLabel }: BreakdownTabProps) {
  return (
    <div className="space-y-6">
      <BreakdownChart data={data} />
      <BreakdownTable data={data} groupByLabel={groupByLabel} />
    </div>
  );
}
