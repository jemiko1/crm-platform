"use client";

const INPUT =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]";

interface StatisticsFiltersProps {
  from: string;
  to: string;
  queueId: string;
  agentId: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onQueueIdChange: (v: string) => void;
  onAgentIdChange: (v: string) => void;
  onSubmit: () => void;
}

export default function StatisticsFilters({
  from, to, queueId, agentId,
  onFromChange, onToChange, onQueueIdChange, onAgentIdChange, onSubmit,
}: StatisticsFiltersProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">From</label>
          <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">To</label>
          <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Queue</label>
          <input
            type="text"
            value={queueId}
            onChange={(e) => onQueueIdChange(e.target.value)}
            placeholder="All Queues"
            className={INPUT + " placeholder:text-zinc-400"}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Agent</label>
          <input
            type="text"
            value={agentId}
            onChange={(e) => onAgentIdChange(e.target.value)}
            placeholder="All Agents"
            className={INPUT + " placeholder:text-zinc-400"}
          />
        </div>
        <button
          onClick={onSubmit}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm cursor-pointer"
          style={{ backgroundColor: "rgb(8,117,56)" }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
