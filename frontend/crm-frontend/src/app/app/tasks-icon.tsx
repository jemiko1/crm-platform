"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiGetList, API_BASE } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type WorkOrderTask = {
  id: string;
  title: string;
  type: string;
  status: string;
  building: {
    name: string;
  };
  createdAt: string;
};

export default function TasksIcon() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);

  // Set mounted on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get current employee
  useEffect(() => {
    let cancelled = false;

    async function loadEmployee() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const userData = data?.user || data;

        if (!cancelled && userData.email) {
          // Fetch employee by email
          try {
            const employees = await apiGetList<any>(`/v1/employees?search=${userData.email}`);
            if (employees.length > 0) {
              setCurrentEmployee(employees[0]);
            }
          } catch {
            // Ignore
          }
        }
      } catch {
        // Ignore
      }
    }

    loadEmployee();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch task count
  useEffect(() => {
    if (!currentEmployee) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchTaskCount() {
      try {
        setLoading(true);
        // Get work orders assigned to this employee that are not completed/canceled
        const data = await apiGet<{ data: WorkOrderTask[] }>("/v1/work-orders/my-tasks");
        if (!cancelled) {
          const incompleteTasks = data.data.filter(
            (wo) => wo.status !== "COMPLETED" && wo.status !== "CANCELED",
          );
          setTaskCount(incompleteTasks.length);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch tasks:", err);
          setTaskCount(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTaskCount();

    const interval = setInterval(fetchTaskCount, 30000); // Refresh every 30 seconds

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentEmployee]);

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  // Show for all employees
  if (!currentEmployee) {
    return null;
  }

  return (
    <Link
      href="/app/tasks"
      className="relative flex items-center gap-2 rounded-2xl px-4 py-2.5 transition bg-white/70 hover:bg-white shadow-sm ring-1 ring-white/60"
      title="My Workspace"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-zinc-700"
      >
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
      <span className="text-sm font-semibold text-zinc-900 hidden sm:inline">My Workspace</span>

      {taskCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white">
          {taskCount > 99 ? "99+" : taskCount}
        </span>
      )}

      {loading && taskCount === 0 && (
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-zinc-400" />
      )}
    </Link>
  );
}
