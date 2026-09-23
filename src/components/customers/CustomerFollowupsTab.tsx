"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  X,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  CustomerFollowupItem,
  CustomerFollowupsSummary,
  getCustomerFollowups,
  createCustomerFollowup,
  rescheduleCustomerFollowup,
  completeCustomerFollowup,
  cancelCustomerFollowup,
} from "@/app/(dashboard)/actions/customerFollowupActions";
import { formatKolkataDateTime, getKolkataDateString } from "@/lib/operations/dateUtils";

interface CustomerFollowupsTabProps {
  customerId: string;
  customerName?: string;
  initialSummary?: CustomerFollowupsSummary | null;
}

export function CustomerFollowupsTab({
  customerId,
  customerName = "Customer",
  initialSummary = null,
}: CustomerFollowupsTabProps) {
  const [summary, setSummary] = useState<CustomerFollowupsSummary | null>(initialSummary);
  const [loading, setLoading] = useState(!initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<"pending" | "overdue" | "today" | "upcoming" | "completed" | "all">("pending");

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeItemForAction, setActiveItemForAction] = useState<CustomerFollowupItem | null>(null);
  const [actionModalMode, setActionModalMode] = useState<"reschedule" | "complete" | "cancel" | null>(null);

  // Form inputs
  const [reasonInput, setReasonInput] = useState("");
  const [followUpAtInput, setFollowUpAtInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [rescheduleAtInput, setRescheduleAtInput] = useState("");
  const [rescheduleNoteInput, setRescheduleNoteInput] = useState("");
  const [resolutionNoteInput, setResolutionNoteInput] = useState("");

  const [isPending, startTransition] = useTransition();

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getCustomerFollowups(customerId);
      setSummary(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load customer follow-ups";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    let isCancelled = false;
    async function fetchFollowups() {
      if (initialSummary) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getCustomerFollowups(customerId);
        if (!isCancelled) {
          setSummary(res);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load customer follow-ups";
          setError(msg);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }
    void fetchFollowups();
    return () => {
      isCancelled = true;
    };
  }, [customerId, initialSummary]);

  const filteredFollowups = useMemo(() => {
    if (!summary) return [];
    const list = summary.followups;

    switch (selectedFilter) {
      case "pending":
        return list.filter((f) => f.status === "open");
      case "overdue":
        return list.filter((f) => f.status === "open" && f.state === "overdue");
      case "today":
        return list.filter((f) => f.status === "open" && f.state === "today");
      case "upcoming":
        return list.filter((f) => f.status === "open" && (f.state === "upcoming" || f.state === "tomorrow"));
      case "completed":
        return list.filter((f) => f.status === "completed");
      case "all":
      default:
        return list;
    }
  }, [summary, selectedFilter]);

  const handleOpenAddModal = () => {
    const todayStr = getKolkataDateString(new Date());
    setReasonInput("");
    setFollowUpAtInput(`${todayStr}T11:00`);
    setNotesInput("");
    setIsAddModalOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonInput.trim()) {
      toast.error("Please provide a short reason for this follow-up.");
      return;
    }
    if (!followUpAtInput) {
      toast.error("Please choose a date and time.");
      return;
    }

    startTransition(async () => {
      const res = await createCustomerFollowup({
        customerId,
        followUpAt: followUpAtInput,
        reason: reasonInput.trim(),
        notes: notesInput.trim() || null,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to schedule follow-up.");
        return;
      }

      toast.success("Follow-up reminder scheduled successfully.");
      setIsAddModalOpen(false);
      await loadData();
    });
  };

  const handleOpenReschedule = (item: CustomerFollowupItem) => {
    setActiveItemForAction(item);
    setActionModalMode("reschedule");
    setRescheduleAtInput(item.followUpAt ? item.followUpAt.slice(0, 16) : "");
    setRescheduleNoteInput(item.note || "");
    setResolutionNoteInput("");
  };

  const handleRescheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItemForAction || !rescheduleAtInput) {
      toast.error("Please select a new follow-up date and time.");
      return;
    }

    startTransition(async () => {
      const res = await rescheduleCustomerFollowup({
        followupId: activeItemForAction.id,
        requestId: activeItemForAction.customerServiceId,
        customerId,
        newFollowUpAt: rescheduleAtInput,
        newNote: rescheduleNoteInput.trim() || null,
        resolutionNote: resolutionNoteInput.trim() || null,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to reschedule follow-up.");
        return;
      }

      toast.success("Follow-up rescheduled successfully.");
      setActionModalMode(null);
      setActiveItemForAction(null);
      await loadData();
    });
  };

  const handleOpenComplete = (item: CustomerFollowupItem) => {
    setActiveItemForAction(item);
    setActionModalMode("complete");
    setResolutionNoteInput("");
  };

  const handleCompleteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItemForAction) return;

    startTransition(async () => {
      const res = await completeCustomerFollowup({
        followupId: activeItemForAction.id,
        requestId: activeItemForAction.customerServiceId,
        customerId,
        resolutionNote: resolutionNoteInput.trim() || null,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to complete follow-up.");
        return;
      }

      toast.success("Follow-up marked as completed.");
      setActionModalMode(null);
      setActiveItemForAction(null);
      await loadData();
    });
  };

  const handleOpenCancel = (item: CustomerFollowupItem) => {
    setActiveItemForAction(item);
    setActionModalMode("cancel");
    setResolutionNoteInput("");
  };

  const handleCancelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItemForAction) return;

    startTransition(async () => {
      const res = await cancelCustomerFollowup({
        followupId: activeItemForAction.id,
        requestId: activeItemForAction.customerServiceId,
        customerId,
        resolutionNote: resolutionNoteInput.trim() || null,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to cancel follow-up.");
        return;
      }

      toast.success("Follow-up cancelled.");
      setActionModalMode(null);
      setActiveItemForAction(null);
      await loadData();
    });
  };

  const getPriorityBadge = (item: CustomerFollowupItem) => {
    if (item.status === "completed") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
          Completed
        </span>
      );
    }
    if (item.status === "cancelled") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
          Cancelled
        </span>
      );
    }
    if (item.status === "rescheduled") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
          Rescheduled
        </span>
      );
    }

    switch (item.state) {
      case "overdue":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
            Overdue
          </span>
        );
      case "today":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
            Due Today
          </span>
        );
      case "tomorrow":
      case "upcoming":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
            Upcoming
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
            Open
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4 animate-pulse">
        <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-rose-700 dark:text-rose-300 text-sm">
        <div className="flex items-center gap-2 font-bold mb-1">
          <AlertTriangle className="h-4 w-4" />
          <span>Unable to load customer follow-ups</span>
        </div>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  const counts = summary?.counts || { total: 0, pending: 0, overdue: 0, today: 0, upcoming: 0, completed: 0 };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-2xs">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-violet-600" />
            <span>Follow-ups & Reminders</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Internal shop reminders, missing document requests, and callbacks for {customerName}
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <Plus className="h-4 w-4" />
          <span>Add Follow-up</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setSelectedFilter("pending")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors min-h-[36px] ${
            selectedFilter === "pending"
              ? "bg-violet-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50"
          }`}
        >
          Pending ({counts.pending})
        </button>
        {counts.overdue > 0 && (
          <button
            type="button"
            onClick={() => setSelectedFilter("overdue")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors min-h-[36px] ${
              selectedFilter === "overdue"
                ? "bg-rose-600 text-white shadow-2xs"
                : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 border border-rose-200 dark:border-rose-800 hover:bg-rose-100"
            }`}
          >
            Overdue ({counts.overdue})
          </button>
        )}
        {counts.today > 0 && (
          <button
            type="button"
            onClick={() => setSelectedFilter("today")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors min-h-[36px] ${
              selectedFilter === "today"
                ? "bg-amber-600 text-white shadow-2xs"
                : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
            }`}
          >
            Today ({counts.today})
          </button>
        )}
        <button
          type="button"
          onClick={() => setSelectedFilter("upcoming")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors min-h-[36px] ${
            selectedFilter === "upcoming"
              ? "bg-blue-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50"
          }`}
        >
          Upcoming ({counts.upcoming})
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter("completed")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors min-h-[36px] ${
            selectedFilter === "completed"
              ? "bg-emerald-600 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50"
          }`}
        >
          Completed ({counts.completed})
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter("all")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors min-h-[36px] ${
            selectedFilter === "all"
              ? "bg-slate-800 text-white shadow-2xs"
              : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50"
          }`}
        >
          All History ({counts.total})
        </button>
      </div>

      {/* Follow-up Cards List */}
      {filteredFollowups.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl space-y-2">
          <CalendarClock className="h-8 w-8 text-slate-300 dark:text-zinc-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300">
            {selectedFilter === "pending"
              ? "No pending follow-ups"
              : `No follow-ups in "${selectedFilter}"`}
          </h4>
          <p className="text-xs text-slate-400 dark:text-zinc-500">
            {selectedFilter === "pending"
              ? "All scheduled tasks and reminders for this customer have been resolved."
              : "Try switching to another filter or create a new follow-up reminder above."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFollowups.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs hover:border-violet-300 transition-all space-y-3"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getPriorityBadge(item)}
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {item.note || item.serviceName}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>Scheduled: {formatKolkataDateTime(item.followUpAt)}</span>
                </div>
              </div>

              {/* Service & Request Context */}
              <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                <div className="text-slate-500 dark:text-zinc-400 truncate">
                  <span className="font-semibold text-slate-700 dark:text-zinc-300">Context: </span>
                  <span>{item.serviceName}</span>
                  {item.requestNumber && (
                    <span className="ml-1 text-slate-400">({item.requestNumber})</span>
                  )}
                </div>

                {item.status === "completed" && item.completedAt && (
                  <span className="text-[11px] text-emerald-600 font-medium">
                    Done: {formatKolkataDateTime(item.completedAt)}
                  </span>
                )}
              </div>

              {/* Resolution Note if any */}
              {item.resolutionNote && (
                <div className="p-2.5 bg-slate-50 dark:bg-zinc-800/60 rounded-xl text-xs text-slate-600 dark:text-zinc-400">
                  <span className="font-semibold text-slate-700 dark:text-zinc-300">Resolution: </span>
                  {item.resolutionNote}
                </div>
              )}

              {/* Operator Action Buttons (Only for open items) */}
              {item.status === "open" && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenComplete(item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Complete</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenReschedule(item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Reschedule</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenCancel(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-medium transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Cancel</span>
                    </button>
                  </div>

                  <Link
                    href={`/requests/${item.customerServiceId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700 px-2 py-1 min-h-[36px]"
                  >
                    <span>Request Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL: ADD FOLLOW-UP */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center text-violet-600">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Schedule Follow-up</h4>
                  <p className="text-[11px] text-slate-500">For {customerName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Reason / Purpose <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Call for Missing Aadhaar OTP / Collect Trade License"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-violet-500 min-h-[44px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Scheduled Date & Time (IST) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={followUpAtInput}
                  onChange={(e) => setFollowUpAtInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-violet-500 min-h-[44px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Context / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional context or customer requirements"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Follow-up</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESCHEDULE */}
      {actionModalMode === "reschedule" && activeItemForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-violet-600" />
                <span>Reschedule Follow-up</span>
              </h4>
              <button
                type="button"
                onClick={() => setActionModalMode(null)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  New Date & Time (IST) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={rescheduleAtInput}
                  onChange={(e) => setRescheduleAtInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-violet-500 min-h-[44px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Updated Reason / Note
                </label>
                <input
                  type="text"
                  value={rescheduleNoteInput}
                  onChange={(e) => setRescheduleNoteInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-violet-500 min-h-[44px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Why was it rescheduled? (Audit Trail)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Customer requested call tomorrow afternoon"
                  value={resolutionNoteInput}
                  onChange={(e) => setResolutionNoteInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-violet-500 min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModalMode(null)}
                  disabled={isPending}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Confirm Reschedule</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COMPLETE */}
      {actionModalMode === "complete" && activeItemForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Mark Follow-up as Completed</span>
              </h4>
              <button
                type="button"
                onClick={() => setActionModalMode(null)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteSubmit} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                Are you sure you want to mark this follow-up as completed?
              </p>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Resolution Note (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Customer provided missing Aadhaar OTP over phone. Processed successfully."
                  value={resolutionNoteInput}
                  onChange={(e) => setResolutionNoteInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModalMode(null)}
                  disabled={isPending}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Mark Done</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CANCEL */}
      {actionModalMode === "cancel" && activeItemForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-rose-600" />
                <span>Cancel Follow-up</span>
              </h4>
              <button
                type="button"
                onClick={() => setActionModalMode(null)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                Are you sure you want to cancel this follow-up? This record will remain preserved in historical audit trail.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Reason for Cancellation (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Customer already visited shop in person"
                  value={resolutionNoteInput}
                  onChange={(e) => setResolutionNoteInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-rose-500 min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModalMode(null)}
                  disabled={isPending}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Confirm Cancellation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
