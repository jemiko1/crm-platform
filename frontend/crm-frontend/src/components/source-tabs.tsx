"use client";

const BRAND = "rgb(0, 86, 83)";

type SourceTabsProps = {
  active: "core" | "crm";
  onSwitch: (tab: "core" | "crm") => void;
  coreLabel: string;
  crmLabel: string;
};

export default function SourceTabs({ active, onSwitch, coreLabel, crmLabel }: SourceTabsProps) {
  return (
    <div className="mb-4 flex items-center gap-1 rounded-xl bg-zinc-100 p-1 md:mb-6 md:gap-1.5 md:rounded-2xl md:p-1.5 w-fit">
      <button
        type="button"
        onClick={() => onSwitch("core")}
        className={[
          "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all md:rounded-xl md:px-4 md:py-2 md:text-sm",
          active === "core"
            ? "text-white shadow-sm"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60",
        ].join(" ")}
        style={active === "core" ? { backgroundColor: BRAND } : undefined}
      >
        {coreLabel}
      </button>
      <button
        type="button"
        onClick={() => onSwitch("crm")}
        className={[
          "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all md:rounded-xl md:px-4 md:py-2 md:text-sm",
          active === "crm"
            ? "text-white shadow-sm"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60",
        ].join(" ")}
        style={active === "crm" ? { backgroundColor: BRAND } : undefined}
      >
        {crmLabel}
      </button>
    </div>
  );
}
