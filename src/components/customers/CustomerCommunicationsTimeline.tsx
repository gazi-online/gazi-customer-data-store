"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  MessageSquare,
  Plus,
  Clock,
} from "lucide-react";
import {
  recordCommunication,
  getCustomerCommunications,
} from "@/app/(dashboard)/communications/actions";
import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationOutcome,
} from "@/lib/communications/communicationEngine";
import { toast } from "sonner";

export interface CustomerCommunicationItem {
  id: string;
  customer_id: string;
  customer_service_id?: string | null;
  channel: string;
  direction: string;
  template_key?: string | null;
  message_snapshot?: string | null;
  outcome: string;
  notes?: string | null;
  communicated_at: string;
  created_at: string;
}

interface CustomerCommunicationsTimelineProps {
  customerId: string;
  customerName?: string;
  initialCommunications?: CustomerCommunicationItem[];
}

export function CustomerCommunicationsTimeline({
  customerId,
  customerName = "Customer",
  initialCommunications = [],
}: CustomerCommunicationsTimelineProps) {
  const [communications, setCommunications] = useState<CustomerCommunicationItem[]>(initialCommunications);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [channel, setChannel] = useState<CommunicationChannel>("phone");
  const [direction, setDirection] = useState<CommunicationDirection>("outbound");
  const [outcome, setOutcome] = useState<CommunicationOutcome>("contacted");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (initialCommunications.length === 0) {
      getCustomerCommunications(customerId).then(setCommunications);
    }
  }, [customerId, initialCommunications]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const saved = await recordCommunication({
          customerId,
          channel,
          direction,
          outcome,
          notes: notes.trim() || null,
        });
        toast.success("Outreach recorded!");
        setCommunications((prev) => [saved as CustomerCommunicationItem, ...prev]);
        setIsModalOpen(false);
        setNotes("");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to record communication";
        toast.error(message);
      }
    });
  };

  const getChannelBadge = (ch: string) => {
    switch (ch) {
      case "whatsapp":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">WhatsApp</span>;
      case "phone":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700">Phone Call</span>;
      case "in_person":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-700">In Person</span>;
      case "sms":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700">SMS</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">{ch}</span>;
    }
  };

  const getOutcomeBadge = (out: string) => {
    switch (out) {
      case "contacted":
        return <span className="text-emerald-600 font-semibold">Contacted</span>;
      case "will_visit":
        return <span className="text-indigo-600 font-semibold">Will Visit Shop</span>;
      case "docs_awaited":
        return <span className="text-amber-600 font-semibold">Documents Awaited</span>;
      case "no_answer":
        return <span className="text-rose-600 font-semibold">No Answer</span>;
      case "resolved":
        return <span className="text-emerald-700 font-bold">Resolved</span>;
      default:
        return <span className="text-slate-600 font-medium">{out}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-violet-600" />
            Communication & Outreach History
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Log of WhatsApp messages, phone calls, visits, and customer reminders.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Log Outreach
        </button>
      </div>

      {communications.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <MessageSquare className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No communication history logged yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Log calls, WhatsApp conversations, or in-person visits with {customerName} to maintain a clean operational record.
          </p>
        </div>
      ) : (
        <div className="relative border-l border-slate-200 ml-4 space-y-6">
          {communications.map((c) => (
            <div key={c.id} className="relative pl-6">
              <div className="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-violet-100 border-2 border-violet-600 flex items-center justify-center" />
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {getChannelBadge(c.channel)}
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500 font-medium capitalize">{c.direction}</span>
                    <span className="text-slate-400">•</span>
                    {getOutcomeBadge(c.outcome)}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(c.communicated_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>

                {c.message_snapshot && (
                  <div className="bg-slate-50 p-2.5 rounded-xl text-xs text-slate-700 font-mono text-[11px] leading-relaxed border border-slate-100">
                    &quot;{c.message_snapshot}&quot;
                  </div>
                )}

                {c.notes && (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {c.notes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Log Customer Outreach</h3>
                <p className="text-xs text-slate-500">Customer: {customerName}</p>
              </div>
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
                  <option value="in_person">In-Person Visit</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as CommunicationDirection)}
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
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as CommunicationOutcome)}
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
              <label className="text-xs font-bold text-slate-700">Notes / Details</label>
              <textarea
                rows={3}
                placeholder="Details of conversation or agreement..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
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
