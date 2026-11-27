"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Send,
  ArrowRightCircle,
  Clock,
  MessageSquare,
  CheckCircle2,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import {
  addEnquiryUpdate,
  convertEnquiryToServiceRequest,
  getEnquiryDetails,
  sendEnquiryFollowupWhatsApp,
} from "@/app/(dashboard)/enquiries/actions";
import type {
  EnquiryRow,
  EnquiryStatus,
  EnquiryUpdateRow,
} from "@/app/(dashboard)/enquiries/types";

interface EnquiryDetailModalProps {
  enquiry: EnquiryRow | null;
  onClose: () => void;
  onUpdated: () => void;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function EnquiryDetailModal({
  enquiry,
  onClose,
  onUpdated,
}: EnquiryDetailModalProps) {
  const [updates, setUpdates] = useState<EnquiryUpdateRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [status, setStatus] = useState<EnquiryStatus>("follow_up");
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [quotedAmount, setQuotedAmount] = useState("");
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  useEffect(() => {
    if (!enquiry) return;
    setStatus(enquiry.status);
    setFollowUpAt(toDatetimeLocalValue(enquiry.follow_up_at));
    setQuotedAmount(
      enquiry.quoted_amount !== null && enquiry.quoted_amount !== undefined
        ? String(enquiry.quoted_amount)
        : ""
    );
    setNote("");
    setLoadingHistory(true);
    getEnquiryDetails(enquiry.id)
      .then((res) => {
        setUpdates(res.updates || []);
      })
      .finally(() => setLoadingHistory(false));
  }, [enquiry]);

  useEffect(() => {
    if (!enquiry) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving && !isConverting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enquiry, isSaving, isConverting, onClose]);

  if (!enquiry) return null;

  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      toast.error("Please enter an update note.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await addEnquiryUpdate({
        enquiry_id: enquiry.id,
        status,
        note: note.trim(),
        follow_up_at: followUpAt,
        quoted_amount: quotedAmount ? Number(quotedAmount) : null,
        sendWhatsApp,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(
        res.whatsappSent
          ? "Update saved & WhatsApp notification sent!"
          : "Enquiry update saved!"
      );
      setNote("");
      const refreshed = await getEnquiryDetails(enquiry.id);
      setUpdates(refreshed.updates || []);
      onUpdated();
    } catch {
      toast.error("Failed to save update.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickFollowupWhatsApp = async () => {
    setIsSendingReminder(true);
    try {
      const res = await sendEnquiryFollowupWhatsApp(enquiry.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Follow-up reminder sent on WhatsApp!");
      const refreshed = await getEnquiryDetails(enquiry.id);
      setUpdates(refreshed.updates || []);
      onUpdated();
    } catch {
      toast.error("Failed to send WhatsApp follow-up.");
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleConvert = async () => {
    setIsConverting(true);
    try {
      const res = await convertEnquiryToServiceRequest(enquiry.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.requestId
          ? "Converted to Customer & Service Request!"
          : "Converted to Customer Profile!"
      );
      onUpdated();
      onClose();
    } catch {
      toast.error("Conversion failed.");
    } finally {
      setIsConverting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-start justify-between gap-3 bg-slate-50/70 dark:bg-zinc-900 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-violet-100 text-violet-700">
                {enquiry.enquiry_number}
              </span>
              <span className="text-xs text-slate-500 capitalize">
                Source: {enquiry.source.replace("_", " ")}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-1 truncate">
              {enquiry.subject}
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-600 mt-0.5">
              <span className="font-semibold">{enquiry.customer_name}</span>
              <span className="inline-flex items-center gap-1 font-mono">
                <Phone className="h-3 w-3 text-slate-400" />
                {enquiry.phone}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleQuickFollowupWhatsApp}
              disabled={isSendingReminder}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-60"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {isSendingReminder ? "Sending..." : "Send Follow-up Reminder on WhatsApp"}
            </button>

            {enquiry.status !== "converted" && (
              <button
                type="button"
                onClick={handleConvert}
                disabled={isConverting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-60"
              >
                <ArrowRightCircle className="h-3.5 w-3.5" />
                {isConverting
                  ? "Converting..."
                  : enquiry.service_id
                  ? "Convert to Service Request"
                  : "Convert to Customer"}
              </button>
            )}
          </div>

          {enquiry.details && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-sm text-slate-700">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Initial Enquiry Details
              </div>
              {enquiry.details}
            </div>
          )}

          {/* Add Update / Follow-up Form */}
          <form
            onSubmit={handleSaveUpdate}
            className="p-4 rounded-2xl border border-slate-200 bg-slate-50/40 space-y-4"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Post Update / Schedule Follow-up
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EnquiryStatus)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                >
                  <option value="new">New</option>
                  <option value="in_progress">In Progress</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="quoted">Quoted</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Next Follow-up
                </label>
                <input
                  type="datetime-local"
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Quoted Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quotedAmount}
                  onChange={(e) => setQuotedAmount(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Update Message / Follow-up Note *
              </label>
              <textarea
                rows={2}
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Fees ₹250, Aadhaar & 2 photos required. Customer will visit tomorrow."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Send this update to customer on WhatsApp</span>
              </label>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : "Save Update"}
              </button>
            </div>
          </form>

          {/* Timeline */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Update &amp; Follow-up Timeline
            </div>

            {loadingHistory ? (
              <div className="text-xs text-slate-400 py-4">Loading history...</div>
            ) : updates.length === 0 ? (
              <div className="text-xs text-slate-400 py-4">No updates logged yet.</div>
            ) : (
              <div className="space-y-3">
                {updates.map((u) => (
                  <div
                    key={u.id}
                    className="p-3.5 rounded-xl border border-slate-200/80 bg-white flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {u.update_type.replace("_", " ")}
                        </span>
                        {u.new_status && (
                          <span className="text-[11px] font-semibold text-violet-700">
                            Status: {u.new_status.replace("_", " ")}
                          </span>
                        )}
                        {u.whatsapp_sent && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            WhatsApp Sent
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(u.created_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{u.note}</p>
                    {u.follow_up_at && (
                      <div className="text-xs text-amber-700 font-medium">
                        Follow-up set for:{" "}
                        {new Date(u.follow_up_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
