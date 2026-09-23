"use client";

import React from "react";
import { ServiceWorkloadSummary } from "@/lib/reports/report-types";
import {
  Wrench,
  CheckCircle2,
  Clock,
  Layers,
  BarChart3,
  Calendar,
  TrendingUp,
} from "lucide-react";

interface ServiceWorkloadTabProps {
  data: ServiceWorkloadSummary;
}

export function ServiceWorkloadTab({ data }: ServiceWorkloadTabProps) {
  const hasData = data.totalCreatedInPeriod > 0 || data.totalCompletedInPeriod > 0 || data.activePendingWork > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 gap-2">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
            <Wrench className="h-5 w-5 mr-2 text-violet-600" />
            Service Workload & Operational Insights
          </h2>
          <p className="text-xs text-zinc-500">
            Reporting Period: <strong className="text-zinc-700 dark:text-zinc-300">{data.dateFrom}</strong> to{" "}
            <strong className="text-zinc-700 dark:text-zinc-300">{data.dateTo}</strong>
          </p>
        </div>
        <div className="text-[11px] text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-1.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
          Server-authoritative operational reporting
        </div>
      </div>

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* Work Created */}
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
            <Layers className="h-10 w-10 text-violet-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Work Created</p>
          <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mt-1">
            {data.totalCreatedInPeriod}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1.5">Requests started in period</p>
        </div>

        {/* Completed Work */}
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Completed Work</p>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {data.totalCompletedInPeriod}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1.5">Delivered / finished in period</p>
        </div>

        {/* Active / Pending */}
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
            <Clock className="h-10 w-10 text-blue-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active Pipeline</p>
          <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
            {data.activePendingWork}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1.5">Non-terminal in progress</p>
        </div>

        {/* Cohort Completion Rate */}
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
            <TrendingUp className="h-10 w-10 text-indigo-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Completion Rate</p>
          <p className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
            {data.cohortCompletionRate}%
          </p>
          <p className="text-[11px] text-zinc-500 mt-1.5">Created in cohort & finished</p>
        </div>

        {/* Average Turnaround */}
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
            <Calendar className="h-10 w-10 text-amber-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Avg Turnaround</p>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {data.turnaround.sampleCount > 0 ? `${data.turnaround.averageDays}d` : "—"}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1.5">
            {data.turnaround.sampleCount > 0
              ? `Median: ${data.turnaround.medianDays}d (${data.turnaround.sampleCount} sampled)`
              : "No completed jobs"}
          </p>
        </div>
      </div>

      {!hasData ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <Wrench className="h-10 w-10 text-zinc-400 mx-auto mb-3 opacity-40" />
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            No Operational Work Found
          </h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
            No service requests were created or completed during the selected period ({data.dateFrom} to {data.dateTo}).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Top Services Workload Ranking */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
                  <BarChart3 className="h-4 w-4 mr-2 text-violet-600" />
                  Service Volume Breakdown
                </h3>
                <span className="text-xs text-zinc-400">
                  {data.topServices.length} {data.topServices.length === 1 ? "Service" : "Services"} active
                </span>
              </div>

              {data.topServices.length === 0 ? (
                <p className="text-xs text-zinc-400 py-6 text-center">No service requests created in this window.</p>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 mt-2">
                  {data.topServices.map((srv, idx) => (
                    <div key={srv.serviceId} className="py-3.5 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {srv.serviceName}
                          </span>
                          {srv.serviceCode && (
                            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                              {srv.serviceCode}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs sm:text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                            {srv.totalRequests} reqs
                          </span>
                          <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-2 py-0.5 rounded-full">
                            {srv.sharePercentage}%
                          </span>
                        </div>
                      </div>

                      {/* Visual proportional bar */}
                      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(2, srv.sharePercentage)}%` }}
                        />
                      </div>

                      {/* Sub-counts: completed vs active */}
                      <div className="flex items-center gap-4 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          <span>{srv.completedRequests} completed</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-blue-500" />
                          <span>{srv.activeRequests} active</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right 1 Column: Status Distribution & Turnaround Details */}
          <div className="space-y-6">
            {/* Status Distribution Card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
                  <Layers className="h-4 w-4 mr-2 text-indigo-600" />
                  Status Distribution
                </h3>
              </div>

              {data.statusDistribution.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4 text-center">No status data recorded.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.statusDistribution.map((item) => (
                    <div key={item.status} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[160px]">
                          {item.label}
                        </span>
                        <span className="font-mono text-zinc-900 dark:text-zinc-100 font-bold">
                          {item.count} ({item.percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.isTerminal
                              ? "bg-emerald-500"
                              : item.status === "action_required"
                              ? "bg-amber-500"
                              : "bg-blue-500"
                          }`}
                          style={{ width: `${Math.max(2, item.percentage)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Turnaround Analytics Card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
                  <Clock className="h-4 w-4 mr-2 text-amber-600" />
                  Turnaround Dynamics
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Fastest Job</p>
                  <p className="text-base font-bold font-mono text-zinc-900 dark:text-white mt-0.5">
                    {data.turnaround.sampleCount > 0 ? `${data.turnaround.minDays}d` : "—"}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Longest Job</p>
                  <p className="text-base font-bold font-mono text-zinc-900 dark:text-white mt-0.5">
                    {data.turnaround.sampleCount > 0 ? `${data.turnaround.maxDays}d` : "—"}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Average</p>
                  <p className="text-base font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                    {data.turnaround.sampleCount > 0 ? `${data.turnaround.averageDays}d` : "—"}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Median</p>
                  <p className="text-base font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {data.turnaround.sampleCount > 0 ? `${data.turnaround.medianDays}d` : "—"}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
                Calculated strictly from completed jobs with authoritative created & completion timestamps.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
