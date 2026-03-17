"use client";

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  borderColor: string;
}

export default function KpiCard({ label, value, subtitle, borderColor }: KpiCardProps) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-zinc-100 p-5 border-l-4 ${borderColor}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-zinc-900">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>}
    </div>
  );
}
