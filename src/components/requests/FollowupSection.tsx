"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  RotateCcw,
  Plus,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  scheduleFollowup,
  rescheduleFollowup,
  completeFollowup,
  cancelFollowup,
} from "@/app/(dashboard)/requests/actions";
import {
  RequestFollowupSummary,
} from "@/lib/operations/operationsQueryLayer";
import {
  formatKolkataDateTime,
  FollowupState,
} from "@/lib/operations/dateUtils";

interface FollowupSectionProps {
  requestId: string;
  summary: RequestFollowupSummary;
}

export function FollowupSection({ requestId, summary }: FollowupSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Form states
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [rescheduleDateTime, setRescheduleDateTime] = useState("");
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const active = summary.activeFollowup;
  const history = summary.history;

  // Close modals on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isScheduleOpen) setIsScheduleOpen(false);
        if (isRescheduleOpen) setIsRescheduleOpen(false);
        if (isCompleteOpen) setIsCompleteOpen(false);
        if (isCancelOpen) setIsCancelOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isScheduleOpen, isRescheduleOpen, isCompleteOpen, isCancelOpen]);

  // Open reschedule modal with pre-populated values
  const handleOpenReschedule = () => {
    if (!active) return;
    setRescheduleDateTime(active.followUpAt ? active.followUpAt.slice(0, 16) : "");
    setRescheduleNote(active.note || "");
    setResolutionNote("");
    setIsRescheduleOpen(true);
  };

  // Submit Schedule
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleDateTime) {
      toast.error("Please select a follow-up date and time.");
      return;
    }

    startTransition(async () => {
      const res = await scheduleFollowup({
        requestId,
        followUpAt: scheduleDateTime,
        note: scheduleNote,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to schedule follow-up.");
        return;
      }

      toast.success("Follow-up scheduled successfully.");
      setIsScheduleOpen(false);
      setScheduleDateTime("");
      setScheduleNote("");
      router.refresh();
    });
  };

  // Submit Reschedule
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !rescheduleDateTime) {
      toast.error("Please select a new follow-up date and time.");
      return;
    }

    startTransition(async () => {
      const res = await rescheduleFollowup({
        followupId: active.id,
        requestId,
        newFollowUpAt: rescheduleDateTime,
        newNote: rescheduleNote,
        resolutionNote: resolutionNote,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to reschedule follow-up.");
        return;
      }

      toast.success("Follow-up rescheduled successfully.");
      setIsRescheduleOpen(false);
      setRescheduleDateTime("");
      setRescheduleNote("");
      setResolutionNote("");
      router.refresh();
    });
  };

  // Submit Complete
  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) return;

    startTransition(async () => {
      const res = await completeFollowup({
        followupId: active.id,
        requestId,
        resolutionNote,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to complete follow-up.");
        return;
      }

      toast.success("Follow-up marked as completed.");
      setIsCompleteOpen(false);
      setResolutionNote("");
      router.refresh();
    });
  };

  // Submit Cancel
  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) return;

    startTransition(async () => {
      const res = await cancelFollowup({
        followupId: active.id,
        requestId,
        resolutionNote,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to cancel follow-up.");
        return;
      }

      toast.success("Follow-up cancelled.");
      setIsCancelOpen(false);
      setResolutionNote("");
      router.refresh();
    });
  };

  return (
    <section className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <span>Follow-up & Operations</span>
        </h2>
        {active && (
          <FollowupStateBadge state={active.state || "today"} />
        )}
      </div>

      {/* Active Follow-up Card */}
      {active ? (
        <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block">
                Next Scheduled Follow-up (IST)
              </span>
              <p className="text-base font-extrabold text-slate-900 dark:text-zinc-100 mt-0.5">
                {formatKolkataDateTime(active.followUpAt)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleOpenReschedule}
                disabled={isPending}
                className="min-h-[44px] px-3.5 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 touch-manipulation"
              >
                <RotateCcw className="h-3.5 w-3.5 text-blue-600" />
                <span>Reschedule</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setResolutionNote("");
                  setIsCompleteOpen(true);
                }}
                disabled={isPending}
                className="min-h-[44px] px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 shadow-xs touch-manipulation"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Complete</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setResolutionNote("");
                  setIsCancelOpen(true);
                }}
                disabled={isPending}
                className="min-h-[44px] px-3 py-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-semibold transition-colors inline-flex items-center gap-1 disabled:opacity-50 touch-manipulation"
                title="Cancel Follow-up"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          </div>

          {active.note && (
            <div className="pt-2.5 border-t border-slate-200/60 dark:border-zinc-800 text-xs">
              <span className="font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">
                Scheduling Note:
              </span>
              <p className="text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {active.note}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-800 text-center space-y-3">
          <Clock className="h-8 w-8 text-slate-300 dark:text-zinc-600 mx-auto" />
          <div>
            <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">
              No Active Follow-up
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
              Schedule a reminder to contact the customer, review documents, or follow up on portal progress.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setScheduleDateTime("");
              setScheduleNote("");
              setIsScheduleOpen(true);
            }}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors shadow-xs touch-manipulation disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>Schedule Follow-up</span>
          </button>
        </div>
      )}

      {/* History Log Toggle */}
      {history.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 space-y-3">
          <button
            type="button"
            onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
            className="flex items-center justify-between w-full text-xs font-bold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              <span>Follow-up History ({history.length})</span>
            </span>
            <span className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline">
              {isHistoryExpanded ? "Hide History" : "View History"}
            </span>
          </button>

          {isHistoryExpanded && (
            <div className="space-y-2.5 pt-1">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-50/60 dark:bg-zinc-800/30 border border-slate-200/60 dark:border-zinc-800 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-semibold text-slate-800 dark:text-zinc-200">
                      Scheduled for: {formatKolkataDateTime(item.followUpAt)}
                    </span>
                    <HistoryStatusBadge status={item.status} />
                  </div>

                  {item.note && (
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                      <span className="font-medium text-slate-500">Note: </span>
                      {item.note}
                    </p>
                  )}

                  {item.resolutionNote && (
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 p-2 rounded-lg border border-slate-100 dark:border-zinc-800">
                      <span className="font-medium text-slate-500">Resolution: </span>
                      {item.resolutionNote}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-zinc-800/40">
                    <span>Created: {formatKolkataDateTime(item.createdAt)}</span>
                    {item.completedAt && (
                      <span>Completed: {formatKolkataDateTime(item.completedAt)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL 1: SCHEDULE FOLLOW-UP ──────────────────────────────────── */}
      {isScheduleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-modal-title"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3
                id="schedule-modal-title"
                className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"
              >
                <CalendarClock className="h-5 w-5 text-violet-600" />
                <span>Schedule Follow-up</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                aria-label="Close schedule modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Follow-up Date & Time (IST) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={scheduleDateTime}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                  aria-required="true"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Scheduling Note (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Call customer to verify OTP or inform trade license fee..."
                  value={scheduleNote}
                  onChange={(e) => setScheduleNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  disabled={isPending}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 font-semibold touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  aria-busy={isPending}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold inline-flex items-center gap-1.5 disabled:opacity-50 touch-manipulation"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Schedule</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: RESCHEDULE FOLLOW-UP ────────────────────────────────── */}
      {isRescheduleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-modal-title"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3
                id="reschedule-modal-title"
                className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"
              >
                <RotateCcw className="h-5 w-5 text-blue-600" />
                <span>Reschedule Follow-up</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsRescheduleOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                aria-label="Close reschedule modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  New Date & Time (IST) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={rescheduleDateTime}
                  onChange={(e) => setRescheduleDateTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  aria-required="true"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Updated Follow-up Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Reason for Rescheduling (Audit Resolution Note)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Customer requested call after 5 PM, portal under maintenance..."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRescheduleOpen(false)}
                  disabled={isPending}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 font-semibold touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  aria-busy={isPending}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold inline-flex items-center gap-1.5 disabled:opacity-50 touch-manipulation"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Confirm Reschedule</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: COMPLETE FOLLOW-UP ──────────────────────────────────── */}
      {isCompleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-modal-title"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3
                id="complete-modal-title"
                className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>Mark Follow-up as Completed</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCompleteOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                aria-label="Close complete modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCompleteSubmit} className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-zinc-400">
                Confirm completion of follow-up for{" "}
                <span className="font-bold text-slate-900 dark:text-zinc-100">
                  {formatKolkataDateTime(active?.followUpAt)}
                </span>
                .
              </p>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Resolution / Outcome Note (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Customer provided signed document, payment collected, status updated..."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCompleteOpen(false)}
                  disabled={isPending}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 font-semibold touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  aria-busy={isPending}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1.5 disabled:opacity-50 touch-manipulation"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Mark Completed</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: CANCEL FOLLOW-UP ────────────────────────────────────── */}
      {isCancelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3
                id="cancel-modal-title"
                className="text-base font-bold text-rose-600 flex items-center gap-2"
              >
                <XCircle className="h-5 w-5 text-rose-600" />
                <span>Cancel Follow-up</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCancelOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                aria-label="Close cancel modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCancelSubmit} className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-zinc-400">
                Are you sure you want to cancel the scheduled follow-up? Operational history will be preserved.
              </p>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Cancellation Reason (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Request was delivered early, customer cancelled..."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCancelOpen(false)}
                  disabled={isPending}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 font-semibold touch-manipulation"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  aria-busy={isPending}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 disabled:opacity-50 touch-manipulation"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Confirm Cancel</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function FollowupStateBadge({ state }: { state: FollowupState }) {
  switch (state) {
    case "today":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
          Due Today
        </span>
      );
    case "overdue":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
          Overdue
        </span>
      );
    case "tomorrow":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
          Tomorrow
        </span>
      );
    case "upcoming":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300">
          Upcoming
        </span>
      );
    case "completed":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
          Completed
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400">
          Cancelled
        </span>
      );
    case "rescheduled":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300">
          Rescheduled
        </span>
      );
    default:
      return null;
  }
}

function HistoryStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Completed
        </span>
      );
    case "cancelled":
      return (
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
          Cancelled
        </span>
      );
    case "rescheduled":
      return (
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
          Rescheduled
        </span>
      );
    case "open":
      return (
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          Open
        </span>
      );
    default:
      return (
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
          {status}
        </span>
      );
  }
}
