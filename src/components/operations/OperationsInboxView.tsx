"use client";

import React, { useState, useMemo } from "react";
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
  AlertTriangle,
  Calendar,
  Search,
  X,
  User,
  Layers,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import type {
  OperationsInboxSummary,
  AlertCategory,
  OperationAlert,
} from "@/lib/operations/operationsInboxQuery";
import type { OperationalPriority } from "@/lib/operations/dateUtils";
import { getOperationsInboxAlerts } from "@/app/(dashboard)/operations/actions";
import { toggleDocumentVerification } from "@/app/(dashboard)/requests/actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineErrorState } from "@/components/ui/InlineErrorState";
import { QuickFollowupResolveModal } from "./QuickFollowupResolveModal";
import { toast } from "sonner";

interface OperationsInboxViewProps {
  initialSummary?: OperationsInboxSummary;
}

export function OperationsInboxView({ initialSummary }: OperationsInboxViewProps = {}) {
  const queryClient = useQueryClient();
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Direct Resolution State (Phase 12)
  const [followupModalAlert, setFollowupModalAlert] = useState<OperationAlert | null>(null);
  const [followupModalMode, setFollowupModalMode] = useState<"complete" | "reschedule">("complete");
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);

  const [verifyConfirmAlert, setVerifyConfirmAlert] = useState<OperationAlert | null>(null);
  const [isVerifyingDoc, setIsVerifyingDoc] = useState(false);

  const {
    data: summary = initialSummary || {
      alerts: [],
      counts: {
        total: 0,
        urgent: 0,
        today: 0,
        upcoming: 0,
        pending: 0,
        high: 0,
        normal: 0,
        followups: 0,
        documents: 0,
        requests: 0,
        billing: 0,
      },
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

  const handleResetFilters = () => {
    setSelectedPriority("all");
    setSelectedCategory("all");
    setSearchQuery("");
  };

  // Direct Resolution Handlers (Phase 12)
  const handleOpenComplete = (alert: OperationAlert) => {
    setFollowupModalAlert(alert);
    setFollowupModalMode("complete");
    setIsFollowupModalOpen(true);
  };

  const handleOpenReschedule = (alert: OperationAlert) => {
    setFollowupModalAlert(alert);
    setFollowupModalMode("reschedule");
    setIsFollowupModalOpen(true);
  };

  const handleFollowupSuccess = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.operations.alerts(DASHBOARD_MEMORY_SCOPE),
    });
  };

  const handleOpenVerifyDoc = (alert: OperationAlert) => {
    setVerifyConfirmAlert(alert);
  };

  const handleConfirmVerifyDoc = async () => {
    const targetRequestId = verifyConfirmAlert?.requestId || verifyConfirmAlert?.customerServiceId;
    if (!verifyConfirmAlert || !verifyConfirmAlert.associationId || !targetRequestId) {
      toast.error("Missing document association or request ID.");
      return;
    }

    setIsVerifyingDoc(true);
    try {
      const res = await toggleDocumentVerification({
        requestId: targetRequestId,
        associationId: verifyConfirmAlert.associationId,
        expectedIsVerified: false,
        isVerified: true,
      });

      if (res.success) {
        toast.success("Document association verified successfully.");
        queryClient.invalidateQueries({
          queryKey: queryKeys.operations.alerts(DASHBOARD_MEMORY_SCOPE),
        });
        setVerifyConfirmAlert(null);
      } else if (res.errorCode === "conflict") {
        toast.error("Document verification state changed concurrently. Refreshing queue...");
        queryClient.invalidateQueries({
          queryKey: queryKeys.operations.alerts(DASHBOARD_MEMORY_SCOPE),
        });
        setVerifyConfirmAlert(null);
      } else {
        toast.error(res.error || "Failed to verify document.");
      }
    } catch {
      toast.error("An unexpected error occurred while verifying document.");
    } finally {
      setIsVerifyingDoc(false);
    }
  };

  const activeAlerts = useMemo(
    () => summary.alerts.filter((a) => !dismissedIds.has(a.id)),
    [summary.alerts, dismissedIds]
  );

  const filteredAlerts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return activeAlerts.filter((a) => {
      if (selectedPriority !== "all" && a.priority !== selectedPriority) return false;
      if (selectedCategory !== "all" && a.category !== selectedCategory) return false;
      if (query) {
        const matchTitle = a.title.toLowerCase().includes(query);
        const matchDesc = a.description.toLowerCase().includes(query);
        const matchCust = (a.customerName || "").toLowerCase().includes(query);
        const matchReason = (a.reason || "").toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchCust && !matchReason) return false;
      }
      return true;
    });
  }, [activeAlerts, selectedPriority, selectedCategory, searchQuery]);

  // Compute live counts from active (non-dismissed) alerts
  const liveCounts = useMemo(() => {
    return {
      total: activeAlerts.length,
      urgent: activeAlerts.filter((a) => a.priority === "urgent").length,
      today: activeAlerts.filter((a) => a.priority === "today").length,
      upcoming: activeAlerts.filter((a) => a.priority === "upcoming").length,
      pending: activeAlerts.filter((a) => a.priority === "pending").length,
      followups: activeAlerts.filter((a) => a.category === "followup").length,
      requests: activeAlerts.filter((a) => a.category === "request").length,
      documents: activeAlerts.filter((a) => a.category === "document").length,
      billing: activeAlerts.filter((a) => a.category === "billing").length,
    };
  }, [activeAlerts]);

  // Group filtered alerts by priority for the "All" priority view
  const groupedAlerts = useMemo(() => {
    return {
      urgent: filteredAlerts.filter((a) => a.priority === "urgent"),
      today: filteredAlerts.filter((a) => a.priority === "today"),
      upcoming: filteredAlerts.filter((a) => a.priority === "upcoming"),
      pending: filteredAlerts.filter((a) => a.priority === "pending"),
    };
  }, [filteredAlerts]);

  const hasActiveFilters =
    selectedPriority !== "all" || selectedCategory !== "all" || searchQuery.trim().length > 0;

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

  const getPriorityBadge = (priority: OperationalPriority) => {
    switch (priority) {
      case "urgent":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40">
            <AlertTriangle className="h-3 w-3" />
            Urgent
          </span>
        );
      case "today":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40">
            <Clock className="h-3 w-3" />
            Due Today
          </span>
        );
      case "upcoming":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40">
            <Calendar className="h-3 w-3" />
            Upcoming
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
            <Layers className="h-3 w-3" />
            Pending Action
          </span>
        );
    }
  };

  const renderAlertCard = (alert: OperationAlert) => {
    const isUrgent = alert.priority === "urgent";
    const isToday = alert.priority === "today";

    return (
      <div
        key={alert.id}
        className={`bg-white dark:bg-zinc-900 rounded-2xl border p-4 sm:p-5 shadow-xs transition-all hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isUrgent
            ? "border-rose-200 bg-rose-50/20 dark:border-rose-900/40 dark:bg-rose-950/10"
            : isToday
            ? "border-amber-200 bg-amber-50/20 dark:border-amber-900/40 dark:bg-amber-950/10"
            : "border-slate-200/80 dark:border-zinc-800"
        }`}
      >
        <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
              isUrgent
                ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                : isToday
                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
            }`}
          >
            {getCategoryIcon(alert.category)}
          </div>

          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {getPriorityBadge(alert.priority)}
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {alert.category}
              </span>
              {alert.reason && (
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-zinc-800 dark:text-zinc-300 px-2 py-0.5 rounded-md">
                  {alert.reason}
                </span>
              )}
            </div>

            <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight leading-snug">
              {alert.title}
            </h4>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
              {alert.description}
            </p>

            <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-xs text-slate-500 pt-1">
              {alert.customerName && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>Customer:</span>
                  {alert.customerId ? (
                    <Link
                      href={`/customers/${alert.customerId}`}
                      className="font-semibold text-slate-800 dark:text-zinc-200 hover:text-violet-600 dark:hover:text-violet-400 underline underline-offset-2"
                    >
                      {alert.customerName}
                    </Link>
                  ) : (
                    <span className="font-semibold text-slate-800 dark:text-zinc-200">
                      {alert.customerName}
                    </span>
                  )}
                </div>
              )}

              {(alert.formattedDueDate || alert.dueDate) && (
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>Target Date:</span>
                  <span className="font-medium text-slate-800 dark:text-zinc-200">
                    {alert.formattedDueDate || alert.dueDate}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-end md:self-center shrink-0 w-full sm:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-zinc-800">
          {/* Action 1: Followup Complete & Reschedule direct actions */}
          {alert.category === "followup" && alert.followupId && (alert.requestId || alert.customerServiceId) && (
            <>
              <button
                type="button"
                onClick={() => handleOpenComplete(alert)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
                title={`Complete follow-up for ${alert.customerName || "customer"}`}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Complete</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenReschedule(alert)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700/60 text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors"
                title={`Reschedule follow-up for ${alert.customerName || "customer"}`}
              >
                <Clock className="h-4 w-4 text-blue-500" />
                <span>Reschedule</span>
              </button>
            </>
          )}

          {/* Action 2: Document Verification direct action */}
          {alert.category === "document" && alert.associationId && (alert.requestId || alert.customerServiceId) && (
            <button
              type="button"
              onClick={() => handleOpenVerifyDoc(alert)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
              title={`Verify document for ${alert.customerName || "customer"}`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Verify Doc</span>
            </button>
          )}

          {/* Temporary in-memory dismiss (Acknowledge) */}
          <button
            onClick={() => handleDismiss(alert.id)}
            title="Dismiss from current session view (temporary)"
            aria-label={`Dismiss alert for ${alert.title}`}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <Check className="h-4 w-4" />
          </button>

          {/* Canonical Deep Link / Investigation Action */}
          <Link
            href={alert.targetUrl}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors flex-1 sm:flex-initial"
          >
            <span>{alert.targetLabel}</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <PageHeader
        title="Operations Work Queue & Intelligence"
        description="Daily operational priorities across follow-ups, blocked requests, document renewals, and overdue customer balances."
        icon={Bell}
        iconVariant="badge"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/requests"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700/50 text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors"
            >
              <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
              Requests Desk
            </Link>
            <Link
              href="/communications"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Outreach Queue
            </Link>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center justify-center p-2.5 min-h-[44px] min-w-[44px] bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700/50 rounded-xl shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              title="Refresh Operations Queue"
              aria-label="Refresh Operations Queue"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      {/* Priority KPI Cards (Interactive Filter Triggers) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Urgent */}
        <button
          onClick={() => setSelectedPriority(selectedPriority === "urgent" ? "all" : "urgent")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedPriority === "urgent"
              ? "border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/50 dark:bg-rose-950/20"
              : "border-rose-100 bg-rose-50/20 hover:border-rose-300 dark:border-rose-900/30 dark:bg-rose-950/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Urgent Attention
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-rose-700 dark:text-rose-400 mt-2 font-mono">
            {liveCounts.urgent}
          </div>
          <div className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1">
            Overdue tasks & expired docs
          </div>
        </button>

        {/* Due Today */}
        <button
          onClick={() => setSelectedPriority(selectedPriority === "today" ? "all" : "today")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedPriority === "today"
              ? "border-amber-400 ring-2 ring-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20"
              : "border-amber-100 bg-amber-50/20 hover:border-amber-300 dark:border-amber-900/30 dark:bg-amber-950/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Due Today
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-amber-700 dark:text-amber-400 mt-2 font-mono">
            {liveCounts.today}
          </div>
          <div className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
            Scheduled outreach & deadlines
          </div>
        </button>

        {/* Upcoming */}
        <button
          onClick={() => setSelectedPriority(selectedPriority === "upcoming" ? "all" : "upcoming")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedPriority === "upcoming"
              ? "border-blue-400 ring-2 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20"
              : "border-blue-100 bg-blue-50/20 hover:border-blue-300 dark:border-blue-900/30 dark:bg-blue-950/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Upcoming Due
            </span>
            <Calendar className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-blue-700 dark:text-blue-400 mt-2 font-mono">
            {liveCounts.upcoming}
          </div>
          <div className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1">
            Renewals & upcoming follow-ups
          </div>
        </button>

        {/* Pending Action */}
        <button
          onClick={() => setSelectedPriority(selectedPriority === "pending" ? "all" : "pending")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedPriority === "pending"
              ? "border-violet-400 ring-2 ring-violet-500/20 bg-violet-50/50 dark:bg-violet-950/20"
              : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Pending Action
            </span>
            <ClipboardList className="h-4 w-4 text-violet-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-zinc-200 mt-2 font-mono">
            {liveCounts.pending}
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Waiting on info or verification
          </div>
        </button>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="bg-white dark:bg-zinc-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-3">
        {/* Search and Priority Pills */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer, service, reason, or details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 min-h-[44px] border border-slate-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-violet-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label="Clear search query"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Priority Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
              Priority:
            </span>
            {[
              { id: "all", label: `All (${liveCounts.total})` },
              { id: "urgent", label: `Urgent (${liveCounts.urgent})` },
              { id: "today", label: `Today (${liveCounts.today})` },
              { id: "upcoming", label: `Upcoming (${liveCounts.upcoming})` },
              { id: "pending", label: `Pending (${liveCounts.pending})` },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPriority(p.id)}
                className={`px-3 py-1.5 min-h-[38px] rounded-xl text-xs font-semibold transition-colors shrink-0 whitespace-nowrap ${
                  selectedPriority === p.id
                    ? "bg-violet-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type Filter and Bulk Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full sm:w-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
              Category:
            </span>
            {[
              { id: "all", label: `All Types (${liveCounts.total})` },
              { id: "followup", label: `Follow-ups (${liveCounts.followups})` },
              { id: "request", label: `Requests (${liveCounts.requests})` },
              { id: "document", label: `Documents (${liveCounts.documents})` },
              { id: "billing", label: `Invoices (${liveCounts.billing})` },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 min-h-[38px] rounded-xl text-xs font-semibold transition-colors shrink-0 whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? "bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="text-xs text-violet-600 hover:text-violet-700 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
              >
                Reset filters
              </button>
            )}

            {activeAlerts.length > 0 && (
              <button
                onClick={handleDismissAll}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Dismiss All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Work Queue Content */}
      <div className="space-y-4">
        {isError ? (
          <InlineErrorState
            title="Unable to load operations work queue"
            message="An error occurred while deriving operational priorities. Please try again."
            onRetry={() => refetch()}
            bordered
          />
        ) : isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-zinc-800" />
                  <div className="space-y-2">
                    <div className="h-4 w-48 bg-slate-200 dark:bg-zinc-800 rounded" />
                    <div className="h-3 w-80 bg-slate-100 dark:bg-zinc-800/60 rounded" />
                  </div>
                </div>
                <div className="h-10 w-28 bg-slate-200 dark:bg-zinc-800 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredAlerts.length === 0 ? (
          hasActiveFilters ? (
            <EmptyState
              icon={CheckCircle2}
              title="No matching operational alerts"
              description="No tasks match your active filter and search criteria. Try clearing filters to see all daily work."
              action={
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs"
                >
                  Reset all filters
                </button>
              }
              bordered
            />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Operations Queue Clear!"
              description="All follow-ups, document renewals, service requests, and invoice items are up to date."
              action={
                <Link
                  href="/dashboard"
                  className="px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors inline-flex items-center shadow-xs"
                >
                  Return to Dashboard
                </Link>
              }
              bordered
            />
          )
        ) : selectedPriority === "all" ? (
          // Grouped Display by Priority
          <div className="space-y-6">
            {groupedAlerts.urgent.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                    Urgent Attention ({groupedAlerts.urgent.length})
                  </h3>
                  <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    Immediate resolution needed
                  </span>
                </div>
                <div className="space-y-3">
                  {groupedAlerts.urgent.map(renderAlertCard)}
                </div>
              </div>
            )}

            {groupedAlerts.today.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                    Due Today ({groupedAlerts.today.length})
                  </h3>
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Scheduled for today
                  </span>
                </div>
                <div className="space-y-3">
                  {groupedAlerts.today.map(renderAlertCard)}
                </div>
              </div>
            )}

            {groupedAlerts.upcoming.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                    Upcoming Due ({groupedAlerts.upcoming.length})
                  </h3>
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    Next 7–30 days
                  </span>
                </div>
                <div className="space-y-3">
                  {groupedAlerts.upcoming.map(renderAlertCard)}
                </div>
              </div>
            )}

            {groupedAlerts.pending.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                    Pending Action ({groupedAlerts.pending.length})
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                    Customer action / verification
                  </span>
                </div>
                <div className="space-y-3">
                  {groupedAlerts.pending.map(renderAlertCard)}
                </div>
              </div>
            )}
          </div>
        ) : (
          // Flat Filtered Display
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 px-1">
              Showing {filteredAlerts.length} operational {filteredAlerts.length === 1 ? "task" : "tasks"}
            </div>
            {filteredAlerts.map(renderAlertCard)}
          </div>
        )}
      </div>

      {/* Follow-up Resolve/Reschedule Modal (Phase 12) */}
      <QuickFollowupResolveModal
        isOpen={isFollowupModalOpen}
        onClose={() => setIsFollowupModalOpen(false)}
        mode={followupModalMode}
        alert={followupModalAlert}
        onSuccess={handleFollowupSuccess}
      />

      {/* Document Verification Confirmation Modal (Phase 12) */}
      {verifyConfirmAlert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isVerifyingDoc) setVerifyConfirmAlert(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-doc-dialog-title"
            className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2
                    id="verify-doc-dialog-title"
                    className="text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight"
                  >
                    Verify Document
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Confirm staff verification of document association
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setVerifyConfirmAlert(null)}
                disabled={isVerifyingDoc}
                aria-label="Close dialog"
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-zinc-100">
                    {verifyConfirmAlert.customerName || "Customer"}
                  </span>
                  {verifyConfirmAlert.requestNumber && (
                    <span className="font-mono text-[11px] font-bold text-slate-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-slate-200/80 dark:border-zinc-700">
                      Ref: {verifyConfirmAlert.requestNumber}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400">
                  <span className="text-slate-400">Requirement Tag:</span>
                  <span className="font-bold text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded border border-violet-100 dark:border-violet-900/40">
                    {verifyConfirmAlert.requirementTag || "general"}
                  </span>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
                Are you sure you want to mark this document association as verified for this service request?
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setVerifyConfirmAlert(null)}
                  disabled={isVerifyingDoc}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmVerifyDoc}
                  disabled={isVerifyingDoc}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 shadow-xs transition-colors disabled:opacity-50"
                >
                  {isVerifyingDoc && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Confirm Verification</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
