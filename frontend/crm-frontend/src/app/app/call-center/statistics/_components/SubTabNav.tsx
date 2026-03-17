"use client";

const SUB_TABS = [
  { key: "overview", label: "Overview" },
  { key: "hourly", label: "Hourly" },
  { key: "daily", label: "Daily" },
  { key: "weekday", label: "Weekday" },
  { key: "agents", label: "Agents" },
] as const;

export type SubTab = (typeof SUB_TABS)[number]["key"];

interface SubTabNavProps {
  active: SubTab;
  onChange: (tab: SubTab) => void;
}

export default function SubTabNav({ active, onChange }: SubTabNavProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-zinc-50 p-1">
      {SUB_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={[
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
            active === tab.key
              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
              : "text-zinc-500 hover:text-zinc-700 hover:bg-white/60",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
