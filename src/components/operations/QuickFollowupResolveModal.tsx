"use client";

import React, { useState, useEffect } from "react";
import { X, CheckCircle2, Clock, Calendar, AlertCircle, Loader2 } from "lucide-react";
import { completeFollowup, rescheduleFollowup } from "@/app/(dashboard)/requests/actions";
import type { OperationAlert } from "@/lib/operations/operationsInboxQuery";
import { toast } from "sonner";

interface QuickFollowupResolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "complete" | "reschedule";
  alert: OperationAlert | null;
  onSuccess: () => void;
}

export function QuickFollowupResolveModal(props: QuickFollowupResolveModalProps) {
  if (!props.isOpen || !props.alert) return null;

  return (
    <QuickFollowupResolveDialog
      key={`${props.alert.followupId || props.alert.id}-${props.mode}`}
      {...props}
      alert={props.alert}
    />
  );
}

function QuickFollowupResolveDialog({
  onClose,
  mode,
  alert,
  onSuccess,
}: QuickFollowupResolveModalProps & { alert: OperationAlert }) {
  const [resolutionNote, setResolutionNote] = useState("");
  const [newNote, setNewNote] = useState(alert.followupNote || "");
  const [newFollowUpAt, setNewFollowUpAt] = useState(() => {
    if (mode === "reschedule") {
      try {
        const baseDate = alert.dueDate ? new Date(alert.dueDate) : new Date();
        const target = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
        const pad = (n: number) => n.toString().padStart(2, "0");
        return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
          target.getDate()
        )}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
      } catch {
        return "";
      }
    }
    return "";
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Keyboard dismiss (Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  const followupId = alert.followupId;
  const requestId = alert.requestId || alert.customerServiceId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!followupId || !requestId) {
      setFormError("Missing follow-up or request reference ID.");
      return;
    }

    if (mode === "reschedule") {
      if (!newFollowUpAt) {
        setFormError("Please select a new follow-up date and time.");
        return;
      }
      const parsed = new Date(newFollowUpAt);
      if (isNaN(parsed.getTime())) {
        setFormError("Invalid follow-up date and time format.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === "complete") {
        const res = await completeFollowup({
          followupId,
          requestId,
          resolutionNote: resolutionNote.trim() || undefined,
        });

        if (!res.success) {
          if (res.errorCode === "conflict") {
            toast.error(res.error || "Follow-up was already updated. Refreshing queue...");
            onSuccess();
            onClose();
            return;
          }
          setFormError(res.error || "Failed to complete follow-up.");
          toast.error(res.error || "Failed to complete follow-up.");
          return;
        }

        toast.success("Follow-up marked as completed.");
        onSuccess();
        onClose();
      } else {
        const res = await rescheduleFollowup({
          followupId,
          requestId,
          newFollowUpAt,
          newNote: newNote.trim() || undefined,
          resolutionNote: resolutionNote.trim() || undefined,
        });

        if (!res.success) {
          if (res.errorCode === "conflict") {
            toast.error(res.error || "Follow-up was already updated. Refreshing queue...");
            onSuccess();
            onClose();
            return;
          }
          setFormError(res.error || "Failed to reschedule follow-up.");
          toast.error(res.error || "Failed to reschedule follow-up.");
          return;
        }

        toast.success("Follow-up rescheduled successfully.");
        onSuccess();
        onClose();
      }
    } catch {
      setFormError("An unexpected error occurred. Please try again.");
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isComplete = mode === "complete";
  const titleId = `modal-title-${alert.id}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isComplete
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
              }`}
            >
              {isComplete ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            </div>
            <div>
              <h2
                id={titleId}
                className="text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight"
              >
                {isComplete ? "Complete Follow-up" : "Reschedule Follow-up"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {isComplete
                  ? "Mark scheduled customer task resolved directly"
                  : "Postpone or schedule next customer outreach"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Context Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 text-xs space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-slate-900 dark:text-zinc-100">
                {alert.customerName || "Customer"}
              </span>
              {alert.requestNumber && (
                <span className="font-mono text-[11px] font-bold text-slate-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-slate-200/80 dark:border-zinc-700">
                  Ref: {alert.requestNumber}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
              <Calendar className="h-3.5 w-3.5" />
              <span>Target:</span>
              <span className="font-medium text-slate-700 dark:text-zinc-300">
                {alert.formattedDueDate || alert.dueDate || "Not set"}
              </span>
            </div>

            {alert.followupNote && (
              <div className="pt-1.5 border-t border-slate-200/60 dark:border-zinc-700/60 text-slate-600 dark:text-zinc-400 italic">
                &ldquo;{alert.followupNote}&rdquo;
              </div>
            )}
          </div>

          {/* Reschedule Mode: Date/Time Picker */}
          {!isComplete && (
            <div className="space-y-1.5">
              <label
                htmlFor="reschedule-datetime-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300"
              >
                New Follow-up Date & Time <span className="text-rose-500">*</span>
              </label>
              <input
                id="reschedule-datetime-input"
                type="datetime-local"
                value={newFollowUpAt}
                onChange={(e) => setNewFollowUpAt(e.target.value)}
                disabled={isSubmitting}
                required
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all disabled:opacity-50"
              />
            </div>
          )}

          {/* Reschedule Mode: Optional New Note */}
          {!isComplete && (
            <div className="space-y-1.5">
              <label
                htmlFor="reschedule-new-note"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300"
              >
                Follow-up Task Note <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                id="reschedule-new-note"
                rows={2}
                placeholder="What action needs to be taken at the new time?"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all disabled:opacity-50 resize-none"
              />
            </div>
          )}

          {/* Resolution Note */}
          <div className="space-y-1.5">
            <label
              htmlFor="resolution-note-input"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300"
            >
              {isComplete ? "Resolution Note" : "Reason for Rescheduling"}{" "}
              <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="resolution-note-input"
              rows={2}
              placeholder={
                isComplete
                  ? "Outcome: e.g. Customer brought documents, OTP submitted, verified over phone..."
                  : "e.g. Customer requested call after 4 PM, bank server down today..."
              }
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 text-xs sm:text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all disabled:opacity-50 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`inline-flex items-center justify-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold text-white shadow-xs transition-all disabled:opacity-50 ${
                isComplete
                  ? "bg-emerald-600 hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500"
                  : "bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
              }`}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isComplete ? "Mark Completed" : "Confirm Reschedule"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
