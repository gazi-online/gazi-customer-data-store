"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { RequestDrawerData } from "@/app/(dashboard)/requests/types";
import { getServiceRequestDrawerData } from "@/app/(dashboard)/requests/actions";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { RequestPriorityBadge } from "./RequestPriorityBadge";
import { getServiceRequestStatusLabel } from "@/lib/services/serviceRequestWorkflow";
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Calendar,
  Clock,
  Phone,
  User,
  FileText,
  History,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { CustomerServiceStatus } from "@/types/service";

interface RequestDrawerProps {
  requestId: string | null;
  onClose: () => void;
  onTransitionRequest?: (req: {
    id: string;
    requestNumber: string | null;
    status: CustomerServiceStatus;
    applicationReference: string | null;
  }) => void;
  refreshTrigger?: number;
}

export function RequestDrawer({
  requestId,
  onClose,
  onTransitionRequest,
  refreshTrigger = 0,
}: RequestDrawerProps) {
  const [data, setData] = useState<RequestDrawerData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sequence guard to avoid race conditions when switching requests quickly
  const fetchSequenceRef = useRef<number>(0);

  const loadData = (id: string) => {
    const currentSeq = ++fetchSequenceRef.current;
    setIsLoading(true);
    setErrorMessage(null);

    Promise.resolve().then(async () => {
      try {
        const res = await getServiceRequestDrawerData(id);

        if (fetchSequenceRef.current !== currentSeq) {
          return;
        }

        if (!res.data) {
          if (res.errorCode === "not_found") {
            setErrorMessage("Request is no longer available.");
          } else {
            setErrorMessage(res.error || "Failed to load service request details.");
          }
          setData(null);
        } else {
          setData(res.data);
        }
      } catch (err: unknown) {
        if (fetchSequenceRef.current === currentSeq) {
          const msg =
            err instanceof Error
              ? err.message
              : "An unexpected error occurred while loading request details.";
          setErrorMessage(msg);
          setData(null);
        }
      } finally {
        if (fetchSequenceRef.current === currentSeq) {
          setIsLoading(false);
        }
      }
    });
  };

  // Load or reload on requestId or refreshTrigger change
  useEffect(() => {
    if (!requestId) return;

    let isCancelled = false;
    const currentSeq = ++fetchSequenceRef.current;

    Promise.resolve().then(async () => {
      if (isCancelled) return;
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const res = await getServiceRequestDrawerData(requestId);
        if (isCancelled || fetchSequenceRef.current !== currentSeq) return;

        if (!res.data) {
          if (res.errorCode === "not_found") {
            setErrorMessage("Request is no longer available.");
          } else {
            setErrorMessage(res.error || "Failed to load service request details.");
          }
          setData(null);
        } else {
          setData(res.data);
        }
      } catch (err: unknown) {
        if (isCancelled || fetchSequenceRef.current !== currentSeq) return;
        const msg =
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while loading request details.";
        setErrorMessage(msg);
        setData(null);
      } finally {
        if (!isCancelled && fetchSequenceRef.current === currentSeq) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [requestId, refreshTrigger]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && requestId) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestId, onClose]);

  if (!requestId) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast.success(`Copied ${label} to clipboard`);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => {
    return "₹" + Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || isNaN(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-lg bg-white dark:bg-zinc-900 shadow-2xl border-l border-slate-200 dark:border-zinc-800 flex flex-col h-full animate-in slide-in-from-right duration-200">
          {/* Drawer Top Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-900/80 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Request Inspection
              </span>
              {data?.requestNumber && (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200">
                    {data.requestNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(data.requestNumber!, "Request Number")}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded transition-colors"
                    title="Copy Request Number"
                    aria-label="Copy Request Number"
                  >
                    {copiedKey === data.requestNumber ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadData(requestId)}
                disabled={isLoading}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh Details"
                aria-label="Refresh Details"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>

              {data && (
                <Link
                  href={`/requests/${data.id}`}
                  className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Open Full Workspace"
                  aria-label="Open Full Workspace"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Drawer Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {isLoading && !data ? (
              /* Loading Skeleton */
              <div className="space-y-4 animate-pulse">
                <div className="h-16 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
                <div className="h-32 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
                <div className="h-24 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
                <div className="h-28 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
                <div className="h-36 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
              </div>
            ) : errorMessage ? (
              /* Error State */
              <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-center space-y-3">
                <AlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
                <h4 className="text-sm font-bold text-red-800 dark:text-red-300">
                  Failed to Load Request
                </h4>
                <p className="text-xs text-red-600 dark:text-red-400 max-w-xs mx-auto">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={() => loadData(requestId)}
                  className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            ) : data ? (
              <>
                {/* 1. HEADER SECTION: Status, Priority & Quick Action */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-800 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3
                        id="drawer-title"
                        className="text-base font-bold text-slate-900 dark:text-zinc-100"
                      >
                        {data.service.serviceName}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                        <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300">
                          {data.service.serviceCode}
                        </span>
                        {data.service.category && <span>• {data.service.category}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <RequestPriorityBadge priority={data.priority} />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-700/60 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                        Status:
                      </span>
                      <RequestStatusBadge status={data.status} />
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/requests/${data.id}`}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 rounded-xl transition-colors flex items-center gap-1 shadow-2xs"
                        title="Open Full Workspace"
                      >
                        <span>Workspace</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>

                      {onTransitionRequest && (
                        <button
                          type="button"
                          onClick={() =>
                            onTransitionRequest({
                              id: data.id,
                              requestNumber: data.requestNumber,
                              status: data.status,
                              applicationReference: data.applicationReference,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl transition-colors flex items-center gap-1 shadow-2xs"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Update Status</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. OVERVIEW: Operational Timeline & Metadata */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Operational Details</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800">
                      <span className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1 mb-1">
                        <Calendar className="h-3 w-3" />
                        Service Date
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-zinc-200">
                        {formatDate(data.serviceDate)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800">
                      <span className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1 mb-1">
                        <Calendar className="h-3 w-3" />
                        Due Date
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold ${
                            data.isOverdue
                              ? "text-red-600 dark:text-red-400 font-bold"
                              : "text-slate-800 dark:text-zinc-200"
                          }`}
                        >
                          {formatDate(data.dueDate)}
                        </span>
                        {data.isOverdue && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                            Overdue
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Portal & Application Reference */}
                  <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-zinc-400">Portal / Authority</span>
                      <span className="font-medium text-slate-800 dark:text-zinc-200">
                        {data.portalName || "General / None"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800/60">
                      <span className="text-slate-500 dark:text-zinc-400">Application Reference</span>
                      {data.applicationReference ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-medium text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700">
                            {data.applicationReference}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(data.applicationReference!, "Application Reference")
                            }
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded"
                            title="Copy Application Reference"
                          >
                            {copiedKey === data.applicationReference ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not set</span>
                      )}
                    </div>
                  </div>

                  {/* Rejection Reason Alert if rejected */}
                  {data.rejectionReason && (
                    <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Rejection Reason</span>
                      </div>
                      <p className="text-xs text-red-800 dark:text-red-300 pl-5">
                        {data.rejectionReason}
                      </p>
                    </div>
                  )}

                  {/* General Staff Notes */}
                  {data.notes && (
                    <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-1 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-zinc-300">
                        Request Notes
                      </span>
                      <p className="text-slate-600 dark:text-zinc-400 whitespace-pre-wrap">
                        {data.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* 3. CUSTOMER SNAPSHOT */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span>Customer Information</span>
                  </h4>

                  <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm">
                        {[data.customer.firstName, data.customer.middleName, data.customer.lastName]
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                      {data.customer.customerCode && (
                        <span className="font-mono text-xs text-slate-500 dark:text-zinc-400 px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-zinc-700">
                          {data.customer.customerCode}
                        </span>
                      )}
                    </div>

                    {data.customer.phone && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-zinc-800/60">
                        <span className="text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          Phone
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-slate-800 dark:text-zinc-200">
                            {data.customer.phone}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(data.customer.phone!, "Customer Phone")}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded"
                            title="Copy Phone Number"
                          >
                            {copiedKey === data.customer.phone ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/60 text-right">
                      <Link
                        href={`/customers/${data.customer.id}?tab=services`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <span>Open Customer Profile</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* 4. ATTACHED DOCUMENTS (Read-only Summary) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Attached Documents</span>
                    </h4>
                    <span className="text-xs font-semibold px-2 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                      {data.documents.length}
                    </span>
                  </div>

                  {data.documents.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-slate-400 dark:text-zinc-500">
                      No documents attached to this service request.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-3 rounded-xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900 dark:text-zinc-100 truncate" title={doc.documentName}>
                              {doc.documentName}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">
                              <span>{doc.documentType}</span>
                              <span>•</span>
                              <span className="capitalize">Tag: {doc.requirementTag}</span>
                              {doc.fileSize && (
                                <>
                                  <span>•</span>
                                  <span>{formatFileSize(doc.fileSize)}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0">
                            {doc.isVerified ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <ShieldCheck className="h-3 w-3" />
                                Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-zinc-300">
                                <ShieldAlert className="h-3 w-3" />
                                Unverified
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. WORKFLOW AUDIT HISTORY (Read-only Timeline) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5" />
                      <span>Workflow Audit History</span>
                    </h4>
                    <span className="text-xs text-slate-400 dark:text-zinc-500">Trigger-Owned</span>
                  </div>

                  {data.statusHistory.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-slate-400 dark:text-zinc-500">
                      No status transitions recorded yet.
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-zinc-800">
                      {data.statusHistory.map((item, idx) => (
                        <div key={item.id || idx} className="relative text-xs">
                          {/* Circle bullet */}
                          <div className="absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-white dark:border-zinc-900 bg-blue-600 dark:bg-blue-500 shadow-xs" />

                          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.fromStatus ? (
                                <>
                                  <span className="font-medium text-slate-700 dark:text-zinc-300">
                                    {getServiceRequestStatusLabel(item.fromStatus as CustomerServiceStatus)}
                                  </span>
                                  <ArrowRight className="h-3 w-3 text-slate-400" />
                                </>
                              ) : (
                                <span className="text-slate-400">Created as</span>
                              )}
                              <span className="font-bold text-slate-900 dark:text-zinc-100">
                                {getServiceRequestStatusLabel(item.toStatus as CustomerServiceStatus)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500 pt-1 border-t border-slate-100 dark:border-zinc-800/50">
                              <span>{formatDateTime(item.createdAt)}</span>
                              <span>Staff</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. BILLING & INVOICING (Read-only Summary) */}
                <div className="space-y-3 pb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Billing & Invoicing</span>
                  </h4>

                  <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-zinc-400">Service Fee</span>
                      <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm">
                        {formatCurrency(data.amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800/60">
                      <span className="text-slate-500 dark:text-zinc-400">Payment Status</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          data.paymentStatus === "paid"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : data.paymentStatus === "partial"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            : data.paymentStatus === "waived"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {data.paymentStatus}
                      </span>
                    </div>

                    {/* Invoices list */}
                    <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/60 space-y-2">
                      <span className="text-[11px] text-slate-400 dark:text-zinc-500 block font-medium">
                        Linked Invoice(s)
                      </span>

                      {data.invoices.length === 0 ? (
                        <p className="text-slate-400 italic text-[11px]">
                          No invoice generated for this service request yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {data.invoices.map((inv) => (
                            <div
                              key={inv.id}
                              className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 flex items-center justify-between"
                            >
                              <div className="flex flex-col">
                                <Link
                                  href={`/invoices/${inv.invoiceId}`}
                                  className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                >
                                  <span>{inv.invoiceNumber}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                                <span className="text-[10px] text-slate-400">
                                  {formatDate(inv.invoiceDate)} • Total: {formatCurrency(inv.totalAmount)}
                                </span>
                              </div>

                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                                {inv.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
