"use client";

import { CustomerServiceStatus, ServiceRequestWorkflowStatus } from "@/types/service";
import { getServiceRequestStatusLabel } from "@/lib/services/serviceRequestWorkflow";
import {
  Clock,
  FileSearch,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  PackageCheck,
  XCircle,
  Ban,
  Archive
} from "lucide-react";

interface RequestStatusBadgeProps {
  status: CustomerServiceStatus | ServiceRequestWorkflowStatus;
  className?: string;
  showIcon?: boolean;
}

export function RequestStatusBadge({ status, className = "", showIcon = true }: RequestStatusBadgeProps) {
  const label = getServiceRequestStatusLabel(status);

  let style = "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  let Icon = Clock;

  switch (status) {
    case "pending":
      style = "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60";
      Icon = Clock;
      break;
    case "documents_pending":
      style = "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60";
      Icon = FileSearch;
      break;
    case "ready_to_submit":
      style = "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60";
      Icon = Send;
      break;
    case "submitted":
      style = "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60";
      Icon = Send;
      break;
    case "in_process":
    case "in_progress":
      style = "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60";
      Icon = Loader2;
      break;
    case "action_required":
      style = "bg-rose-100 text-rose-800 border-rose-300 font-bold dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 animate-pulse";
      Icon = AlertCircle;
      break;
    case "completed":
      style = "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60";
      Icon = CheckCircle2;
      break;
    case "delivered":
      style = "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60";
      Icon = PackageCheck;
      break;
    case "rejected":
      style = "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60";
      Icon = XCircle;
      break;
    case "cancelled":
      style = "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
      Icon = Ban;
      break;
    case "archived":
      style = "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
      Icon = Archive;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${style} ${className}`}
    >
      {showIcon && <Icon className={`h-3 w-3 shrink-0 ${status === "in_process" || status === "in_progress" ? "animate-spin" : ""}`} />}
      <span className="truncate">{label}</span>
    </span>
  );
}
