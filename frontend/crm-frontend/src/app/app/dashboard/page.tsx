"use client";

import { usePermissions } from "@/lib/use-permissions";

export default function DashboardPage() {
    const { hasPermission } = usePermissions();
    return (
      <div className="space-y-6">
        {/* Hero header (matches login style) */}
        <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/85 backdrop-blur-xl shadow-[0_30px_70px_-22px_rgba(0,0,0,0.35)]">
          {/* Abstract background */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-200 via-emerald-100 to-slate-200" />
          <div className="absolute inset-0 bg-slate-900/10" />
          <div className="absolute -top-20 -left-16 h-56 w-56 rounded-full bg-emerald-600/25 blur-3xl" />
          <div className="absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-slate-700/20 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.18] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.22)_1px,transparent_0)] bg-[length:22px_22px]" />
  
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-1 text-xs text-zinc-700">
                  <span className="h-2 w-2 rounded-full bg-[rgb(8,117,56)]" />
                  HOA Operations Dashboard
                </div>
  
                <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-zinc-900">
                  Dashboard
                </h1>
                <p className="mt-2 text-sm text-zinc-700/80 max-w-2xl">
                  Today’s snapshot of work orders, buildings, assets, and inventory
                  signals — designed for quick decisions.
                </p>
              </div>
  
              <div className="flex gap-2">
                <button className="rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm hover:bg-white">
                  Export
                </button>
                <button className="rounded-2xl bg-[rgb(8,117,56)] text-white px-4 py-2 text-sm font-medium shadow hover:opacity-95">
                  New Work Order
                </button>
              </div>
            </div>
  
            {/* Quick KPIs */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <KpiCard
                title="Active Work Orders"
                value="9"
                hint="2 overdue"
                accent
              />
              <KpiCard title="Open Tickets" value="14" hint="+3 today" />
              <KpiCard title="Buildings Managed" value="18" hint="4 high priority" />
              <KpiCard title="Inventory Alerts" value="3" hint="restock needed" />
            </div>
          </div>
        </div>
  
        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Work orders status */}
          <Card title="Work order status" subtitle="Live operational flow">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatusPill label="NEW" value="3" />
              <StatusPill label="DISPATCHED" value="2" />
              <StatusPill label="IN_PROGRESS" value="3" />
              <StatusPill label="DONE" value="1" />
            </div>
  
            <div className="mt-4 h-40 rounded-2xl border border-zinc-200/70 bg-white shadow-sm flex items-center justify-center text-sm text-zinc-500">
              Chart placeholder (next step)
            </div>
  
            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
              <span>Last update: just now</span>
              <button className="text-[rgb(8,117,56)] hover:opacity-80">
                Open work orders
              </button>
            </div>
          </Card>
  
          {/* Today panel */}
          <Card title="Today" subtitle="What needs attention now">
            <div className="space-y-3">
              <MiniRow title="Dispatch calls" value="6" />
              <MiniRow title="Technician visits" value="4" />
              <MiniRow title="Overdue tasks" value="1" danger />
              <MiniRow title="Parts requested" value="2" />
            </div>
  
            <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white shadow-sm p-4">
              <div className="text-sm font-medium text-zinc-900">Quick actions</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {hasPermission('buildings.create') && (
                  <button className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50">
                    Add Building
                  </button>
                )}
                {hasPermission('assets.create') && (
                  <button className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50">
                    Add Asset
                  </button>
                )}
                {hasPermission('work_orders.create') && (
                  <button className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50">
                    Create WO
                  </button>
                )}
                {hasPermission('inventory.read') && (
                  <button className="rounded-2xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50">
                    Inventory Log
                  </button>
                )}
              </div>
            </div>
          </Card>
  
          {/* SLA / Alerts */}
          <Card title="Alerts & SLA" subtitle="Risks you should address">
            <div className="space-y-3">
              <AlertRow
                title="2 overdue work orders"
                meta="1 elevator • 1 barrier"
                tone="danger"
              />
              <AlertRow
                title="Inventory low"
                meta="Door lock cylinders"
                tone="warn"
              />
              <AlertRow
                title="Scheduled installs"
                meta="3 planned this week"
                tone="ok"
              />
            </div>
  
            <div className="mt-4 text-xs text-zinc-500">
              Tip: we’ll connect this to real data after UI approval.
            </div>
          </Card>
        </div>
  
        {/* Activity + Table style */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card title="Recent activity" subtitle="Latest updates across the system">
            <div className="divide-y divide-zinc-100">
              <ActivityItem
                title="Work order created"
                meta="WO-0097 • Elevator diagnostic • 10 minutes ago"
              />
              <ActivityItem
                title="Technician assigned"
                meta="WO-0096 • Assigned to Nika • 1 hour ago"
              />
              <ActivityItem
                title="Inventory updated"
                meta="CCTV parts • -3 units • today"
              />
            </div>
  
            <div className="mt-3 flex justify-end">
              <button className="text-sm text-zinc-600 hover:text-zinc-900">
                View all
              </button>
            </div>
          </Card>
  
          <Card title="Priority buildings" subtitle="Sites with active issues">
            <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
              <div className="grid grid-cols-12 px-4 py-3 text-xs font-medium text-zinc-500 bg-zinc-50">
                <div className="col-span-6">Building</div>
                <div className="col-span-3">Open WOs</div>
                <div className="col-span-3 text-right">Status</div>
              </div>
  
              <Row building="Saburtalo Block A" wos="3" status="High" />
              <Row building="Dighomi Complex" wos="2" status="Medium" />
              <Row building="Varketili Tower" wos="1" status="Low" />
            </div>
  
            <div className="mt-3 flex justify-end">
              <button className="text-sm text-[rgb(8,117,56)] hover:opacity-80">
                Open buildings
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }
  
  function Card(props: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/85 backdrop-blur-xl shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)]">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-zinc-900">
                {props.title}
              </div>
              {props.subtitle ? (
                <div className="mt-1 text-sm text-zinc-500">{props.subtitle}</div>
              ) : null}
            </div>
          </div>
  
          <div className="mt-4">{props.children}</div>
        </div>
      </div>
    );
  }
  
  function KpiCard(props: { title: string; value: string; hint: string; accent?: boolean }) {
    return (
      <div className="rounded-3xl border border-white/60 bg-white/75 backdrop-blur shadow-[0_18px_40px_-22px_rgba(0,0,0,0.35)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-zinc-600">{props.title}</div>
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              props.accent ? "bg-[rgb(8,117,56)]" : "bg-zinc-300"
            }`}
          />
        </div>
        <div className="mt-2 text-2xl font-semibold text-zinc-900">
          {props.value}
        </div>
        <div className="mt-2 text-xs text-zinc-600">{props.hint}</div>
      </div>
    );
  }
  
  function StatusPill(props: { label: string; value: string }) {
    return (
      <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm px-4 py-3">
        <div className="text-xs text-zinc-500">{props.label}</div>
        <div className="mt-1 text-lg font-semibold text-zinc-900">
          {props.value}
        </div>
      </div>
    );
  }
  
  function MiniRow(props: { title: string; value: string; danger?: boolean }) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200/70 bg-white shadow-sm px-4 py-3">
        <div className="text-sm text-zinc-700">{props.title}</div>
        <div
          className={`text-sm font-semibold ${
            props.danger ? "text-red-600" : "text-zinc-900"
          }`}
        >
          {props.value}
        </div>
      </div>
    );
  }
  
  function AlertRow(props: {
    title: string;
    meta: string;
    tone: "danger" | "warn" | "ok";
  }) {
    const tone =
      props.tone === "danger"
        ? "bg-red-50 border-red-200 text-red-700"
        : props.tone === "warn"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-emerald-50 border-emerald-200 text-emerald-800";
  
    return (
      <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
        <div className="text-sm font-medium">{props.title}</div>
        <div className="mt-1 text-xs opacity-80">{props.meta}</div>
      </div>
    );
  }
  
  function ActivityItem(props: { title: string; meta: string }) {
    return (
      <div className="py-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-zinc-900">{props.title}</div>
          <div className="text-xs text-zinc-500 mt-1">{props.meta}</div>
        </div>
        <button className="text-xs text-zinc-600 hover:text-zinc-900">
          Open
        </button>
      </div>
    );
  }
  
  function Row(props: { building: string; wos: string; status: string }) {
    const statusTone =
      props.status === "High"
        ? "text-red-600"
        : props.status === "Medium"
        ? "text-amber-700"
        : "text-emerald-700";
  
    return (
      <div className="grid grid-cols-12 px-4 py-3 text-sm border-t border-zinc-100">
        <div className="col-span-6 text-zinc-900">{props.building}</div>
        <div className="col-span-3 text-zinc-700">{props.wos}</div>
        <div className={`col-span-3 text-right font-medium ${statusTone}`}>
          {props.status}
        </div>
      </div>
    );
  }
  