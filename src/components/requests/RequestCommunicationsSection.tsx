"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  MessageSquare,
  Send,
  Plus,
} from "lucide-react";
import {
  recordCommunication,
  getRequestCommunications,
} from "@/app/(dashboard)/communications/actions";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationOutcome,
  renderTemplate,
  generateWhatsAppLink,
} from "@/lib/communications/communicationEngine";
import { toast } from "sonner";
import { CustomerCommunicationItem } from "../customers/CustomerCommunicationsTimeline";

interface RequestCommunicationsSectionProps {
  requestId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  requestNumber?: string | null;
  serviceName?: string | null;
}

export function RequestCommunicationsSection({
  requestId,
  customerId,
  customerName,
  customerPhone,
  requestNumber,
  serviceName,
}: RequestCommunicationsSectionProps) {
  const [communications, setCommunications] = useState<CustomerCommunicationItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [channel, setChannel] = useState<CommunicationChannel>("whatsapp");
  const [direction, setDirection] = useState<CommunicationDirection>("outbound");
  const [outcome, setOutcome] = useState<CommunicationOutcome>("contacted");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    getRequestCommunications(requestId).then((data) => setCommunications(data as CustomerCommunicationItem[]));
  }, [requestId]);

  const handleQuickWhatsApp = () => {
    if (!customerPhone) {
      toast.error("Customer does not have a phone number registered");
      return;
    }
    const msg = renderTemplate("followup_reminder", {
      customer_name: customerName,
      service_name: serviceName || "Service",
      request_number: requestNumber || "—",
    });
    const link = generateWhatsAppLink(customerPhone, msg);
    if (!link) {
      toast.error("Invalid phone format for WhatsApp");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");

    // Auto-record outbound
    startTransition(async () => {
      try {
        const saved = await recordCommunication({
          customerId,
          customerServiceId: requestId,
          channel: "whatsapp",
          direction: "outbound",
          templateKey: "followup_reminder",
          messageSnapshot: msg,
          outcome: "contacted",
          notes: "Quick WhatsApp launched from Request Workspace",
        });
        setCommunications((prev) => [saved as CustomerCommunicationItem, ...prev]);
        toast.success("WhatsApp opened and outreach logged!");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to log outreach";
        toast.error(message);
      }
    });
  };

  const handleSaveLog = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const saved = await recordCommunication({
          customerId,
          customerServiceId: requestId,
          channel,
          direction,
          outcome,
          notes: notes.trim() || null,
        });
        setCommunications((prev) => [saved as CustomerCommunicationItem, ...prev]);
        setIsModalOpen(false);
        setNotes("");
        toast.success("Communication logged!");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to log";
        toast.error(message);
      }
    });
  };

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-violet-600" />
            Customer Outreach & Communications ({communications.length})
          </h3>
          <p className="text-[11px] text-slate-500">
            Outreach history and direct WhatsApp actions for this request.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {customerPhone && (
            <button
              onClick={handleQuickWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
            >
              <Send className="h-3 w-3" />
              WhatsApp
            </button>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-colors shadow-xs"
          >
            <Plus className="h-3 w-3" />
            Log Call/Visit
          </button>
        </div>
      </div>

      {communications.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-800 text-center text-xs text-slate-400">
          No outreach logged for this request yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {communications.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 text-xs space-y-1"
            >
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 dark:text-zinc-200 capitalize">
                    {c.channel}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 capitalize">{c.direction}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-emerald-600 font-semibold capitalize">
                    {c.outcome.replace("_", " ")}
                  </span>
                </div>
                <span className="text-slate-400">
                  {new Date(c.communicated_at).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {c.notes && <p className="text-slate-600 dark:text-zinc-400">{c.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <form
            onSubmit={handleSaveLog}
            className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Log Outreach for Request</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as CommunicationChannel)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                >
                  <option value="phone">Phone Call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="in_person">In-Person</option>
                  <option value="sms">SMS</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as CommunicationDirection)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                >
                  <option value="outbound">Outbound</option>
                  <option value="inbound">Inbound</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Outcome</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as CommunicationOutcome)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
              >
                <option value="contacted">Customer Contacted / Spoke</option>
                <option value="will_visit">Will Visit Shop</option>
                <option value="docs_awaited">Documents Awaited</option>
                <option value="no_answer">No Answer</option>
                <option value="resolved">Resolved</option>
                <option value="note_added">Note Added</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Notes</label>
              <textarea
                rows={3}
                placeholder="What was discussed..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                {isPending ? "Saving..." : "Save Log"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
