"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPut, apiDelete, apiGetList } from "@/lib/api";

interface Operator {
  id: string;
  email: string;
  name: string;
  openChats: number;
}

interface Employee {
  userId: string;
  firstName: string;
  lastName: string;
  user: { id: string; email: string } | null;
}

interface ScheduleUser {
  id: string;
  email: string;
  employee: { firstName: string; lastName: string } | null;
}

interface ScheduleEntry {
  id: string;
  dayOfWeek: number;
  userId: string;
  user: ScheduleUser;
}

type WeeklySchedule = Record<number, ScheduleEntry[]>;

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  open: boolean;
  onToggle: () => void;
}

interface EscalationConfig {
  firstResponseTimeoutMins: number;
  reassignAfterMins: number;
  notifyManagerOnEscalation: boolean;
}

export default function ManagerQueuePanel({ open, onToggle }: Props) {
  const [tab, setTab] = useState<"today" | "schedule" | "escalation">("today");
  const [operators, setOperators] = useState<Operator[]>([]);
  const [hasOverride, setHasOverride] = useState(false);
  const [schedule, setSchedule] = useState<WeeklySchedule>({});
  const [employees, setEmployees] = useState<{ id: string; email: string; name: string }[]>([]);
  const [escalationConfig, setEscalationConfig] = useState<EscalationConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await apiGetList<Employee>("/v1/employees?limit=200");
      setEmployees(
        res
          .filter((e) => e.user?.id)
          .map((e) => ({
            id: e.user!.id,
            email: e.user!.email,
            name: `${e.firstName} ${e.lastName}`.trim(),
          })),
      );
    } catch {
      setEmployees([]);
    }
  }, []);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ operators: Operator[]; override: { date: string; userIds: string[] } | null }>(
        "/v1/clientchats/queue/today",
      );
      setOperators(res.operators);
      setHasOverride(!!res.override);
    } catch {
      setOperators([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<WeeklySchedule>("/v1/clientchats/queue/schedule");
      setSchedule(res);
    } catch {
      setSchedule({});
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEscalationConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<EscalationConfig>("/v1/clientchats/queue/escalation-config");
      setEscalationConfig(res);
    } catch {
      setEscalationConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchEmployees();
    if (tab === "today") fetchToday();
    else if (tab === "schedule") fetchSchedule();
    else fetchEscalationConfig();
  }, [open, tab, fetchEmployees, fetchToday, fetchSchedule, fetchEscalationConfig]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const handleOverrideAdd = async (userId: string) => {
    setSaving(true);
    const currentIds = operators.map((o) => o.id);
    if (currentIds.includes(userId)) { setSaving(false); return; }
    try {
      await apiPut("/v1/clientchats/queue/override", {
        date: todayStr,
        userIds: [...currentIds, userId],
      });
      await fetchToday();
    } finally {
      setSaving(false);
    }
  };

  const handleOverrideRemove = async (userId: string) => {
    setSaving(true);
    const newIds = operators.map((o) => o.id).filter((id) => id !== userId);
    try {
      if (newIds.length === 0) {
        await apiDelete(`/v1/clientchats/queue/override/${todayStr}`);
      } else {
        await apiPut("/v1/clientchats/queue/override", {
          date: todayStr,
          userIds: newIds,
        });
      }
      await fetchToday();
    } finally {
      setSaving(false);
    }
  };

  const handleDayToggle = async (day: number, userId: string, checked: boolean) => {
    setSaving(true);
    const current = (schedule[day] ?? []).map((s) => s.userId);
    const next = checked
      ? [...current, userId]
      : current.filter((id) => id !== userId);
    try {
      await apiPut(`/v1/clientchats/queue/schedule/${day}`, { userIds: next });
      await fetchSchedule();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEscalation = async (cfg: EscalationConfig) => {
    setSaving(true);
    try {
      const res = await apiPut<EscalationConfig>("/v1/clientchats/queue/escalation-config", cfg);
      setEscalationConfig(res);
    } finally {
      setSaving(false);
    }
  };

  const availableToAdd = employees.filter(
    (e) => !operators.some((o) => o.id === e.id),
  );

  if (!open) {
    return (
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Queue Management</span>
            {operators.length > 0 && (
              <span className="text-xs text-gray-400">
                ({operators.length} active today)
              </span>
            )}
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["today", "schedule", "escalation"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              tab === t
                ? "bg-emerald-100 text-emerald-700 font-medium"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t === "today" ? "Today\u2019s Queue" : t === "schedule" ? "Weekly Schedule" : "Escalation"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading...</div>
      ) : tab === "today" ? (
        <TodayTab
          operators={operators}
          hasOverride={hasOverride}
          availableToAdd={availableToAdd}
          saving={saving}
          onAdd={handleOverrideAdd}
          onRemove={handleOverrideRemove}
        />
      ) : tab === "schedule" ? (
        <ScheduleTab
          schedule={schedule}
          employees={employees}
          saving={saving}
          onToggle={handleDayToggle}
        />
      ) : (
        <EscalationTab
          config={escalationConfig}
          saving={saving}
          onSave={handleSaveEscalation}
        />
      )}
    </div>
  );
}

function TodayTab({
  operators,
  hasOverride,
  availableToAdd,
  saving,
  onAdd,
  onRemove,
}: {
  operators: Operator[];
  hasOverride: boolean;
  availableToAdd: { id: string; email: string; name: string }[];
  saving: boolean;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      {hasOverride && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2">
          Daily override active
        </div>
      )}

      {operators.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No operators scheduled today</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {operators.map((op) => (
            <div
              key={op.id}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium text-gray-700">{op.name}</span>
                <span className="text-xs text-gray-400 ml-2">{op.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                  {op.openChats} open
                </span>
                <button
                  onClick={() => onRemove(op.id)}
                  disabled={saving}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                  title="Remove from today"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="border border-gray-200 rounded-lg p-2 space-y-1 max-h-32 overflow-y-auto">
          {availableToAdd.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-1">All employees already in queue</p>
          ) : (
            availableToAdd.map((e) => (
              <button
                key={e.id}
                onClick={() => { onAdd(e.id); setShowAdd(false); }}
                disabled={saving}
                className="w-full text-left px-2 py-1 text-sm hover:bg-emerald-50 rounded disabled:opacity-50"
              >
                {e.name} <span className="text-xs text-gray-400">{e.email}</span>
              </button>
            ))
          )}
          <button
            onClick={() => setShowAdd(false)}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 pt-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
        >
          + Add operator to today
        </button>
      )}
    </div>
  );
}

function ScheduleTab({
  schedule,
  employees,
  saving,
  onToggle,
}: {
  schedule: WeeklySchedule;
  employees: { id: string; email: string; name: string }[];
  saving: boolean;
  onToggle: (day: number, userId: string, checked: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left py-1 pr-2 text-gray-500 font-medium sticky left-0 bg-white/80">
              Agent
            </th>
            {DAY_LABELS.map((label, i) => (
              <th key={i} className="text-center py-1 px-1 text-gray-500 font-medium min-w-[40px]">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id} className="border-t border-gray-100">
              <td className="py-1.5 pr-2 text-gray-700 whitespace-nowrap sticky left-0 bg-white/80">
                {emp.name}
              </td>
              {DAY_LABELS.map((_, i) => {
                const day = i + 1;
                const isScheduled = (schedule[day] ?? []).some(
                  (s) => s.userId === emp.id,
                );
                return (
                  <td key={day} className="text-center py-1.5 px-1">
                    <input
                      type="checkbox"
                      checked={isScheduled}
                      disabled={saving}
                      onChange={(e) => onToggle(day, emp.id, e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
          {employees.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center py-4 text-gray-400">
                No employees found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EscalationTab({
  config,
  saving,
  onSave,
}: {
  config: EscalationConfig | null;
  saving: boolean;
  onSave: (cfg: EscalationConfig) => void;
}) {
  const [timeout, setTimeout_] = useState(config?.firstResponseTimeoutMins ?? 5);
  const [reassign, setReassign] = useState(config?.reassignAfterMins ?? 10);
  const [notifyMgr, setNotifyMgr] = useState(config?.notifyManagerOnEscalation ?? true);

  useEffect(() => {
    if (config) {
      setTimeout_(config.firstResponseTimeoutMins);
      setReassign(config.reassignAfterMins);
      setNotifyMgr(config.notifyManagerOnEscalation);
    }
  }, [config]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          First response timeout (minutes)
        </label>
        <input
          type="number"
          min={1}
          max={120}
          value={timeout}
          onChange={(e) => setTimeout_(Number(e.target.value))}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
        />
        <p className="text-[10px] text-gray-400 mt-0.5">
          Warning sent to managers after this many minutes without agent reply
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Auto-reassign after (minutes)
        </label>
        <input
          type="number"
          min={1}
          max={240}
          value={reassign}
          onChange={(e) => setReassign(Number(e.target.value))}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
        />
        <p className="text-[10px] text-gray-400 mt-0.5">
          Conversation silently reassigned to next available operator
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={notifyMgr}
          onChange={(e) => setNotifyMgr(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        Notify managers on escalation
      </label>
      <button
        onClick={() =>
          onSave({
            firstResponseTimeoutMins: timeout,
            reassignAfterMins: reassign,
            notifyManagerOnEscalation: notifyMgr,
          })
        }
        disabled={saving}
        className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Escalation Settings"}
      </button>
    </div>
  );
}
