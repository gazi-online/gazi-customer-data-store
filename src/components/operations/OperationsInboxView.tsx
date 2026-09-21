"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bell,
  Clock,
  CheckCircle2,
  FileText,
  ClipboardList,
  Receipt,
  ChevronRight,
  Check,
  RefreshCw,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import type {
  OperationsInboxSummary,
  AlertCategory,
} from "@/lib/operations/operationsInboxQuery";
import { getOperationsInboxAlerts } from "@/app/(dashboard)/operations/actions";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";

interface OperationsInboxViewProps {
  initialSummary?: OperationsInboxSummary;
}

export function OperationsInboxView({ initialSummary }: OperationsInboxViewProps = {}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const {
    data: summary = initialSummary || {
      alerts: [],
      totalCount: 0,
      urgentCount: 0,
      highCount: 0,
      normalCount: 0,
    },
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.operations.alerts(DASHBOARD_MEMORY_SCOPE),
    queryFn: () => getOperationsInboxAlerts(),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  });

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleDismissAll = () => {
    const allIds = summary.alerts.map((a) => a.id);
    setDismissedIds(new Set(allIds));
  };

  const activeAlerts = summary.alerts.filter((a) => !dismissedIds.has(a.id));

  const filteredAlerts = activeAlerts.filter((a) => {
    if (selectedCategory !== "all" && a.category !== selectedCategory) return false;
    if (selectedSeverity !== "all" && a.severity !== selectedSeverity) return false;
    return true;
  });

  const getCategoryIcon = (category: AlertCategory) => {
    switch (category) {
      case "followup":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "document":
        return <FileText className="h-4 w-4 text-blue-500" />;
      case "request":
        return <ClipboardList className="h-4 w-4 text-purple-500" />;
      case "billing":
        return <Receipt className="h-4 w-4 text-rose-500" />;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Bell className="h-6 w-6 text-violet-600" />
            Operations Inbox & Action Center
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time shop operational alerts derived across follow-ups, document expiries, blocked requests, and overdue invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/communications"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Outreach Queue
          </Link>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Alerts</span>
          <div className="text-2xl font-bold text-slate-900 mt-2">{activeAlerts.length}</div>
          <div className="text-xs text-slate-500 mt-1">Requires staff attention</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-xs bg-rose-50/20">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-500">Urgent</span>
          <div className="text-2xl font-bold text-rose-600 mt-2">
            {activeAlerts.filter((a) => a.severity === "urgent").length}
          </div>
          <div className="text-xs text-rose-500 mt-1">Past due dates</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs bg-amber-50/20">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">High Priority</span>
          <div className="text-2xl font-bold text-amber-600 mt-2">
            {activeAlerts.filter((a) => a.severity === "high").length}
          </div>
          <div className="text-xs text-amber-600 mt-1">Due today or blocked</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Normal</span>
          <div className="text-2xl font-bold text-slate-700 mt-2">
            {activeAlerts.filter((a) => a.severity === "normal").length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Upcoming renewals & verifications</div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              selectedCategory === "all" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Categories ({activeAlerts.length})
          </button>
          <button
            onClick={() => setSelectedCategory("followup")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              selectedCategory === "followup" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Follow-ups ({activeAlerts.filter((a) => a.category === "followup").length})
          </button>
          <button
            onClick={() => setSelectedCategory("request")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              selectedCategory === "request" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Requests ({activeAlerts.filter((a) => a.category === "request").length})
          </button>
          <button
            onClick={() => setSelectedCategory("document")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              selectedCategory === "document" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Documents ({activeAlerts.filter((a) => a.category === "document").length})
          </button>
          <button
            onClick={() => setSelectedCategory("billing")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              selectedCategory === "billing" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Invoices ({activeAlerts.filter((a) => a.category === "billing").length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="all">All Severities</option>
            <option value="urgent">Urgent Only</option>
            <option value="high">High Only</option>
            <option value="normal">Normal Only</option>
          </select>

          {activeAlerts.length > 0 && (
            <button
              onClick={handleDismissAll}
              className="text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              Clear View
            </button>
          )}
        </div>
      </div>

      {/* Alert Feed */}
      <div className="space-y-3">
        {isError ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-rose-900">Failed to load operations alerts</p>
            <p className="text-xs text-rose-600 mt-1 mb-3">An error occurred while fetching real-time operational alerts.</p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200/80 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-48 bg-slate-200 rounded" />
                    <div className="h-3 w-80 bg-slate-100 rounded" />
                  </div>
                </div>
                <div className="h-8 w-24 bg-slate-200 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900">Operations Inbox Clear!</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No operational alerts currently match your filter criteria.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isUrgent = alert.severity === "urgent";
            const isHigh = alert.severity === "high";

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-2xl border p-4 md:p-5 shadow-xs transition-all hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isUrgent
                    ? "border-rose-200 bg-rose-50/10"
                    : isHigh
                    ? "border-amber-200 bg-amber-50/10"
                    : "border-slate-200/80"
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      isUrgent
                        ? "bg-rose-100"
                        : isHigh
                        ? "bg-amber-100"
                        : "bg-slate-100"
                    }`}
                  >
                    {getCategoryIcon(alert.category)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isUrgent
                            ? "bg-rose-100 text-rose-700"
                            : isHigh
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        {alert.category}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">{alert.title}</h4>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                      {alert.description}
                    </p>

                    {alert.customerName && (
                      <div className="text-[11px] text-slate-500 pt-0.5">
                        Customer: <span className="font-semibold text-slate-700">{alert.customerName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    title="Acknowledge / Dismiss from view"
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <Check className="h-4 w-4" />
                  </button>

                  <Link
                    href={alert.targetUrl}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                  >
                    <span>{alert.targetLabel}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
