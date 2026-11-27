"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  HelpCircle,
  Plus,
  Search,
  Phone,
  MessageSquare,
  CalendarClock,
  ArrowRightCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { EnquiryFormModal } from "./EnquiryFormModal";
import { EnquiryDetailModal } from "./EnquiryDetailModal";
import {
  getEnquiries,
  sendEnquiryFollowupWhatsApp,
} from "@/app/(dashboard)/enquiries/actions";
import type {
  EnquiryFormCustomerOption,
  EnquiryFormServiceOption,
  EnquiryRow,
  EnquiryStatus,
  EnquirySummaryStats,
} from "@/app/(dashboard)/enquiries/types";

interface EnquiriesViewProps {
  initialEnquiries: EnquiryRow[];
  initialStats: EnquirySummaryStats;
  customers: EnquiryFormCustomerOption[];
  services: EnquiryFormServiceOption[];
}

const STATUS_BADGE: Record<EnquiryStatus, { label: string; classes: string }> = {
  new: {
    label: "New",
    classes: "bg-blue-50 text-blue-700 border-blue-200",
  },
  in_progress: {
    label: "In Progress",
    classes: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  follow_up: {
    label: "Follow-up",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
  },
  quoted: {
    label: "Quoted",
    classes: "bg-purple-50 text-purple-700 border-purple-200",
  },
  converted: {
    label: "Converted",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  closed: {
    label: "Closed",
    classes: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

export function EnquiriesView({
  initialEnquiries,
  initialStats,
  customers,
  services,
}: EnquiriesViewProps) {
  const router = useRouter();
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>(initialEnquiries);
  const [stats, setStats] = useState<EnquirySummaryStats>(initialStats);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [followupsDueOnly, setFollowupsDueOnly] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<EnquiryRow | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refreshList = (opts?: {
    nextSearch?: string;
    nextStatus?: string;
    nextDueOnly?: boolean;
  }) => {
    const q = opts?.nextSearch !== undefined ? opts.nextSearch : search;
    const st = opts?.nextStatus !== undefined ? opts.nextStatus : statusFilter;
    const due =
      opts?.nextDueOnly !== undefined ? opts.nextDueOnly : followupsDueOnly;

    startTransition(async () => {
      const res = await getEnquiries({
        search: q,
        status: st,
        followupsDueOnly: due,
      });
      setEnquiries(res.enquiries);
      setStats(res.stats);
      router.refresh();
    });
  };

  const handleQuickWhatsApp = async (enq: EnquiryRow) => {
    setSendingId(enq.id);
    try {
      const res = await sendEnquiryFollowupWhatsApp(enq.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`WhatsApp follow-up sent to ${enq.customer_name}!`);
      refreshList();
    } catch {
      toast.error("Failed to send WhatsApp follow-up.");
    } finally {
      setSendingId(null);
    }
  };

  const isFollowUpOverdue = (iso: string | null, status: EnquiryStatus) => {
    if (!iso || ["converted", "closed"].includes(status)) return false;
    return new Date(iso).getTime() < Date.now();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <PageHeader
        title="Enquiries & Follow-ups"
        description="Track customer queries, schedule follow-ups, and send WhatsApp updates."
        icon={HelpCircle}
        iconVariant="gradient"
        actions={
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] sm:min-h-0 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Enquiry
          </button>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Total Enquiries</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {stats.total}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-semibold text-blue-600">Open / Active</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {stats.open}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !followupsDueOnly;
            setFollowupsDueOnly(next);
            refreshList({ nextDueOnly: next });
          }}
          className={`text-left border rounded-2xl p-4 shadow-2xs transition-colors ${
            followupsDueOnly
              ? "bg-amber-50 border-amber-300"
              : "bg-white border-slate-200 hover:bg-amber-50/40"
          }`}
        >
          <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            Follow-ups Due
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {stats.followUpDue}
          </div>
        </button>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Converted
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {stats.converted}
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              refreshList();
            }}
            className="relative w-full md:max-w-sm"
          >
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                refreshList({ nextSearch: e.target.value });
              }}
              placeholder="Search name, phone, subject, ENQ#..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "All"],
                ["new", "New"],
                ["follow_up", "Follow-up"],
                ["in_progress", "In Progress"],
                ["quoted", "Quoted"],
                ["converted", "Converted"],
                ["closed", "Closed"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setStatusFilter(key);
                  refreshList({ nextStatus: key });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === key
                    ? "bg-violet-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {enquiries.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={HelpCircle}
              title="No enquiries found"
              description="Add a new customer enquiry to track queries, follow-ups, and send WhatsApp updates."
              bordered={false}
              action={
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(true)}
                  className="inline-flex items-center px-4 py-2 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-xl"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Enquiry
                </button>
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Enquiry</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Subject / Note</th>
                    <th className="px-5 py-3.5">Follow-up</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enquiries.map((enq) => {
                    const badge = STATUS_BADGE[enq.status] || STATUS_BADGE.new;
                    const overdue = isFollowUpOverdue(enq.follow_up_at, enq.status);
                    return (
                      <tr
                        key={enq.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-5 py-4 align-top">
                          <div className="font-mono text-xs font-bold text-slate-800">
                            {enq.enquiry_number}
                          </div>
                          <div className="text-[11px] text-slate-400 capitalize mt-0.5">
                            {enq.source.replace("_", " ")}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {enq.customer_name}
                          </div>
                          <div className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {enq.phone}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top max-w-xs">
                          <div className="font-medium text-slate-900 truncate">
                            {enq.subject}
                          </div>
                          {enq.last_update_note && (
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              {enq.last_update_note}
                            </div>
                          )}
                          {enq.quoted_amount !== null && (
                            <div className="text-xs font-mono font-semibold text-violet-700 mt-0.5">
                              Quoted: ₹{Number(enq.quoted_amount).toLocaleString("en-IN")}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 align-top">
                          {enq.follow_up_at ? (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${
                                overdue
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-amber-50 text-amber-800 border border-amber-200"
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              {new Date(enq.follow_up_at).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-top text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQuickWhatsApp(enq)}
                              disabled={sendingId === enq.id}
                              title="Send Follow-up on WhatsApp"
                              className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors disabled:opacity-50"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedEnquiry(enq)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors"
                            >
                              <span>Manage</span>
                              <ArrowRightCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {enquiries.map((enq) => {
                const badge = STATUS_BADGE[enq.status] || STATUS_BADGE.new;
                return (
                  <div key={enq.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {enq.customer_name}
                        </div>
                        <div className="text-xs font-mono text-slate-500">
                          {enq.phone} · {enq.enquiry_number}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.classes}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-800">
                      {enq.subject}
                    </div>
                    {enq.follow_up_at && (
                      <div className="text-xs text-amber-700 font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Follow-up:{" "}
                        {new Date(enq.follow_up_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleQuickWhatsApp(enq)}
                        disabled={sendingId === enq.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedEnquiry(enq)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-violet-600 text-white"
                      >
                        Manage &amp; Update
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <EnquiryFormModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={() => {
          setIsNewModalOpen(false);
          refreshList();
        }}
        customers={customers}
        services={services}
      />

      <EnquiryDetailModal
        enquiry={selectedEnquiry}
        onClose={() => setSelectedEnquiry(null)}
        onUpdated={() => refreshList()}
      />
    </div>
  );
}
