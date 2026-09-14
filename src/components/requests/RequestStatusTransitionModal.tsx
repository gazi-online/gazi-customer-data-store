"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CustomerServiceStatus } from "@/types/service";
import {
  getAllowedServiceRequestTransitions,
  getServiceRequestStatusLabel,
} from "@/lib/services/serviceRequestWorkflow";
import { transitionServiceRequestStatus } from "@/app/(dashboard)/services/actions";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { toast } from "sonner";
import { X, ArrowRight, AlertTriangle, Loader2 } from "lucide-react";

interface RequestStatusTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  requestNumber: string | null;
  currentStatus: CustomerServiceStatus;
  existingApplicationReference?: string | null;
  onSuccess?: (newStatus: CustomerServiceStatus) => void;
}

export function RequestStatusTransitionModal({
  isOpen,
  onClose,
  requestId,
  requestNumber,
  currentStatus,
  existingApplicationReference,
  onSuccess,
}: RequestStatusTransitionModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 1. Derive canonical allowed target statuses, filtering out legacy in_progress
  const rawAllowed = getAllowedServiceRequestTransitions(currentStatus);
  const allowedTargets = rawAllowed.filter((st) => st !== "in_progress");

  // Form states
  const [selectedTarget, setSelectedTarget] = useState<CustomerServiceStatus | "">(
    allowedTargets.length > 0 ? allowedTargets[0] : ""
  );
  const [applicationReference, setApplicationReference] = useState<string>(
    existingApplicationReference || ""
  );
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPending, onClose]);

  if (!isOpen) return null;

  const isTerminal = allowedTargets.length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!selectedTarget) {
      setValidationError("Please select a target status.");
      return;
    }

    // Rejection reason validation
    if (selectedTarget === "rejected" && !rejectionReason.trim()) {
      setValidationError("A non-empty rejection reason is required when rejecting a request.");
      return;
    }

    startTransition(async () => {
      try {
        const payload: {
          customerServiceId: string;
          toStatus: CustomerServiceStatus;
          applicationReference?: string | null;
          rejectionReason?: string | null;
        } = {
          customerServiceId: requestId,
          toStatus: selectedTarget,
        };

        // Only supply applicationReference if the target is submitted or in_process or if an existing reference is preserved/modified
        if (selectedTarget === "submitted" || selectedTarget === "in_process") {
          payload.applicationReference = applicationReference.trim() || null;
        } else if (existingApplicationReference) {
          // Preserve existing application reference
          payload.applicationReference = existingApplicationReference;
        }

        if (selectedTarget === "rejected") {
          payload.rejectionReason = rejectionReason.trim();
        }

        const res = await transitionServiceRequestStatus(payload);

        if (res.error) {
          if (res.error.includes("Conflict") || res.error.includes("concurrently")) {
            toast.error("This request was updated elsewhere. Latest details have been refreshed.");
            router.refresh();
            if (onSuccess) onSuccess(selectedTarget);
            onClose();
            return;
          }

          setValidationError(res.error);
          toast.error(res.error);
          return;
        }

        toast.success(
          `Request ${requestNumber || "SR"} transitioned to ${getServiceRequestStatusLabel(
            selectedTarget
          )}.`
        );

        router.refresh();
        if (onSuccess) {
          onSuccess(selectedTarget);
        }
        onClose();
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during status transition.";
        setValidationError(msg);
        toast.error(msg);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transition-modal-title"
    >
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-900/50">
          <div>
            <h3
              id="transition-modal-title"
              className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"
            >
              Update Workflow Status
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                {requestNumber || "SR"}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Select permissible workflow progression state
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Current Status display */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 text-xs">
            <span className="font-medium text-slate-600 dark:text-zinc-400">Current Status</span>
            <RequestStatusBadge status={currentStatus} />
          </div>

          {isTerminal ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold">Terminal Status</p>
                <p className="text-amber-700 dark:text-amber-400">
                  This request is in the terminal <strong>{getServiceRequestStatusLabel(currentStatus)}</strong> state. No further outward status transitions are permitted by the workflow FSM.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Target Status Selector */}
              <div>
                <label
                  htmlFor="target-status-select"
                  className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-2"
                >
                  Target Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {allowedTargets.map((target) => (
                    <label
                      key={target}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        selectedTarget === target
                          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-600 shadow-xs"
                          : "border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="targetStatus"
                          value={target}
                          checked={selectedTarget === target}
                          onChange={() => {
                            setSelectedTarget(target);
                            setValidationError(null);
                          }}
                          disabled={isPending}
                          className="text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                        />
                        <span className="font-semibold text-slate-900 dark:text-zinc-100">
                          {getServiceRequestStatusLabel(target)}
                        </span>
                      </div>
                      <RequestStatusBadge status={target} />
                    </label>
                  ))}
                </div>
              </div>

              {/* Conditional Field: Rejection Reason (Mandatory when target is rejected) */}
              {selectedTarget === "rejected" && (
                <div className="space-y-1.5 animate-in fade-in duration-150">
                  <label
                    htmlFor="rejection-reason-input"
                    className="block text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider"
                  >
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="rejection-reason-input"
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => {
                      setRejectionReason(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="Provide detailed explanation for rejection (mandatory)..."
                    disabled={isPending}
                    required
                    className="w-full text-xs p-3 rounded-xl border border-red-300 dark:border-red-900/60 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-600"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    This reason will be recorded on the request and visible in audit history.
                  </p>
                </div>
              )}

              {/* Conditional Field: Application Reference (Optional when submitted or in_process) */}
              {(selectedTarget === "submitted" || selectedTarget === "in_process") && (
                <div className="space-y-1.5 animate-in fade-in duration-150">
                  <label
                    htmlFor="app-ref-input"
                    className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider"
                  >
                    Application / Ack Reference <span className="text-slate-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    id="app-ref-input"
                    type="text"
                    value={applicationReference}
                    onChange={(e) => setApplicationReference(e.target.value)}
                    placeholder="e.g. ACK-2026-987654 or Portal Token"
                    disabled={isPending}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Government portal tracking token or submission acknowledgment number.
                  </p>
                </div>
              )}

              {validationError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
            >
              {isTerminal ? "Close" : "Cancel"}
            </button>

            {!isTerminal && (
              <button
                type="submit"
                disabled={isPending || !selectedTarget || (selectedTarget === "rejected" && !rejectionReason.trim())}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Transitioning...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm Transition</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
