"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Phone,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Send,
  ExternalLink,
  Users,
  Search,
  RefreshCw,
} from "lucide-react";
import {
  ContactQueueItem,
  COMMUNICATION_TEMPLATES,
  renderTemplate,
  generateWhatsAppLink,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationOutcome,
} from "@/lib/communications/communicationEngine";
import {
  recordCommunication,
  getContactQueue,
  getShopBusinessName,
} from "@/app/(dashboard)/communications/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";
import { PageHeader } from "@/components/ui/PageHeader";

interface CommunicationCenterViewProps {
  initialQueue?: ContactQueueItem[];
  shopName?: string;
}

export function CommunicationCenterView({
  initialQueue,
  shopName,
}: CommunicationCenterViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: queue = initialQueue || [],
    isLoading: isQueueLoading,
    isError: isQueueError,
    refetch: refetchQueue,
    isFetching: isQueueFetching,
  } = useQuery({
    queryKey: queryKeys.communications.queue(DASHBOARD_MEMORY_SCOPE),
    queryFn: () => getContactQueue(),
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: currentShopName = shopName || "Shop" } = useQuery({
    queryKey: queryKeys.communications.shopName(DASHBOARD_MEMORY_SCOPE),
    queryFn: () => getShopBusinessName(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeModalItem, setActiveModalItem] = useState<ContactQueueItem | null>(null);
  const [modalMode, setModalMode] = useState<"whatsapp" | "log">("whatsapp");

  // WhatsApp template draft state
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("followup_reminder");
  const [customMessage, setCustomMessage] = useState<string>("");

  // Log communication modal state
  const [logChannel, setLogChannel] = useState<CommunicationChannel>("phone");
  const [logDirection, setLogDirection] = useState<CommunicationDirection>("outbound");
  const [logOutcome, setLogOutcome] = useState<CommunicationOutcome>("contacted");
  const [logNotes, setLogNotes] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Open WhatsApp Modal
  const handleOpenWhatsApp = (item: ContactQueueItem) => {
    setActiveModalItem(item);
    setModalMode("whatsapp");
    const tmplKey = item.recommendedTemplate || "followup_reminder";
    setSelectedTemplateKey(tmplKey);
    const msg = renderTemplate(tmplKey, {
      customer_name: item.customerName,
      service_name: item.serviceName || undefined,
      request_number: item.requestNumber || undefined,
      follow_up_date: item.dueDate ? new Date(item.dueDate).toLocaleDateString("en-IN") : "Today",
      document_name: item.documentName || undefined,
      expiry_date: item.dueDate ? new Date(item.dueDate).toLocaleDateString("en-IN") : undefined,
      amount_due: item.amountDue || "0",
      shop_name: currentShopName,
    });
    setCustomMessage(msg);
  };

  // Open Log Modal
  const handleOpenLog = (item: ContactQueueItem) => {
    setActiveModalItem(item);
    setModalMode("log");
    setLogChannel("phone");
    setLogDirection("outbound");
    setLogOutcome("contacted");
    setLogNotes("");
  };

  const handleTemplateChange = (newKey: string) => {
    setSelectedTemplateKey(newKey);
    if (!activeModalItem) return;
    const msg = renderTemplate(newKey, {
      customer_name: activeModalItem.customerName,
      service_name: activeModalItem.serviceName || undefined,
      request_number: activeModalItem.requestNumber || undefined,
      follow_up_date: activeModalItem.dueDate
        ? new Date(activeModalItem.dueDate).toLocaleDateString("en-IN")
        : "Today",
      document_name: activeModalItem.documentName || undefined,
      expiry_date: activeModalItem.dueDate
        ? new Date(activeModalItem.dueDate).toLocaleDateString("en-IN")
        : undefined,
      amount_due: activeModalItem.amountDue || "0",
      shop_name: currentShopName,
    });
    setCustomMessage(msg);
  };

  const handleLaunchWhatsApp = () => {
    if (!activeModalItem || !activeModalItem.customerPhone) {
      toast.error("Customer does not have a registered mobile number");
      return;
    }
    const link = generateWhatsAppLink(activeModalItem.customerPhone, customMessage);
    if (!link) {
      toast.error("Invalid phone format for WhatsApp. Must be a valid Indian mobile.");
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");

    // Auto-record outbound WhatsApp communication
    startTransition(async () => {
      try {
        await recordCommunication({
          customerId: activeModalItem.customerId,
          customerServiceId: activeModalItem.requestId,
          channel: "whatsapp",
          direction: "outbound",
          templateKey: selectedTemplateKey,
          messageSnapshot: customMessage,
          outcome: "contacted",
          notes: "Launched via Communication Center WhatsApp link",
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communications.queue(DASHBOARD_MEMORY_SCOPE),
        });
        toast.success("WhatsApp opened and contact logged to history!");
        setActiveModalItem(null);
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to log communication");
      }
    });
  };

  const handleSubmitLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalItem) return;

    startTransition(async () => {
      try {
        await recordCommunication({
          customerId: activeModalItem.customerId,
          customerServiceId: activeModalItem.requestId,
          channel: logChannel,
          direction: logDirection,
          outcome: logOutcome,
          notes: logNotes.trim() || null,
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communications.queue(DASHBOARD_MEMORY_SCOPE),
        });
        toast.success("Communication recorded successfully!");
        setActiveModalItem(null);
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to record communication");
      }
    });
  };

  // Filter queue
  const filteredQueue = queue.filter((item) => {
    if (filterType !== "all") {
      if (filterType === "followups" && !item.type.startsWith("followup")) return false;
      if (filterType === "renewals" && !item.type.startsWith("doc_")) return false;
      if (filterType === "actions" && item.type !== "request_action") return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.customerName.toLowerCase().includes(q);
      const matchPhone = item.customerPhone?.includes(q);
      const matchRef = item.requestNumber?.toLowerCase().includes(q);
      const matchService = item.serviceName?.toLowerCase().includes(q);
      const matchDoc = item.documentName?.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchRef && !matchService && !matchDoc) return false;
    }
    return true;
  });

  const countOverdue = queue.filter((i) => i.type === "followup_overdue" || i.type === "doc_expired").length;
  const countToday = queue.filter((i) => i.type === "followup_today").length;
  const countActions = queue.filter((i) => i.type === "request_action").length;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Communication & Reminder Center"
        description="Actionable daily outreach queue for follow-ups, document renewals, and service collections."
        icon={MessageSquare}
        iconVariant="badge"
        actions={
          <button
            onClick={() => refetchQueue()}
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isQueueFetching ? "animate-spin" : ""}`} />
            Refresh Queue
          </button>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total In Queue</span>
            <Users className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{queue.length}</div>
          <div className="text-xs text-slate-500 mt-1">Pending contacts</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-xs bg-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-500">Overdue / Expired</span>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-2">{countOverdue}</div>
          <div className="text-xs text-rose-500 mt-1">Immediate action needed</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs bg-amber-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">Due Today</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">{countToday}</div>
          <div className="text-xs text-amber-600 mt-1">Follow-ups scheduled today</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs bg-blue-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Action Required</span>
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-600 mt-2">{countActions}</div>
          <div className="text-xs text-blue-500 mt-1">Customer input awaited</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              filterType === "all" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Queue ({queue.length})
          </button>
          <button
            onClick={() => setFilterType("followups")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              filterType === "followups" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Follow-ups
          </button>
          <button
            onClick={() => setFilterType("renewals")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              filterType === "renewals" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Doc Renewals
          </button>
          <button
            onClick={() => setFilterType("actions")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              filterType === "actions" ? "bg-violet-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Action Required
          </button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, phone, ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
          />
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isQueueLoading ? (
          <div className="p-8 space-y-4 animate-pulse">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`comm-skel-${idx}`} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-3 w-48 bg-slate-100 rounded" />
                </div>
                <div className="h-7 w-20 bg-slate-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : isQueueError ? (
          <div className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900">Unable to load communication queue</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Please check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => refetchQueue()}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : filteredQueue.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900">Communication Queue Clear!</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              There are no pending reminders, overdue follow-ups, or expiring documents requiring customer contact.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Priority / Type</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Reason / Target</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Outreach Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredQueue.map((item) => {
                  const isUrgent = item.priority === "urgent";
                  const isHigh = item.priority === "high";

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isUrgent
                                ? "bg-rose-100 text-rose-700"
                                : isHigh
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.priority}
                          </span>
                          <span className="text-[11px] text-slate-500 capitalize">
                            {item.type.replace("_", " ")}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Link
                          href={`/customers/${item.customerId}`}
                          className="font-semibold text-slate-900 hover:text-violet-600 transition-colors block"
                        >
                          {item.customerName}
                        </Link>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Phone className="h-3 w-3 text-slate-400" />
                          <span>{item.customerPhone || "No Phone Registered"}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{item.reason}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          {item.requestId && (
                            <Link
                              href={`/requests/${item.requestId}`}
                              className="text-violet-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              Req #{item.requestNumber || item.requestId.slice(0, 8)}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </Link>
                          )}
                          {item.serviceName && <span>• {item.serviceName}</span>}
                          {item.documentName && <span>• {item.documentName}</span>}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.dueDate ? (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span>{new Date(item.dueDate).toLocaleDateString("en-IN")}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenWhatsApp(item)}
                            disabled={!item.customerPhone}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors shadow-xs ${
                              item.customerPhone
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            }`}
                            title={item.customerPhone ? "Send WhatsApp Message" : "No Phone"}
                          >
                            <Send className="h-3 w-3" />
                            WhatsApp
                          </button>

                          <button
                            onClick={() => handleOpenLog(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl shadow-xs transition-colors"
                          >
                            Log Contact
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* WHATSAPP TEMPLATE MODAL */}
      {activeModalItem && modalMode === "whatsapp" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  WA
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Send WhatsApp Outreach</h3>
                  <p className="text-xs text-slate-500">To: {activeModalItem.customerName} ({activeModalItem.customerPhone})</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Template Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Select Template</label>
              <select
                value={selectedTemplateKey}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {Object.values(COMMUNICATION_TEMPLATES).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name} ({t.category})
                  </option>
                ))}
              </select>
            </div>

            {/* Message Preview */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Message Preview (Editable)</label>
              <textarea
                rows={5}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 leading-relaxed"
              />
              <p className="text-[11px] text-slate-400">
                Variables have been safely resolved. You can freely edit this text before launching WhatsApp.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setActiveModalItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLaunchWhatsApp}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                {isPending ? "Opening..." : "Launch WhatsApp & Log"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOG COMMUNICATION MODAL */}
      {activeModalItem && modalMode === "log" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <form
            onSubmit={handleSubmitLog}
            className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Record Communication</h3>
                <p className="text-xs text-slate-500">Customer: {activeModalItem.customerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Channel</label>
                <select
                  value={logChannel}
                  onChange={(e) => setLogChannel(e.target.value as CommunicationChannel)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                >
                  <option value="phone">Phone Call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="in_person">In-Person Visit</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Direction</label>
                <select
                  value={logDirection}
                  onChange={(e) => setLogDirection(e.target.value as CommunicationDirection)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                >
                  <option value="outbound">Outbound (Shop $\rightarrow$ Customer)</option>
                  <option value="inbound">Inbound (Customer $\rightarrow$ Shop)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Outcome</label>
              <select
                value={logOutcome}
                onChange={(e) => setLogOutcome(e.target.value as CommunicationOutcome)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
              >
                <option value="contacted">Customer Contacted / Spoke</option>
                <option value="will_visit">Customer Will Visit Shop</option>
                <option value="docs_awaited">Customer Promised Documents</option>
                <option value="no_answer">No Answer / Switched Off</option>
                <option value="resolved">Matter Resolved</option>
                <option value="note_added">Informational Note</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Notes / Discussion Details</label>
              <textarea
                rows={3}
                placeholder="What was discussed or agreed upon..."
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setActiveModalItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                {isPending ? "Saving..." : "Save Communication"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
