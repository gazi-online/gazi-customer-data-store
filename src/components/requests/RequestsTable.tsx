"use client";

import Link from "next/link";
import { ServiceRequestDeskRow } from "@/app/(dashboard)/requests/types";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { RequestPriorityBadge } from "./RequestPriorityBadge";
import {
  Copy,
  Check,
  ExternalLink,
  Phone,
  FileText,
  Calendar,
  AlertTriangle
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface RequestsTableProps {
  requests: ServiceRequestDeskRow[];
}

export function RequestsTable({ requests }: RequestsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(`Copied ${label} to clipboard`);
    setTimeout(() => {
      setCopiedId(null);
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

  const formatCurrency = (amount: number) => {
    return "₹" + Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
        <thead>
          <tr className="bg-slate-50/90 dark:bg-zinc-900/90 border-b border-slate-200 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            <th className="py-3 px-4 w-[160px]">Request #</th>
            <th className="py-3 px-4 w-[200px]">Customer</th>
            <th className="py-3 px-4 w-[180px]">Service / Portal</th>
            <th className="py-3 px-4 w-[160px]">App Reference</th>
            <th className="py-3 px-3 text-center w-[90px]">Priority</th>
            <th className="py-3 px-4 text-center w-[150px]">Workflow Status</th>
            <th className="py-3 px-4 w-[130px]">Due Date</th>
            <th className="py-3 px-4 text-right w-[140px]">Fee & Payment</th>
            <th className="py-3 px-3 text-center w-[80px]">Docs</th>
            <th className="py-3 px-4 text-right w-[100px]">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
          {requests.map((req) => {
            return (
              <tr
                key={req.id}
                className={`hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors group ${
                  req.status === "action_required" ? "bg-rose-50/30 dark:bg-rose-950/10" : ""
                }`}
              >
                {/* 1. Request Number & Date */}
                <td className="py-3.5 px-4 align-top">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-zinc-100">
                        {req.requestNumber || "SR-PENDING"}
                      </span>
                      {req.requestNumber && (
                        <button
                          type="button"
                          onClick={() => handleCopy(req.requestNumber!, "Request #")}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                          title="Copy Request Number"
                          aria-label="Copy Request Number"
                        >
                          {copiedId === req.requestNumber ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3 w-3" />
                      {formatDate(req.serviceDate || req.createdAt)}
                    </span>
                  </div>
                </td>

                {/* 2. Customer */}
                <td className="py-3.5 px-4 align-top">
                  <div className="flex flex-col">
                    <Link
                      href={`/customers/${req.customerId}?tab=services`}
                      className="font-semibold text-slate-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[180px]"
                      title={req.customerName}
                    >
                      {req.customerName}
                    </Link>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      {req.customerPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-2.5 w-2.5 text-slate-400" />
                          {req.customerPhone}
                        </span>
                      )}
                      {req.customerCode && (
                        <span className="font-mono text-[10px] text-slate-400 dark:text-zinc-500">
                          {req.customerCode}
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* 3. Service & Portal */}
                <td className="py-3.5 px-4 align-top">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-800 dark:text-zinc-200 truncate max-w-[170px]" title={req.serviceName}>
                      {req.serviceName}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                        {req.serviceCode}
                      </span>
                      {req.portalName && (
                        <span className="truncate max-w-[110px]" title={`Portal: ${req.portalName}`}>
                          {req.portalName}
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* 4. Gov / App Reference */}
                <td className="py-3.5 px-4 align-top">
                  {req.applicationReference ? (
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700 truncate max-w-[125px]">
                        {req.applicationReference}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(req.applicationReference!, "Application Reference")}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                        title="Copy Application Reference"
                        aria-label="Copy Application Reference"
                      >
                        {copiedId === req.applicationReference ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-300 dark:text-zinc-600 text-xs italic">Not assigned</span>
                  )}
                </td>

                {/* 5. Priority */}
                <td className="py-3.5 px-3 align-top text-center">
                  <RequestPriorityBadge priority={req.priority} />
                </td>

                {/* 6. Workflow Status */}
                <td className="py-3.5 px-4 align-top text-center">
                  <RequestStatusBadge status={req.status} />
                </td>

                {/* 7. Due Date */}
                <td className="py-3.5 px-4 align-top">
                  <div className="flex flex-col">
                    <span className={`text-xs ${req.isOverdue ? "font-bold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-zinc-400"}`}>
                      {formatDate(req.dueDate)}
                    </span>
                    {req.isOverdue && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 dark:text-red-400 mt-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        OVERDUE
                      </span>
                    )}
                  </div>
                </td>

                {/* 8. Fee & Payment */}
                <td className="py-3.5 px-4 align-top text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100">
                      {formatCurrency(req.amount)}
                    </span>
                    <span
                      className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                        req.paymentStatus === "paid"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : req.paymentStatus === "partial"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : req.paymentStatus === "waived"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {req.paymentStatus}
                    </span>
                  </div>
                </td>

                {/* 9. Attached Docs Count */}
                <td className="py-3.5 px-3 align-top text-center">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400 font-medium">
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    {req.attachedDocumentCount}
                  </span>
                </td>

                {/* 10. Actions / Navigation */}
                <td className="py-3.5 px-4 align-top text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/customers/${req.customerId}?tab=services`}
                      className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Open Customer Profile"
                      aria-label={`Open profile of ${req.customerName}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
