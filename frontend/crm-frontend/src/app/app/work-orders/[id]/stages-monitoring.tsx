"use client";

import React, { useEffect, useState, useMemo } from "react";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";

type WorkOrderDetail = {
  id: string;
  workOrderNumber: number;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  assignments?: Array<{
    id: string;
    assignedAt: string;
  }>;
  techEmployeeComment: string | null;
};

type StageLog = {
  stage: number;
  stageName: string;
  startTime: Date;
  endTime: Date | null;
  duration: number | null; // in milliseconds
};

type Props = {
  workOrder: WorkOrderDetail | null;
};

function getCurrentStage(wo: WorkOrderDetail | null): number {
  if (!wo) return 1;
  
  if (wo.status === "COMPLETED" || wo.status === "CANCELED") {
    return 5;
  }
  
  if (wo.status === "IN_PROGRESS" && wo.techEmployeeComment) {
    return 4;
  }
  
  if (wo.status === "IN_PROGRESS" && wo.startedAt) {
    return 3;
  }
  
  if (wo.assignments && wo.assignments.length > 0) {
    return 2;
  }
  
  return 1;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatDurationShort(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

type ActivityLog = {
  id: string;
  action: string;
  category: string;
  createdAt: string;
  metadata: any;
};

export default function StagesMonitoring({ workOrder }: Props) {
  const { t, language } = useI18n();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch activity logs to get exact stage transition times
  useEffect(() => {
    if (!workOrder) return;

    let cancelled = false;
    async function loadActivities() {
      try {
        setLoadingActivities(true);
        const data = await apiGet<ActivityLog[]>(
          `/v1/work-orders/${workOrder!.workOrderNumber || workOrder!.id}/activity?includeDetails=true`,
        );
        if (!cancelled) {
          setActivities(data);
        }
      } catch (err) {
        console.error("Failed to load activities:", err);
      } finally {
        if (!cancelled) {
          setLoadingActivities(false);
        }
      }
    }

    loadActivities();
    return () => {
      cancelled = true;
    };
  }, [workOrder]);

  const currentStage = getCurrentStage(workOrder);

  // Calculate stage logs using activity logs for exact timestamps
  const stageLogs = useMemo(() => {
    if (!workOrder) return [];

    const logs: StageLog[] = [];
    const created = new Date(workOrder.createdAt);
    const now = currentTime;

    // Find activity log timestamps for stage transitions
    const assignedActivity = activities.find(a => a.action === "ASSIGNED");
    const startedActivity = activities.find(a => a.action === "STARTED");
    const submittedActivity = activities.find(a => a.action === "SUBMITTED");
    const approvedActivity = activities.find(a => a.action === "APPROVED");
    const canceledActivity = activities.find(a => a.action === "CANCELED");

    // Stage 1: Created
    let stage1End: Date | null = null;
    if (assignedActivity) {
      stage1End = new Date(assignedActivity.createdAt);
    } else if (workOrder.assignments && workOrder.assignments.length > 0) {
      const earliestAssignment = workOrder.assignments.reduce((earliest, assignment) => {
        const assignedAt = new Date(assignment.assignedAt);
        return !earliest || assignedAt < earliest ? assignedAt : earliest;
      }, null as Date | null);
      stage1End = earliestAssignment;
    } else if (currentStage > 1) {
      stage1End = now;
    }

    logs.push({
      stage: 1,
      stageName: t("workOrders.stages.created", "Created"),
      startTime: created,
      endTime: stage1End,
      duration: stage1End ? stage1End.getTime() - created.getTime() : null,
    });

    // Stage 2: Technicians Assigned
    if (assignedActivity || (workOrder.assignments && workOrder.assignments.length > 0)) {
      const stage2Start = assignedActivity 
        ? new Date(assignedActivity.createdAt)
        : workOrder.assignments?.reduce((earliest, assignment) => {
            const assignedAt = new Date(assignment.assignedAt);
            return !earliest || assignedAt < earliest ? assignedAt : earliest;
          }, null as Date | null) || created;

      let stage2End: Date | null = null;
      if (startedActivity) {
        stage2End = new Date(startedActivity.createdAt);
      } else if (workOrder.startedAt) {
        stage2End = new Date(workOrder.startedAt);
      } else if (currentStage > 2) {
        stage2End = now;
      }

      logs.push({
        stage: 2,
        stageName: t("workOrders.stages.techniciansAssigned", "Technicians Assigned"),
        startTime: stage2Start,
        endTime: stage2End,
        duration: stage2End ? stage2End.getTime() - stage2Start.getTime() : null,
      });
    }

    // Stage 3: Working
    if (startedActivity || workOrder.startedAt) {
      const stage3Start = startedActivity 
        ? new Date(startedActivity.createdAt)
        : new Date(workOrder.startedAt!);

      let stage3End: Date | null = null;
      if (submittedActivity) {
        stage3End = new Date(submittedActivity.createdAt);
      } else if (workOrder.techEmployeeComment && currentStage === 4) {
        // If we're in stage 4 but no submitted activity, use current time
        stage3End = now;
      } else if (currentStage > 3) {
        stage3End = now;
      }

      logs.push({
        stage: 3,
        stageName: t("workOrders.stages.working", "Working"),
        startTime: stage3Start,
        endTime: stage3End,
        duration: stage3End ? stage3End.getTime() - stage3Start.getTime() : null,
      });
    }

    // Stage 4: Waiting For Approval
    if (submittedActivity || workOrder.techEmployeeComment) {
      // Stage 4 starts when work is submitted (end of stage 3)
      const lastStage3Log = logs.find(log => log.stage === 3);
      const stage4Start = submittedActivity 
        ? new Date(submittedActivity.createdAt)
        : lastStage3Log?.endTime || (workOrder.startedAt ? new Date(workOrder.startedAt) : created);

      let stage4End: Date | null = null;
      if (approvedActivity) {
        stage4End = new Date(approvedActivity.createdAt);
      } else if (canceledActivity) {
        stage4End = new Date(canceledActivity.createdAt);
      } else if (workOrder.completedAt) {
        stage4End = new Date(workOrder.completedAt);
      } else if (workOrder.canceledAt) {
        stage4End = new Date(workOrder.canceledAt);
      } else if (currentStage === 5) {
        stage4End = now;
      }

      logs.push({
        stage: 4,
        stageName: t("workOrders.stages.waitingForApproval", "Waiting For Approval"),
        startTime: stage4Start,
        endTime: stage4End,
        duration: stage4End ? stage4End.getTime() - stage4Start.getTime() : null,
      });
    }

    // Stage 5: Completed/Canceled
    if (approvedActivity || canceledActivity || workOrder.completedAt || workOrder.canceledAt) {
      const endTime = approvedActivity 
        ? new Date(approvedActivity.createdAt)
        : canceledActivity
        ? new Date(canceledActivity.createdAt)
        : workOrder.completedAt 
        ? new Date(workOrder.completedAt)
        : new Date(workOrder.canceledAt!);

      // Stage 5 starts when stage 4 ended (or when approval/cancel happened)
      const lastStage4Log = logs.find(log => log.stage === 4);
      const startTime = lastStage4Log?.endTime || endTime;

      logs.push({
        stage: 5,
        stageName: workOrder.status === "COMPLETED" 
          ? t("workOrders.stages.completed", "Completed")
          : t("workOrders.stages.canceled", "Canceled"),
        startTime: startTime,
        endTime: endTime,
        duration: endTime.getTime() - startTime.getTime(),
      });
    }

    return logs;
  }, [workOrder, currentTime, currentStage, t, activities]);

  // Calculate current stage elapsed time
  const currentStageElapsed = useMemo(() => {
    if (!workOrder) return 0;
    
    const lastLog = stageLogs[stageLogs.length - 1];
    if (!lastLog || lastLog.endTime) return 0;

    return currentTime.getTime() - lastLog.startTime.getTime();
  }, [workOrder, stageLogs, currentTime]);

  // Calculate total time
  const totalTime = useMemo(() => {
    if (!workOrder) return 0;
    
    const endTime = workOrder.completedAt 
      ? new Date(workOrder.completedAt)
      : workOrder.canceledAt
      ? new Date(workOrder.canceledAt)
      : currentTime;
    
    return endTime.getTime() - new Date(workOrder.createdAt).getTime();
  }, [workOrder, currentTime]);

  if (!workOrder) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-zinc-600">Loading stages...</div>
      </div>
    );
  }

  const stageColors = {
    1: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
    2: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
    3: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
    4: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
    5: { bg: workOrder.status === "COMPLETED" ? "bg-green-50" : "bg-red-50", border: workOrder.status === "COMPLETED" ? "border-green-200" : "border-red-200", text: workOrder.status === "COMPLETED" ? "text-green-700" : "text-red-700", dot: workOrder.status === "COMPLETED" ? "bg-green-500" : "bg-red-500" },
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
        <h3 className="text-lg font-semibold text-zinc-900">Stages Monitoring</h3>
        <p className="text-xs text-zinc-600 mt-1">Track time spent in each stage</p>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-6" style={{ scrollBehavior: "smooth" }}>
        <div className="space-y-6">
          {/* Total Time Card */}
          <div className="rounded-xl bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-2 border-emerald-300 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Total Time</span>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center shadow-sm">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-3xl font-bold text-emerald-900 mb-2">{formatDuration(totalTime)}</div>
            <div className="text-xs text-emerald-700/80 mt-1 space-y-0.5">
              <div>From: {new Date(workOrder.createdAt).toLocaleString()}</div>
              {workOrder.completedAt || workOrder.canceledAt ? (
                <div>To: {(workOrder.completedAt ? new Date(workOrder.completedAt) : new Date(workOrder.canceledAt!)).toLocaleString()}</div>
              ) : (
                <div className="text-emerald-600 font-semibold">● Ongoing</div>
              )}
            </div>
          </div>

          {/* Current Stage Countdown */}
          {currentStage < 5 && (
            <div className={`rounded-xl ${stageColors[currentStage as keyof typeof stageColors].bg} border-2 ${stageColors[currentStage as keyof typeof stageColors].border} shadow-sm p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                  <div className="text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1">Current Stage</div>
                  <div className={`text-xl font-bold ${stageColors[currentStage as keyof typeof stageColors].text}`}>
                    {stageLogs[stageLogs.length - 1]?.stageName || t("workOrders.stages.created", "Created")}
                  </div>
                </div>
                <div className={`h-14 w-14 rounded-full ${stageColors[currentStage as keyof typeof stageColors].dot} flex items-center justify-center shadow-md`}>
                  <span className="text-white font-bold text-xl">{currentStage}</span>
                </div>
              </div>
              <div className="bg-white/60 rounded-lg p-3 border border-white/40">
                <div className="flex items-baseline gap-2 mb-1">
                  <div className="text-4xl font-bold text-zinc-900">{formatDurationShort(currentStageElapsed)}</div>
                  <div className="text-sm text-zinc-600 font-medium">elapsed</div>
                </div>
                <div className="text-xs text-zinc-500">
                  Started: {stageLogs[stageLogs.length - 1]?.startTime.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Stage Logs */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-zinc-200" />
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-wide">Stage History</div>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>
            
            {loadingActivities ? (
              <div className="rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-500 border border-zinc-200">
                Loading stage history...
              </div>
            ) : stageLogs.length === 0 ? (
              <div className="rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-500 border border-zinc-200">
                No stage changes recorded yet
              </div>
            ) : (
              <div className="space-y-3">
                {stageLogs.map((log, index) => {
                  const colors = stageColors[log.stage as keyof typeof stageColors];
                  const isActive = !log.endTime && index === stageLogs.length - 1;
                  
                  return (
                    <div
                      key={log.stage}
                      className={`rounded-xl ${colors.bg} border-2 ${colors.border} p-4 transition-all shadow-sm ${
                        isActive ? "ring-2 ring-offset-2 ring-zinc-300 shadow-md" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`h-4 w-4 rounded-full ${colors.dot} shadow-sm`} />
                            <div className={`text-sm font-bold ${colors.text}`}>
                              Stage {log.stage}: {log.stageName}
                            </div>
                            {isActive && (
                              <span className="px-2.5 py-1 rounded-full bg-white/80 text-xs font-bold text-zinc-700 shadow-sm">
                                ● Active
                              </span>
                            )}
                          </div>
                          
                          <div className="space-y-1.5 text-xs text-zinc-600 ml-7">
                            <div className="flex items-center gap-2">
                              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span><span className="font-semibold">Started:</span> {log.startTime.toLocaleString()}</span>
                            </div>
                            {log.endTime ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span><span className="font-semibold">Ended:</span> {log.endTime.toLocaleString()}</span>
                                </div>
                                <div className="mt-3 pt-2 border-t border-white/40">
                                  <span className="font-bold text-zinc-900 text-sm">Duration: {formatDuration(log.duration || 0)}</span>
                                </div>
                              </>
                            ) : (
                              <div className="mt-3 pt-2 border-t border-white/40">
                                <span className="font-bold text-zinc-900 text-sm">Duration: {formatDuration(currentStageElapsed)} (ongoing)</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {log.duration && (
                          <div className="flex-shrink-0 text-right bg-white/60 rounded-lg p-3 border border-white/40">
                            <div className="text-2xl font-bold text-zinc-900">{formatDurationShort(log.duration)}</div>
                            <div className="text-xs text-zinc-500 font-medium">total</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
