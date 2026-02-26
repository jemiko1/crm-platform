"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, ApiError } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

const BRAND = "rgb(8, 117, 56)";

type PlanProgress = {
  planId: string;
  planType: string;
  year: number;
  month: number | null;
  quarter: number | null;
  name: string | null;
  targetRevenue: number | null;
  achievedRevenue: number;
  revenueProgressPercent: number;
  targetLeadConversions: number | null;
  achievedLeadConversions: number;
  leadsProgressPercent: number;
  targets: Array<{
    serviceId: string;
    serviceName: string;
    serviceNameKa: string;
    targetQuantity: number;
    achievedQuantity: number;
    progressPercent: number;
    targetRevenue: number | null;
    achievedRevenue: number;
  }>;
};

type TeamDashboard = {
  period: {
    year: number;
    month: number;
    quarter: number;
  };
  teamTotals: {
    wonLeads: number;
    totalRevenue: number;
  };
  employeeProgress: Array<{
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      employeeId: string;
    };
    monthlyProgress: PlanProgress | null;
  }>;
};

type Statistics = {
  total: number;
  active: number;
  won: number;
  lost: number;
  conversionRate: string;
  byStage: Array<{
    stageId: string;
    stageName: string;
    stageNameKa: string;
    stageCode: string;
    color: string | null;
    count: number;
  }>;
};

function ProgressBar({ value, max, color = BRAND }: { value: number; max: number; color?: string }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-zinc-200">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ProgressCircle({ percent, color = BRAND, size = 100 }: { percent: number; color?: string; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, percent) / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-zinc-200"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-zinc-900">{Math.round(percent)}%</span>
      </div>
    </div>
  );
}

export default function SalesDashboardPage() {
  const [myProgress, setMyProgress] = useState<PlanProgress[]>([]);
  const [teamDashboard, setTeamDashboard] = useState<TeamDashboard | null>(null);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [progressRes, teamRes, statsRes] = await Promise.all([
          apiGet<PlanProgress[]>("/v1/sales/plans/my-progress"),
          apiGet<TeamDashboard>("/v1/sales/plans/team-dashboard").catch(() => null),
          apiGet<Statistics>("/v1/sales/leads/statistics"),
        ]);
        setMyProgress(progressRes);
        setTeamDashboard(teamRes);
        setStatistics(statsRes);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load dashboard");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const currentPlan = myProgress.find((p) => p.planType === "MONTHLY");

  return (
    <PermissionGuard permission="sales.menu">
      <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Sales Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Track your sales performance and team progress
        </p>
      </div>

      {/* Overview Stats */}
      {statistics && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-500">Active Leads</div>
                <div className="mt-1 text-3xl font-bold text-zinc-900">{statistics.active}</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-2xl">
                📋
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-500">Won This Period</div>
                <div className="mt-1 text-3xl font-bold text-emerald-600">{statistics.won}</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
                🏆
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-500">Lost</div>
                <div className="mt-1 text-3xl font-bold text-red-600">{statistics.lost}</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-2xl">
                ❌
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-500">Conversion Rate</div>
                <div className="mt-1 text-3xl font-bold text-zinc-900">{statistics.conversionRate}%</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-2xl">
                📈
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Funnel */}
      {statistics && statistics.byStage.length > 0 && (
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Pipeline Funnel</h2>
          <div className="flex items-end gap-4">
            {statistics.byStage
              .filter((s) => !["WON", "LOST"].includes(s.stageCode))
              .map((stage, idx) => {
                const maxCount = Math.max(...statistics.byStage.filter((s) => !["WON", "LOST"].includes(s.stageCode)).map((s) => s.count));
                const height = maxCount > 0 ? Math.max(40, (stage.count / maxCount) * 150) : 40;
                
                return (
                  <div key={stage.stageId} className="flex flex-1 flex-col items-center">
                    <div className="mb-2 text-sm font-semibold text-zinc-900">{stage.count}</div>
                    <div
                      className="w-full rounded-t-lg transition-all duration-500"
                      style={{
                        height,
                        backgroundColor: stage.color || "#6366f1",
                        opacity: 0.8 - idx * 0.1,
                      }}
                    />
                    <div className="mt-2 text-center">
                      <div className="text-xs font-medium text-zinc-700">{stage.stageName}</div>
                      <div className="text-xs text-zinc-500">{stage.stageNameKa}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* My Progress */}
      {currentPlan && (
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">My Monthly Progress</h2>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
              {currentPlan.year}/{currentPlan.month}
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Revenue Progress */}
            {currentPlan.targetRevenue && (
              <div className="flex flex-col items-center justify-center rounded-xl bg-emerald-50 p-6">
                <ProgressCircle percent={currentPlan.revenueProgressPercent} color="#10b981" />
                <div className="mt-4 text-center">
                  <div className="text-sm font-medium text-zinc-500">Revenue Target</div>
                  <div className="text-lg font-bold text-zinc-900">
                    {currentPlan.achievedRevenue.toFixed(0)} / {Number(currentPlan.targetRevenue).toFixed(0)} GEL
                  </div>
                </div>
              </div>
            )}

            {/* Leads Progress */}
            {currentPlan.targetLeadConversions && (
              <div className="flex flex-col items-center justify-center rounded-xl bg-blue-50 p-6">
                <ProgressCircle percent={currentPlan.leadsProgressPercent} color="#3b82f6" />
                <div className="mt-4 text-center">
                  <div className="text-sm font-medium text-zinc-500">Lead Conversions</div>
                  <div className="text-lg font-bold text-zinc-900">
                    {currentPlan.achievedLeadConversions} / {currentPlan.targetLeadConversions}
                  </div>
                </div>
              </div>
            )}

            {/* Service Targets */}
            <div className="rounded-xl border border-zinc-200 p-4">
              <h3 className="mb-4 text-sm font-semibold text-zinc-700">Service Targets</h3>
              <div className="space-y-4">
                {currentPlan.targets.slice(0, 5).map((target) => (
                  <div key={target.serviceId}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-zinc-700">{target.serviceName}</span>
                      <span className="font-medium text-zinc-900">
                        {target.achievedQuantity}/{target.targetQuantity}
                      </span>
                    </div>
                    <ProgressBar value={target.achievedQuantity} max={target.targetQuantity} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {myProgress.length === 0 && (
        <div className="mb-8 rounded-2xl bg-amber-50 p-6 text-center">
          <p className="text-amber-700">No active sales plan assigned. Contact your manager to set up your targets.</p>
        </div>
      )}

      {/* Team Leaderboard */}
      {teamDashboard && teamDashboard.employeeProgress.length > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Team Leaderboard</h2>
            <div className="text-sm text-zinc-500">
              Team Total: <span className="font-semibold text-emerald-600">{teamDashboard.teamTotals.totalRevenue.toFixed(0)} GEL</span>
              {" • "}
              <span className="font-semibold text-blue-600">{teamDashboard.teamTotals.wonLeads} Won</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-zinc-600">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-zinc-600">Employee</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-zinc-600">Revenue Progress</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-zinc-600">Leads Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {teamDashboard.employeeProgress
                  .filter((ep) => ep.monthlyProgress)
                  .sort((a, b) => (b.monthlyProgress?.revenueProgressPercent || 0) - (a.monthlyProgress?.revenueProgressPercent || 0))
                  .map((ep, idx) => (
                    <tr key={ep.employee.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                            idx === 0
                              ? "bg-amber-100 text-amber-700"
                              : idx === 1
                              ? "bg-zinc-200 text-zinc-700"
                              : idx === 2
                              ? "bg-amber-50 text-amber-600"
                              : "bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">
                          {ep.employee.firstName} {ep.employee.lastName}
                        </div>
                        <div className="text-xs text-zinc-500">{ep.employee.employeeId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-24">
                            <ProgressBar
                              value={ep.monthlyProgress?.achievedRevenue || 0}
                              max={Number(ep.monthlyProgress?.targetRevenue) || 1}
                              color="#10b981"
                            />
                          </div>
                          <span className="text-sm font-medium text-zinc-700">
                            {ep.monthlyProgress?.revenueProgressPercent || 0}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-24">
                            <ProgressBar
                              value={ep.monthlyProgress?.achievedLeadConversions || 0}
                              max={ep.monthlyProgress?.targetLeadConversions || 1}
                              color="#3b82f6"
                            />
                          </div>
                          <span className="text-sm font-medium text-zinc-700">
                            {ep.monthlyProgress?.leadsProgressPercent || 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/app/sales/leads"
          className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 transition hover:shadow-xl"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-2xl">
            📋
          </div>
          <div>
            <div className="font-semibold text-zinc-900">View Pipeline</div>
            <div className="text-sm text-zinc-500">Manage your leads</div>
          </div>
        </Link>
        <Link
          href="/app/sales/plans"
          className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 transition hover:shadow-xl"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-2xl">
            📊
          </div>
          <div>
            <div className="font-semibold text-zinc-900">Sales Plans</div>
            <div className="text-sm text-zinc-500">View and manage plans</div>
          </div>
        </Link>
        <Link
          href="/app/admin/services"
          className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200 transition hover:shadow-xl"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
            🛠️
          </div>
          <div>
            <div className="font-semibold text-zinc-900">Services Catalog</div>
            <div className="text-sm text-zinc-500">Manage sellable services</div>
          </div>
        </Link>
      </div>
    </div>
    </PermissionGuard>
  );
}
