"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Send,
  Plus,
  CalendarClock,
  AlertCircle,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  recordCommunication,
  getRequestCommunications,
} from "@/app/(dashboard)/communications/actions";
import {
  scheduleFollowup,
  completeFollowup,
} from "@/app/(dashboard)/requests/actions";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationOutcome,
  renderTemplate,
  generateWhatsAppLink,
} from "@/lib/communications/communicationEngine";
import { formatKolkataDateTime } from "@/lib/operations/dateUtils";
import { ServiceRequestFollowupItem } from "@/lib/operations/operationsQueryLayer";
import { toast } from "sonner";
import { CustomerCommunicationItem } from "../customers/CustomerCommunicationsTimeline";

interface RequestCommunicationsSectionProps {
  requestId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  requestNumber?: string | null;
  serviceName?: string | null;
  activeFollowup?: ServiceRequestFollowupItem | null;
}

// Applicable templates for Request Workspace outreach
const APPLICABLE_TEMPLATES = [
  { key: "followup_reminder", label: "Follow-up Reminder" },
  { key: "docs_required", label: "Documents Required" },
  { key: "service_ready", label: "Service Ready / Collection" },
  { key: "service_completed", label: "Service Completed" },
  { key: "payment_reminder", label: "Payment Balance Reminder" },
] as const;

export function RequestCommunicationsSection({
  requestId,
  customerId,
  customerName,
  customerPhone,
  requestNumber,
  serviceName,
  activeFollowup,
}: RequestCommunicationsSectionProps) {
  const router = useRouter();
  const [communications, setCommunications] = useState<CustomerCommunicationItem[]>([]);
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Contact Form state
  const [channel, setChannel] = useState<CommunicationChannel>("phone");
  const [direction, setDirection] = useState<CommunicationDirection>("outbound");
  const [outcome, setOutcome] = useState<CommunicationOutcome>("contacted");
  const [notes, setNotes] = useState("");

  // Next-Action Bridge states
  // Case A: No active follow-up -> option to schedule
  const [scheduleNextFollowup, setScheduleNextFollowup] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");

  // Case B: Active follow-up exists -> option to complete
  const [completeCurrentFollowup, setCompleteCurrentFollowup] = useState(false);
  const [completionResolutionNote, setCompletionResolutionNote] = useState("");

  // WhatsApp Modal state
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("followup_reminder");
  const [customAmountDue, setCustomAmountDue] = useState<string>("0");

  useEffect(() => {
    getRequestCommunications(requestId).then((data) =>
      setCommunications(data as CustomerCommunicationItem[])
    );
  }, [requestId]);

  // Escape key handler for dialog accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        if (isContactModalOpen) setIsContactModalOpen(false);
        if (isWhatsAppModalOpen) setIsWhatsAppModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isContactModalOpen, isWhatsAppModalOpen, isPending]);

  // Render WhatsApp preview message
  const previewWhatsAppMessage = () => {
    return renderTemplate(selectedTemplateKey, {
      customer_name: customerName,
      service_name: serviceName || "Service",
      request_number: requestNumber || "—",
      amount_due: customAmountDue,
      follow_up_date: activeFollowup?.followUpAt
        ? formatKolkataDateTime(activeFollowup.followUpAt)
        : "Soon",
    });
  };

  // Launch WhatsApp with selected template
  const handleLaunchWhatsApp = () => {
    if (!customerPhone) {
      toast.error("Customer does not have a phone number registered");
      return;
    }

    const msg = previewWhatsAppMessage();
    const link = generateWhatsAppLink(customerPhone, msg);
    if (!link) {
      toast.error("Invalid phone format for WhatsApp");
      return;
    }

    const newWindow = window.open(link, "_blank", "noopener,noreferrer");
    if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
      toast.error("Popup was blocked by your browser. Please allow popups to open WhatsApp.");
      return;
    }

    // Auto-record outreach log truthfully
    startTransition(async () => {
      try {
        const saved = await recordCommunication({
          customerId,
          customerServiceId: requestId,
          channel: "whatsapp",
          direction: "outbound",
          templateKey: selectedTemplateKey,
          messageSnapshot: msg,
          outcome: "contacted",
          notes: `WhatsApp opened via template: ${selectedTemplateKey}`,
        });
        setCommunications((prev) => [saved as CustomerCommunicationItem, ...prev]);
        setIsWhatsAppModalOpen(false);
        toast.success("WhatsApp opened and outreach logged.");
        router.refresh();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to record communication.";
        toast.error(message);
      }
    });
  };

  // Handle Contact Log Submit with Truthful Multi-Mutation Handling
  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();

    if (scheduleNextFollowup && !activeFollowup) {
      if (!scheduleDateTime || isNaN(new Date(scheduleDateTime).getTime())) {
        toast.error("Please provide a valid follow-up date and time in IST.");
        return;
      }
    }

    startTransition(async () => {
      let commSaved: CustomerCommunicationItem | null = null;

      // STEP 1: Record communication (Audit Log of actual contact)
      try {
        const saved = await recordCommunication({
          customerId,
          customerServiceId: requestId,
          channel,
          direction,
          outcome,
          notes: notes.trim() || null,
        });
        commSaved = saved as CustomerCommunicationItem;
        setCommunications((prev) => [commSaved!, ...prev]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to record communication.";
        toast.error(message);
        return; // Communication failed; stop here.
      }

      // STEP 2: Optional Follow-up Secondary Mutation
      // Case A: Schedule Next Follow-up
      if (scheduleNextFollowup && !activeFollowup) {
        try {
          const scheduleRes = await scheduleFollowup({
            requestId,
            followUpAt: scheduleDateTime,
            note: scheduleNote.trim() || (notes.trim() ? `Follow-up from contact: ${notes.trim()}` : null),
          });

          if (scheduleRes.success) {
            toast.success("Contact logged and next follow-up scheduled successfully.");
            closeContactModal();
            router.refresh();
            return;
          } else {
            // Partial success: Communication saved, follow-up failed
            toast.warning(
              `Contact was logged, but the follow-up could not be scheduled: ${scheduleRes.error || "Schedule error"}. Please schedule it from the Follow-up section.`
            );
            closeContactModal();
            router.refresh();
            return;
          }
        } catch {
          toast.warning(
            "Contact was logged, but the follow-up could not be scheduled due to an unexpected error. Please schedule it from the Follow-up section."
          );
          closeContactModal();
          router.refresh();
          return;
        }
      }

      // Case B: Complete Active Follow-up
      if (completeCurrentFollowup && activeFollowup) {
        try {
          const completeRes = await completeFollowup({
            followupId: activeFollowup.id,
            requestId,
            resolutionNote:
              completionResolutionNote.trim() ||
              (notes.trim() ? `Completed via contact log: ${notes.trim()}` : null),
          });

          if (completeRes.success) {
            toast.success("Contact logged and active follow-up marked as completed.");
            closeContactModal();
            router.refresh();
            return;
          } else {
            // Partial success: Communication saved, follow-up completion failed
            toast.warning(
              `Contact was logged, but the active follow-up could not be completed: ${completeRes.error || "Completion error"}. Please complete it from the Follow-up section.`
            );
            closeContactModal();
            router.refresh();
            return;
          }
        } catch {
          toast.warning(
            "Contact was logged, but the active follow-up could not be completed due to an unexpected error. Please complete it from the Follow-up section."
          );
          closeContactModal();
          router.refresh();
          return;
        }
      }

      // Contact only (no follow-up action requested)
      toast.success("Contact logged successfully.");
      closeContactModal();
      router.refresh();
    });
  };

  const closeContactModal = () => {
    setIsContactModalOpen(false);
    setNotes("");
    setScheduleNextFollowup(false);
    setScheduleDateTime("");
    setScheduleNote("");
    setCompleteCurrentFollowup(false);
    setCompletionResolutionNote("");
  };

  const openContactModal = () => {
    // Reset defaults
    setChannel("phone");
    setDirection("outbound");
    setOutcome("contacted");
    setNotes("");
    setScheduleNextFollowup(false);
    setScheduleDateTime("");
    setScheduleNote("");
    setCompleteCurrentFollowup(false);
    setCompletionResolutionNote("");
    setIsContactModalOpen(true);
  };

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <span>Customer Outreach & Communications ({communications.length})</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
            Log customer contacts, launch template messages, and manage next actions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {customerPhone && (
            <button
              type="button"
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs touch-manipulation"
              title="Open WhatsApp Template Outreach"
            >
              <Send className="h-3.5 w-3.5" />
              <span>WhatsApp</span>
            </button>
          )}

          <button
            type="button"
            onClick={openContactModal}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-bold rounded-xl transition-colors shadow-xs touch-manipulation"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Log Contact</span>
          </button>
        </div>
      </div>

      {/* Communications List */}
      {communications.length === 0 ? (
        <div className="p-5 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-slate-400 dark:text-zinc-500">
          No outreach logged for this request yet. Click &quot;Log Contact&quot; or &quot;WhatsApp&quot; to record communication.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {communications.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 dark:text-zinc-200 capitalize">
                    {c.channel.replace("_", " ")}
                  </span>
                  <span className="text-slate-300 dark:text-zinc-600">•</span>
                  <span className="text-slate-500 dark:text-zinc-400 capitalize">{c.direction}</span>
                  <span className="text-slate-300 dark:text-zinc-600">•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold capitalize">
                    {c.outcome.replace("_", " ")}
                  </span>
                </div>
                <span className="text-slate-400 dark:text-zinc-500 shrink-0">
                  {formatKolkataDateTime(c.communicated_at)}
                </span>
              </div>
              {c.notes && (
                <p className="text-slate-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {c.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── MODAL 1: LOG CUSTOMER CONTACT & NEXT-ACTION ────────────────────── */}
      {isContactModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div>
                <h3
                  id="contact-modal-title"
                  className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"
                >
                  <MessageSquare className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  <span>Log Customer Contact</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Request: <span className="font-semibold text-slate-700 dark:text-zinc-300">{requestNumber || "—"}</span> • Customer: <span className="font-semibold text-slate-700 dark:text-zinc-300">{customerName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeContactModal}
                disabled={isPending}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation disabled:opacity-50"
                aria-label="Close contact modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4 text-xs">
              {/* Channel & Direction */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-zinc-300">
                    Channel <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as CommunicationChannel)}
                    className="w-full min-h-[44px] bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="phone">Phone Call</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="in_person">In-Person Visit</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-zinc-300">
                    Direction <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as CommunicationDirection)}
                    className="w-full min-h-[44px] bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="outbound">Outbound (We contacted)</option>
                    <option value="inbound">Inbound (Customer called/visited)</option>
                  </select>
                </div>
              </div>

              {/* Outcome */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Outcome <span className="text-rose-500">*</span>
                </label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as CommunicationOutcome)}
                  className="w-full min-h-[44px] bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                >
                  <option value="contacted">Customer Contacted / Spoke</option>
                  <option value="will_visit">Customer Will Visit Shop</option>
                  <option value="docs_awaited">Documents Awaited</option>
                  <option value="no_answer">No Answer / Line Busy</option>
                  <option value="resolved">Query Resolved</option>
                  <option value="note_added">Note / Status Update Only</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Contact Notes */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Contact Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Summary of discussion, customer request, or next step..."
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    if (scheduleNextFollowup && !scheduleNote) {
                      setScheduleNote(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-violet-500 leading-relaxed"
                />
              </div>

              {/* ── NEXT-ACTION BRIDGE PANEL ── */}
              <div className="p-3.5 rounded-xl border border-violet-200/70 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-950/20 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span className="font-bold text-slate-800 dark:text-zinc-200">
                    Next-Action Bridge
                  </span>
                </div>

                {!activeFollowup ? (
                  /* Case A: No active follow-up -> Offer to schedule next */
                  <div className="space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer touch-manipulation">
                      <input
                        type="checkbox"
                        checked={scheduleNextFollowup}
                        onChange={(e) => {
                          setScheduleNextFollowup(e.target.checked);
                          if (e.target.checked && !scheduleNote) {
                            setScheduleNote(notes);
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 dark:text-zinc-100">
                          Schedule next follow-up for this request
                        </span>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Set a reminder timestamp in Asia/Kolkata timezone to call back or follow up.
                        </p>
                      </div>
                    </label>

                    {scheduleNextFollowup && (
                      <div className="pt-2 border-t border-violet-200/50 dark:border-violet-900/40 space-y-3">
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 dark:text-zinc-300">
                            Follow-up Date & Time (IST) <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="datetime-local"
                            required
                            value={scheduleDateTime}
                            onChange={(e) => setScheduleDateTime(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-violet-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 dark:text-zinc-300">
                            Follow-up Note (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="Reminder purpose..."
                            value={scheduleNote}
                            onChange={(e) => setScheduleNote(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-violet-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Case B: Active follow-up exists -> Invariant: DO NOT allow duplicate schedule; offer completion */
                  <div className="space-y-3">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-[11px] leading-relaxed">
                        <span className="font-bold text-slate-800 dark:text-zinc-200">
                          Active Follow-up Exists
                        </span>
                        <p className="text-slate-500 dark:text-zinc-400">
                          Due: <span className="font-semibold text-slate-700 dark:text-zinc-300">{formatKolkataDateTime(activeFollowup.followUpAt)}</span>
                          {activeFollowup.note && ` — "${activeFollowup.note}"`}
                        </p>
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer touch-manipulation">
                      <input
                        type="checkbox"
                        checked={completeCurrentFollowup}
                        onChange={(e) => {
                          setCompleteCurrentFollowup(e.target.checked);
                          if (e.target.checked && !completionResolutionNote) {
                            setCompletionResolutionNote(notes);
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 dark:text-zinc-100">
                          Mark current follow-up as completed
                        </span>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Record that this contact resolved the open follow-up.
                        </p>
                      </div>
                    </label>

                    {completeCurrentFollowup && (
                      <div className="pt-2 border-t border-violet-200/50 dark:border-violet-900/40 space-y-1">
                        <label className="font-bold text-slate-700 dark:text-zinc-300">
                          Resolution Note (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Customer provided requested info, issue resolved..."
                          value={completionResolutionNote}
                          onChange={(e) => setCompletionResolutionNote(e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={closeContactModal}
                  disabled={isPending}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl touch-manipulation disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="min-h-[44px] px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 touch-manipulation disabled:opacity-50"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Contact</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: WHATSAPP TEMPLATE OUTREACH ───────────────────────────── */}
      {isWhatsAppModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="whatsapp-modal-title"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div>
                <h3
                  id="whatsapp-modal-title"
                  className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"
                >
                  <Send className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Send WhatsApp Outreach</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Choose a verified template. Message opens in WhatsApp for your review before sending.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWhatsAppModalOpen(false)}
                disabled={isPending}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation disabled:opacity-50"
                aria-label="Close WhatsApp modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Template Selector */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Select Template <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedTemplateKey}
                  onChange={(e) => setSelectedTemplateKey(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  {APPLICABLE_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Extra input if payment_reminder */}
              {selectedTemplateKey === "payment_reminder" && (
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-zinc-300">
                    Amount Pending (₹)
                  </label>
                  <input
                    type="number"
                    value={customAmountDue}
                    onChange={(e) => setCustomAmountDue(e.target.value)}
                    className="w-full min-h-[44px] bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Live Preview Box */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>Message Preview</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Recipient: {customerPhone || "None"}
                  </span>
                </label>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed font-sans text-xs">
                  {previewWhatsAppMessage()}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                Opening WhatsApp records an outreach log linked to this request. Note: delivery is managed inside your WhatsApp application.
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsWhatsAppModalOpen(false)}
                  disabled={isPending}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl touch-manipulation disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLaunchWhatsApp}
                  disabled={isPending}
                  className="min-h-[44px] px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 touch-manipulation disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  <span>Open WhatsApp & Log Outreach</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
