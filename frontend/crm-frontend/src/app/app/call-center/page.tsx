"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import { format, subDays } from "date-fns";

type VolumeStats = {
  totalCalls: number;
  answered: number;
  missed: number;
  abandoned: number;
  callbacksCreated: number;
  callbacksCompleted: number;
};

type SpeedStats = {
  avgAnswerTimeSec: number | null;
  medianAnswerTimeSec: number | null;
  p90AnswerTimeSec: number | null;
  avgAbandonWaitSec: number | null;
};

type QualityStats = {
  avgTalkTimeSec: number | null;
  avgHoldTimeSec: number | null;
  avgWrapupTimeSec: number | null;
  transferRate: number | null;
};

type ServiceLevelStats = {
  slaMetPercent: number | null;
  longestWaitSec: number | null;
  peakHourDistribution: Record<string, unknown>;
};

type TelephonyOverview = {
  current: {
    volume: VolumeStats;
    speed: SpeedStats;
    quality: QualityStats;
    serviceLevel: ServiceLevelStats;
  };
};

function formatSeconds(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatPercent(val: number | null | undefined): string {
  if (val == null || Number.isNaN(val)) return "—";
  return `${Number(val).toFixed(1)}%`;
}

const TABS = [
  { label: "Dashboard", href: "/app/call-center" },
  { label: "Calls", href: "/app/call-center/calls" },
  { label: "Live", href: "/app/call-center/live" },
  { label: "Quality", href: "/app/call-center/quality" },
  { label: "Agents", href: "/app/call-center/agents" },
];

export default function CallCenterPage() {
  const pathname = usePathname();
  const today = new Date();
  const defaultTo = format(today, "yyyy-MM-dd");
  const defaultFrom = format(subDays(today, 7), "yyyy-MM-dd");

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [data, setData] = useState<TelephonyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<TelephonyOverview>(
          `/v1/telephony/stats/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        );
        setData(res);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load call center stats");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [from, to]);

  const vol = data?.current?.volume ?? null;
  const speed = data?.current?.speed ?? null;
  const quality = data?.current?.quality ?? null;
  const sl = data?.current?.serviceLevel ?? null;

  const answerRate =
    vol && vol.totalCalls > 0
      ? ((vol.answered / vol.totalCalls) * 100).toFixed(1)
      : null;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[rgb(8,117,56)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Call Center</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Telephony overview and performance metrics
          </p>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="from" className="text-sm text-zinc-500">
              From
            </label>
            <input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="to" className="text-sm text-zinc-500">
              To
            </label>
            <input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
            />
          </div>
        </div>
      </div>

      {/* Sub-nav tabs */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg -mb-px ${
                isActive
                  ? "border-b-2 border-[rgb(8,117,56)] text-[rgb(8,117,56)] bg-white"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Hero KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <div className="text-sm text-zinc-500">Total Calls</div>
          <div className="mt-1 text-3xl font-bold text-zinc-900">
            {vol?.totalCalls ?? 0}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <div className="text-sm text-zinc-500">Answered</div>
          <div className="mt-1 text-3xl font-bold text-zinc-900">
            {vol?.answered ?? 0}
          </div>
          {answerRate != null && (
            <div className="mt-1 text-sm text-zinc-500">
              Answer rate: {answerRate}%
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <div className="text-sm text-zinc-500">Missed</div>
          <div className="mt-1 text-3xl font-bold text-zinc-900">
            {vol?.missed ?? 0}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <div className="text-sm text-zinc-500">Abandoned</div>
          <div className="mt-1 text-3xl font-bold text-zinc-900">
            {vol?.abandoned ?? 0}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <div className="text-sm text-zinc-500">SLA Met %</div>
          <div className="mt-1 text-3xl font-bold text-zinc-900">
            {formatPercent(sl?.slaMetPercent)}
          </div>
        </div>
      </div>

      {/* Speed Metrics */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">
          Speed Metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-sm text-zinc-500">Avg Answer Time</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatSeconds(speed?.avgAnswerTimeSec)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Median Answer Time</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatSeconds(speed?.medianAnswerTimeSec)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">P90 Answer Time</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatSeconds(speed?.p90AnswerTimeSec)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Avg Abandon Wait</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatSeconds(speed?.avgAbandonWaitSec)}
            </div>
          </div>
        </div>
      </div>

      {/* Quality Metrics */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">
          Quality Metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-sm text-zinc-500">Avg Talk Time</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatSeconds(quality?.avgTalkTimeSec)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Avg Hold Time</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatSeconds(quality?.avgHoldTimeSec)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Avg Wrapup Time</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatSeconds(quality?.avgWrapupTimeSec)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Transfer Rate</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatPercent(quality?.transferRate != null ? quality.transferRate * 100 : null)}
            </div>
          </div>
        </div>
      </div>

      {/* Service Level */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">
          Service Level
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-sm text-zinc-500">SLA Met %</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatPercent(sl?.slaMetPercent)}
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Longest Wait</div>
            <div className="mt-1 text-xl font-semibold text-zinc-900">
              {formatSeconds(sl?.longestWaitSec)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
