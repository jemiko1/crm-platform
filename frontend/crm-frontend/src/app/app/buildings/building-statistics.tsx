"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

type MonthlyBreakdown = Record<number, Record<number, number>>;

type StatisticsData = {
  totalBuildingsCount?: number;
  currentMonthCount: number;
  currentMonthPercentageChange: number;
  averagePercentageChange: number;
  monthlyBreakdown: MonthlyBreakdown;
};

type StatBoxProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  changeValue?: number;
  onClick?: () => void;
  loading?: boolean;
  variant?: "primary" | "change" | "average" | "total";
  icon: React.ReactNode;
  clickHint?: string;
};

const BRAND = "rgb(8, 117, 56)";

function StatBox({
  title,
  value,
  subtitle,
  changeValue,
  onClick,
  loading,
  variant = "primary",
  icon,
  clickHint,
}: StatBoxProps) {
  const hasChange = changeValue !== undefined;
  const isPositive = hasChange && changeValue > 0;
  const isNegative = hasChange && changeValue < 0;
  const isNeutral = hasChange && changeValue === 0;
  const isClickable = !!onClick && !loading;

  const bottomBorderStyles = {
    primary: "border-b-4 border-emerald-500",
    change: "border-b-4 border-sky-500",
    average: "border-b-4 border-violet-500",
    total: "border-b-4 border-amber-500",
  };

  const iconContainerStyles = {
    primary: "bg-emerald-50/80 shadow-[0_2px_12px_rgba(5,150,105,0.15)]",
    change: "bg-sky-50/80 shadow-[0_2px_12px_rgba(14,165,233,0.15)]",
    average: "bg-violet-50/80 shadow-[0_2px_12px_rgba(139,92,246,0.15)]",
    total: "bg-amber-50/80 shadow-[0_2px_12px_rgba(245,158,11,0.15)]",
  };

  const iconColorStyles = {
    primary: "text-emerald-600",
    change: "text-sky-600",
    average: "text-violet-600",
    total: "text-amber-600",
  };

  const content = (
    <div className="flex flex-col gap-0.5 sm:gap-1">
      <div className="flex items-start justify-between gap-1 sm:gap-2">
        <div className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider text-zinc-500">{title}</div>
        <div
          className={[
            "shrink-0 w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center rounded-md",
            iconContainerStyles[variant],
            iconColorStyles[variant],
          ].join(" ")}
        >
          {icon}
        </div>
      </div>
      <div className="text-base sm:text-2xl font-bold tabular-nums text-zinc-900 leading-tight text-center">
        {loading ? "..." : value}
      </div>
      {subtitle && <div className="hidden sm:block text-[11px] text-zinc-500">{subtitle}</div>}
      {clickHint && isClickable && (
        <div className="hidden sm:inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-300/60 w-fit">
          <IconExternalLink />
          <span>{clickHint}</span>
        </div>
      )}
      {hasChange && !loading && (
        <div className="hidden sm:flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            {isPositive && (
              <>
                <IconArrowUp className="text-green-600 shrink-0" />
                <span className="font-semibold text-green-600">
                  +{changeValue!.toFixed(1)}%
                </span>
              </>
            )}
            {isNegative && (
              <>
                <IconArrowDown className="text-red-600 shrink-0" />
                <span className="font-semibold text-red-600">
                  {changeValue!.toFixed(1)}%
                </span>
              </>
            )}
            {isNeutral && (
              <span className="font-semibold text-zinc-500">No change</span>
            )}
          </div>
          <span className="text-zinc-400">
            {variant === "change" ? "Since last month" : "Vs monthly avg"}
          </span>
        </div>
      )}
    </div>
  );

  const baseClasses = [
    "relative rounded-xl bg-white p-2 sm:p-3 text-left",
    "transition-all duration-300 ease-out",
    "shadow-[0_6px_24px_rgba(0,0,0,0.1)]",
    bottomBorderStyles[variant],
    loading ? "opacity-60" : "",
  ];

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[
          ...baseClasses,
          "hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)] hover:-translate-y-2 cursor-pointer",
        ].join(" ")}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClasses.join(" ")}>{content}</div>;
}

type MonthlyBreakdownModalProps = {
  open: boolean;
  onClose: () => void;
  monthlyBreakdown: MonthlyBreakdown;
};

function MonthlyBreakdownModal({ open, onClose, monthlyBreakdown }: MonthlyBreakdownModalProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get available years from breakdown (guard against null/undefined)
  const breakdown = monthlyBreakdown && typeof monthlyBreakdown === "object" ? monthlyBreakdown : {};
  const availableYears = Object.keys(breakdown)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a); // Descending order

  if (!open || !mounted) return null;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const yearData = (breakdown[selectedYear] ?? {}) as Record<number, number>;

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal - centered to viewport */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">Monthly Building Statistics</h2>
              <p className="mt-1 text-sm text-zinc-600">View buildings added per month</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            >
              <IconClose />
            </button>
          </div>

          {/* Year Selector */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const currentIndex = availableYears.indexOf(selectedYear);
                if (currentIndex < availableYears.length - 1) {
                  setSelectedYear(availableYears[currentIndex + 1]);
                }
              }}
              disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1}
              className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ←
            </button>
            <div className="flex-1 text-center">
              <span className="text-2xl font-bold text-zinc-900 tabular-nums">{selectedYear}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const currentIndex = availableYears.indexOf(selectedYear);
                if (currentIndex > 0) {
                  setSelectedYear(availableYears[currentIndex - 1]);
                }
              }}
              disabled={availableYears.indexOf(selectedYear) === 0}
              className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              →
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)] px-6 py-4">
          {availableYears.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-600">
              No building data available yet
            </div>
          ) : (
            <div className="space-y-2">
              {monthNames.map((monthName, index) => {
                const monthNumber = index + 1;
                const count = yearData[monthNumber] ?? 0;
                const hasData = count > 0;

                return (
                  <div
                    key={monthName}
                    className={[
                      "flex items-center justify-between rounded-xl px-4 py-3",
                      hasData ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-zinc-50",
                    ].join(" ")}
                  >
                    <span className={[
                      "text-sm font-medium",
                      hasData ? "text-zinc-900" : "text-zinc-500"
                    ].join(" ")}>
                      {monthName}
                    </span>
                    <span className={[
                      "text-sm font-bold tabular-nums",
                      hasData ? "text-emerald-700" : "text-zinc-400"
                    ].join(" ")}>
                      {hasData ? count : "No statistics yet"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-zinc-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
            style={{ backgroundColor: BRAND }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

type BuildingStatisticsProps = {
  statistics: StatisticsData | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export default function BuildingStatistics({
  statistics,
  loading,
  error,
  onRetry,
}: BuildingStatisticsProps) {
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });
  const currentYear = new Date().getFullYear();

  if (error) {
    return (
      <div
        className="mb-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200"
        data-testid="building-statistics"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-amber-900">Statistics unavailable</div>
            <div className="mt-1 text-sm text-amber-700">{error}</div>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-6 sm:grid-cols-2 sm:gap-5 md:grid-cols-4" data-testid="building-statistics">
        {/* Total Buildings */}
        <StatBox
          title="Total Buildings"
          value={loading ? "..." : statistics?.totalBuildingsCount ?? 0}
          subtitle="All time"
          loading={loading}
          variant="total"
          icon={<IconBuildingStack />}
        />

        {/* Buildings Added This Month */}
        <StatBox
          title="Buildings Added This Month"
          value={loading ? "..." : statistics?.currentMonthCount ?? 0}
          subtitle={`${currentMonth} ${currentYear}`}
          onClick={() => setShowMonthlyModal(true)}
          loading={loading}
          variant="primary"
          icon={<IconBuilding />}
          clickHint="Open detailed statistics"
        />

        {/* Change Compared to Last Month */}
        <StatBox
          title="Change vs Last Month"
          value={
            loading
              ? "..."
              : statistics?.currentMonthPercentageChange === 0
              ? "No change"
              : `${statistics?.currentMonthPercentageChange && statistics.currentMonthPercentageChange > 0 ? "+" : ""}${statistics?.currentMonthPercentageChange?.toFixed(1) ?? 0}%`
          }
          changeValue={loading ? undefined : statistics?.currentMonthPercentageChange}
          loading={loading}
          variant="change"
          icon={<IconTrend />}
        />

        {/* Change Compared to Average */}
        <StatBox
          title="Change vs Average"
          value={
            loading
              ? "..."
              : statistics?.averagePercentageChange === 0
              ? "On average"
              : `${statistics?.averagePercentageChange && statistics.averagePercentageChange > 0 ? "+" : ""}${statistics?.averagePercentageChange?.toFixed(1) ?? 0}%`
          }
          changeValue={loading ? undefined : statistics?.averagePercentageChange}
          loading={loading}
          variant="average"
          icon={<IconChart />}
        />
      </div>

      {/* Monthly Breakdown Modal */}
      {statistics && (
        <MonthlyBreakdownModal
          open={showMonthlyModal}
          onClose={() => setShowMonthlyModal(false)}
          monthlyBreakdown={statistics.monthlyBreakdown}
        />
      )}
    </>
  );
}

/* --- Icons --- */
function IconBuildingStack() {
  return (
    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 21v-6h16v6M4 15V9l8-4 8 4v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4 9V3l8-2 8 2v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 17l6-6 4 4 8-12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 17H21V13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 3v18h18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 14l4-4 4 2 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconExternalLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 3h6v6M10 14L21 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrowUp({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 19V5M5 12l7-7 7 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrowDown({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 5v14M19 12l-7 7-7-7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
