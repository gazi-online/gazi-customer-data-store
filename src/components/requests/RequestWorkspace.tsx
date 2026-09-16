import Link from "next/link";
import { RequestDrawerData, calculateRequestBillingSummary } from "@/app/(dashboard)/requests/types";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { RequestPriorityBadge } from "./RequestPriorityBadge";
import { RequestWorkspaceActions, CopyButton } from "./RequestWorkspaceActions";
import { RequestDocumentManager } from "./RequestDocumentManager";
import { RequestBillingControls } from "./RequestBillingControls";
import { RequestInvoiceRowActions } from "./RequestInvoiceRowActions";
import { FollowupSection } from "./FollowupSection";
import { RequestFollowupSummary } from "@/lib/operations/operationsQueryLayer";
import { formatKolkataDateTime } from "@/lib/operations/dateUtils";
import { getServiceRequestStatusLabel } from "@/lib/services/serviceRequestWorkflow";
import { CustomerServiceStatus } from "@/types/service";
import {
  ArrowLeft,
  Calendar,
  Phone,
  User,
  History,
  CreditCard,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  Globe,
  Receipt,
} from "lucide-react";

interface RequestWorkspaceProps {
  data: RequestDrawerData;
  followupSummary?: RequestFollowupSummary;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Not set";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "Not set";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount?: number | null): string {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(val);
}



export function RequestWorkspace({ data, followupSummary }: RequestWorkspaceProps) {
  const customerFullName = [
    data.customer.firstName,
    data.customer.middleName,
    data.customer.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  const displayRequestNumber =
    data.requestNumber || `SR-${data.id.slice(0, 8).toUpperCase()}`;

  const billingSummary =
    data.billingSummary || calculateRequestBillingSummary(data.invoices);

  // Unified chronological timeline aggregation (application-level, non-destructive)
  interface TimelineItem {
    id: string;
    timestamp: string;
    badgeColor: string;
    title: React.ReactNode;
    subtitle?: string;
    details?: string;
  }

  const timelineItems: TimelineItem[] = [];

  // 1. Status transitions
  data.statusHistory.forEach((item, idx) => {
    timelineItems.push({
      id: item.id || `status-${idx}`,
      timestamp: item.createdAt,
      badgeColor: "bg-blue-600 dark:bg-blue-500",
      title: item.fromStatus ? (
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-slate-700 dark:text-zinc-300">
            {getServiceRequestStatusLabel(item.fromStatus as CustomerServiceStatus)}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span className="font-bold text-slate-900 dark:text-zinc-100">
            {getServiceRequestStatusLabel(item.toStatus as CustomerServiceStatus)}
          </span>
        </span>
      ) : (
        <span className="font-bold text-slate-900 dark:text-zinc-100">
          Created as {getServiceRequestStatusLabel(item.toStatus as CustomerServiceStatus)}
        </span>
      ),
      subtitle: item.changedBy ? "Updated by Staff" : undefined,
      details: "Trigger-Owned",
    });
  });

  // 2. Document attachments
  data.documents.forEach((doc, idx) => {
    timelineItems.push({
      id: doc.id || `doc-${idx}`,
      timestamp: doc.createdAt || data.createdAt,
      badgeColor: "bg-purple-600 dark:bg-purple-500",
      title: (
        <span className="font-bold text-slate-900 dark:text-zinc-100">
          Document Attached: {doc.documentType}
        </span>
      ),
      subtitle: doc.documentName || undefined,
      details: doc.requirementTag ? `Requirement: ${doc.requirementTag}` : "Vault Document",
    });
  });

  // 3. Follow-up activities
  if (followupSummary?.history) {
    followupSummary.history.forEach((f) => {
      // Creation / Scheduled Event
      timelineItems.push({
        id: `fu-create-${f.id}`,
        timestamp: f.createdAt,
        badgeColor: "bg-violet-600 dark:bg-violet-500",
        title: (
          <span className="font-bold text-slate-900 dark:text-zinc-100">
            Follow-up Scheduled for {formatKolkataDateTime(f.followUpAt)}
          </span>
        ),
        subtitle: f.note || undefined,
        details: "Operational Schedule",
      });

      // Resolution events
      if (f.status === "completed" && f.completedAt) {
        timelineItems.push({
          id: `fu-comp-${f.id}`,
          timestamp: f.completedAt,
          badgeColor: "bg-emerald-600 dark:bg-emerald-500",
          title: (
            <span className="font-bold text-emerald-700 dark:text-emerald-400">
              Follow-up Completed
            </span>
          ),
          subtitle: f.resolutionNote || undefined,
          details: "Follow-up Resolved",
        });
      } else if (f.status === "rescheduled") {
        timelineItems.push({
          id: `fu-resched-${f.id}`,
          timestamp: f.updatedAt,
          badgeColor: "bg-purple-600 dark:bg-purple-400",
          title: (
            <span className="font-bold text-purple-700 dark:text-purple-400">
              Follow-up Rescheduled
            </span>
          ),
          subtitle: f.resolutionNote ? `Reason: ${f.resolutionNote}` : undefined,
          details: "Superseded by Reschedule",
        });
      } else if (f.status === "cancelled") {
        timelineItems.push({
          id: `fu-cancel-${f.id}`,
          timestamp: f.updatedAt,
          badgeColor: "bg-rose-600 dark:bg-rose-400",
          title: (
            <span className="font-bold text-rose-700 dark:text-rose-400">
              Follow-up Cancelled
            </span>
          ),
          subtitle: f.resolutionNote ? `Reason: ${f.resolutionNote}` : undefined,
          details: "Follow-up Cancelled",
        });
      }
    });
  }

  // Chronological sort: newest first
  timelineItems.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. TOP BREADCRUMB & HEADER */}
      <div className="space-y-4">
        <div>
          <Link
            href="/requests"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors py-1 focus:outline-hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Requests Desk</span>
          </Link>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-sm font-bold text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-zinc-700">
                {displayRequestNumber}
              </span>
              <CopyButton value={displayRequestNumber} label="Request Number" />
              <RequestStatusBadge status={data.status} />
              <RequestPriorityBadge priority={data.priority} />
              {data.isOverdue && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  OVERDUE
                </span>
              )}
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-zinc-100 tracking-tight">
                {data.service.serviceName}
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 mt-1 flex-wrap">
                <span className="font-mono text-xs text-slate-600 dark:text-zinc-300">
                  {data.service.serviceCode}
                </span>
                {data.service.category && <span>• {data.service.category}</span>}
                <span>• Customer:</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {customerFullName}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-zinc-800">
            <RequestWorkspaceActions
              request={{
                id: data.id,
                requestNumber: data.requestNumber,
                status: data.status,
                applicationReference: data.applicationReference,
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. MAIN 2-COLUMN OPERATIONAL WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: 2 Cols on Desktop */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Request Overview */}
          <section className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Request Overview</span>
            </h2>

            {/* Rejection Alert if present */}
            {data.rejectionReason && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-900 dark:text-red-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-red-800 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                  Rejection Reason:
                </p>
                <p className="pl-5 text-red-700 dark:text-red-300/90 font-medium">
                  {data.rejectionReason}
                </p>
              </div>
            )}

            {/* Portal & Reference Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  Target Portal
                </span>
                <p className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                  {data.portalName || (
                    <span className="text-slate-400 italic">Not specified</span>
                  )}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  Gov / App Reference
                </span>
                {data.applicationReference ? (
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                      {data.applicationReference}
                    </span>
                    <CopyButton
                      value={data.applicationReference}
                      label="Application Reference"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Not assigned</p>
                )}
              </div>
            </div>

            {/* Lifecycle Dates Grid */}
            <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
              <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-3">
                Key Dates & Timestamps
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-zinc-800/20 border border-slate-100 dark:border-zinc-800">
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    Service Date
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {formatDate(data.serviceDate)}
                  </span>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    data.isOverdue
                      ? "bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-900/60"
                      : "bg-slate-50/50 dark:bg-zinc-800/20 border-slate-100 dark:border-zinc-800"
                  }`}
                >
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    Due Date
                  </span>
                  <span
                    className={`font-semibold ${
                      data.isOverdue
                        ? "text-red-700 dark:text-red-400"
                        : "text-slate-800 dark:text-zinc-200"
                    }`}
                  >
                    {formatDate(data.dueDate)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-zinc-800/20 border border-slate-100 dark:border-zinc-800">
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    Created At
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {formatDateTime(data.createdAt)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-zinc-800/20 border border-slate-100 dark:border-zinc-800">
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    Completed At
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {data.completedAt ? formatDateTime(data.completedAt) : "—"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-zinc-800/20 border border-slate-100 dark:border-zinc-800">
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    Delivered At
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {data.deliveredAt ? formatDateTime(data.deliveredAt) : "—"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-zinc-800/20 border border-slate-100 dark:border-zinc-800">
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    Archived At
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    {data.archivedAt ? formatDateTime(data.archivedAt) : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* General Notes */}
            {data.notes && (
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 space-y-1">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
                  Request Notes
                </span>
                <p className="text-xs text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/30 p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 whitespace-pre-wrap leading-relaxed">
                  {data.notes}
                </p>
              </div>
            )}
          </section>

          {/* Follow-up & Operations Card */}
          {followupSummary && (
            <FollowupSection requestId={data.id} summary={followupSummary} />
          )}

          {/* Card 2: Attached Documents Lifecycle Manager */}
          <RequestDocumentManager
            requestId={data.id}
            customerId={data.customer.id}
            customerName={customerFullName}
            documents={data.documents}
          />

          {/* Card 3: Unified Activity & Audit Timeline */}
          <section className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                <History className="h-4 w-4" />
                <span>Workflow Audit History</span>
              </h2>
              <span className="text-xs text-slate-400 dark:text-zinc-500 font-medium">
                Trigger-Owned Timeline ({timelineItems.length})
              </span>
            </div>

            {timelineItems.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-slate-400 dark:text-zinc-500">
                No status transitions recorded yet.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-zinc-800">
                {timelineItems.map((item) => (
                  <div key={item.id} className="relative text-xs">
                    {/* Circle bullet */}
                    <div
                      className={`absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${item.badgeColor} shadow-xs`}
                    />

                    <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.title}
                      </div>

                      {item.subtitle && (
                        <p className="text-[11px] text-slate-600 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 p-2 rounded-lg border border-slate-100 dark:border-zinc-800/60 leading-relaxed">
                          {item.subtitle}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500 pt-1.5 border-t border-slate-100 dark:border-zinc-800/60">
                        <span>{formatKolkataDateTime(item.timestamp)}</span>
                        <span className="font-medium text-slate-600 dark:text-zinc-400">
                          {item.details || "System"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: 1 Col Sidebar on Desktop */}
        <div className="space-y-6">
          {/* Card 4: Customer Summary */}
          <section className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>Customer Profile</span>
              </h2>
              {data.customer.customerCode && (
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200/60 dark:border-zinc-700">
                  {data.customer.customerCode}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-base font-extrabold text-slate-900 dark:text-zinc-100">
                {customerFullName}
              </p>
              {data.customer.phone && (
                <p className="text-xs text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <a
                    href={`tel:${data.customer.phone}`}
                    className="hover:text-blue-600 transition-colors"
                  >
                    {data.customer.phone}
                  </a>
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
              <Link
                href={`/customers/${data.customer.id}?tab=services`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 dark:text-zinc-200 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors"
              >
                <span>View Customer Profile</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          {/* Card 5: Billing & Payments */}
          <section className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                <span>Billing & Payments</span>
                <span className="sr-only">Billing & Invoicing</span>
              </h2>

              {/* Display-only Payment Status Badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                  Payment Status:
                </span>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
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
            </div>

            {/* Financial Totals Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                  Total Invoiced
                </div>
                <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-zinc-100 mt-0.5">
                  {formatCurrency(billingSummary.totalInvoiced)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                  Total Paid
                </div>
                <div className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatCurrency(billingSummary.totalPaid)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                  Balance Due
                </div>
                <div
                  className={`text-base sm:text-lg font-extrabold mt-0.5 ${
                    billingSummary.balanceDue > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-900 dark:text-zinc-100"
                  }`}
                >
                  {formatCurrency(billingSummary.balanceDue)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                  Active Invoices
                </div>
                <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-zinc-100 mt-0.5">
                  {billingSummary.activeInvoiceCount}
                </div>
              </div>
            </div>

            {/* Interactive Billing Controls Island */}
            <RequestBillingControls
              requestId={data.id}
              customerId={data.customer.id}
              customerName={customerFullName}
              customerCode={data.customer.customerCode || undefined}
              serviceName={data.service.serviceName}
              defaultAmount={data.amount}
              paymentStatus={data.paymentStatus}
              billingSummary={billingSummary}
              invoices={data.invoices}
            />

            {/* Linked Invoices */}
            <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Invoices ({data.invoices.length})
                </span>
                {data.invoices.length > 0 && (
                  <span className="text-[11px] font-semibold text-slate-400">
                    {billingSummary.activeInvoiceCount} active
                  </span>
                )}
              </div>

              {data.invoices.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-slate-400 dark:text-zinc-500">
                  No invoices generated for this service request.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.invoices.map((inv) => (
                    <div
                      key={inv.id || inv.invoiceId}
                      className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Receipt className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-900 dark:text-zinc-100 font-mono text-sm">
                            {inv.invoiceNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              inv.status === "paid"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : inv.status === "partially_paid"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                : inv.status === "cancelled"
                                ? "bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400"
                                : inv.status === "draft"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                            }`}
                          >
                            {inv.status}
                          </span>
                          {inv.invoiceDate && (
                            <span className="text-[11px] text-slate-400">
                              {formatDate(inv.invoiceDate)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 text-[11px] text-slate-600 dark:text-zinc-400 font-medium">
                          <span>Total: {formatCurrency(inv.totalAmount)}</span>
                          <span>•</span>
                          <span>Paid: {formatCurrency(inv.paidAmount || 0)}</span>
                          <span>•</span>
                          <span
                            className={
                              inv.dueAmount > 0 ? "font-bold text-red-600 dark:text-red-400" : ""
                            }
                          >
                            Due: {formatCurrency(inv.dueAmount)}
                          </span>
                        </div>
                      </div>

                      <RequestInvoiceRowActions
                        requestId={data.id}
                        invoice={inv}
                        customerId={data.customer.id}
                        customerName={customerFullName}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
