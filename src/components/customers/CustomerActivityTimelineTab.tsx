"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  Briefcase,
  Receipt,
  CreditCard,
  MessageSquare,
  User,
  ArrowRight,
  Layers,
  AlertCircle,
  Clock,
  Archive,
  CalendarClock,
} from "lucide-react";
import {
  CustomerTimelineResult,
  CustomerTimelineEventType,
  getCustomerUnifiedTimeline,
} from "@/app/(dashboard)/actions/customerTimelineActions";

interface CustomerActivityTimelineTabProps {
  customerId: string;
  customerName?: string;
  initialData?: CustomerTimelineResult | null;
}

export function CustomerActivityTimelineTab({
  customerId,
  customerName = "Customer",
  initialData = null,
}: CustomerActivityTimelineTabProps) {
  const [timelineData, setTimelineData] = useState<CustomerTimelineResult | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<"all" | CustomerTimelineEventType | "financial" | "followups">("all");

  useEffect(() => {
    let isCancelled = false;
    async function loadTimeline() {
      if (initialData) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getCustomerUnifiedTimeline(customerId);
        if (!isCancelled) {
          setTimelineData(res);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load activity timeline";
          setError(msg);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }
    loadTimeline();
    return () => {
      isCancelled = true;
    };
  }, [customerId, initialData]);

  const filteredEvents = useMemo(() => {
    if (!timelineData) return [];
    if (selectedFilter === "all") return timelineData.events;
    if (selectedFilter === "financial") {
      return timelineData.events.filter(
        (e) => e.eventType === "invoice_created" || e.eventType === "payment_received"
      );
    }
    if (selectedFilter === "followups") {
      return timelineData.events.filter(
        (e) => e.eventType === "followup_scheduled" || e.eventType === "followup_completed"
      );
    }
    return timelineData.events.filter((e) => e.eventType === selectedFilter);
  }, [timelineData, selectedFilter]);

  const getEventIcon = (type: CustomerTimelineEventType) => {
    switch (type) {
      case "customer_created":
        return <User className="h-4 w-4 text-violet-600" />;
      case "document_uploaded":
        return <FileText className="h-4 w-4 text-blue-600" />;
      case "document_archived":
        return <Archive className="h-4 w-4 text-amber-600" />;
      case "service_request_created":
      case "service_request_status":
        return <Briefcase className="h-4 w-4 text-purple-600" />;
      case "invoice_created":
        return <Receipt className="h-4 w-4 text-indigo-600" />;
      case "payment_received":
        return <CreditCard className="h-4 w-4 text-emerald-600" />;
      case "communication_logged":
        return <MessageSquare className="h-4 w-4 text-teal-600" />;
      case "followup_scheduled":
      case "followup_completed":
        return <CalendarClock className="h-4 w-4 text-amber-600" />;
      default:
        return <Clock className="h-4 w-4 text-slate-500" />;
    }
  };

  const getBadgeClass = (variant: string) => {
    switch (variant) {
      case "success":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
      case "warning":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
      case "danger":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
      case "info":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
      case "purple":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4 animate-pulse">
        <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-3 w-1/2 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-rose-700 dark:text-rose-300 text-sm">
        <div className="flex items-center gap-2 font-bold mb-1">
          <AlertCircle className="h-4 w-4" />
          <span>Unable to compile activity timeline</span>
        </div>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  const stats = timelineData?.stats || {
    documents: 0,
    requests: 0,
    invoices: 0,
    payments: 0,
    communications: 0,
    followups: 0,
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Overview & Quick Category Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-2xs">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-600" />
            <span>Unified Customer History & Audit Trail</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Complete chronological record for {customerName} across documents, services, billing, and communications
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedFilter("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
              selectedFilter === "all"
                ? "bg-violet-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200"
            }`}
          >
            All ({timelineData?.totalCount || 0})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("service_request_created")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
              selectedFilter === "service_request_created"
                ? "bg-purple-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200"
            }`}
          >
            Services ({stats.requests})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("financial")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
              selectedFilter === "financial"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200"
            }`}
          >
            Billing ({stats.invoices + stats.payments})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("document_uploaded")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
              selectedFilter === "document_uploaded"
                ? "bg-blue-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200"
            }`}
          >
            Docs ({stats.documents})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("communication_logged")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
              selectedFilter === "communication_logged"
                ? "bg-teal-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200"
            }`}
          >
            Outreach ({stats.communications})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("followups")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors min-h-[32px] ${
              selectedFilter === "followups"
                ? "bg-amber-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200"
            }`}
          >
            Follow-ups ({stats.followups || 0})
          </button>
        </div>
      </div>

      {/* Timeline Stream */}
      {filteredEvents.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl space-y-2">
          <Clock className="h-8 w-8 text-slate-300 dark:text-zinc-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300">No events found</h4>
          <p className="text-xs text-slate-400 dark:text-zinc-500">
            No activity events recorded under the selected category.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-zinc-800 space-y-4">
          {filteredEvents.map((evt) => (
            <div
              key={evt.id}
              className="relative group bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-700/60 rounded-xl p-3.5 sm:p-4 shadow-2xs transition-all"
            >
              {/* Timeline Node Dot */}
              <div className="absolute -left-[30px] sm:-left-[38px] top-4 w-6 h-6 rounded-full bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 flex items-center justify-center group-hover:border-violet-500 group-hover:scale-110 transition-all">
                {getEventIcon(evt.eventType)}
              </div>

              {/* Event Content Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    {evt.title}
                  </span>
                  {evt.badge && (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getBadgeClass(
                        evt.badge.variant
                      )}`}
                    >
                      {evt.badge.label}
                    </span>
                  )}
                </div>

                <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 whitespace-nowrap">
                  {formatTimestamp(evt.timestamp)}
                </span>
              </div>

              {/* Event Description */}
              <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1">
                {evt.description}
              </p>

              {/* Contextual Link */}
              {evt.metadata?.linkUrl && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    {evt.metadata.reference ? `Ref: ${evt.metadata.reference}` : ""}
                  </span>
                  <Link
                    href={evt.metadata.linkUrl}
                    className="inline-flex items-center gap-1 font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 hover:underline min-h-[36px] px-1"
                  >
                    <span>View Details</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
