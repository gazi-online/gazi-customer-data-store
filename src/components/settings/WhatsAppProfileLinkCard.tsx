"use client";

import React, { useEffect, useState, useTransition } from "react";
import { MessageCircle, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getUserWhatsAppProfileAction,
  updateUserWhatsAppProfileAction,
} from "@/app/(dashboard)/settings/actions";

export function WhatsAppProfileLinkCard() {
  const [fullName, setFullName] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    getUserWhatsAppProfileAction()
      .then((res) => {
        if (!active) return;
        setFullName(res.fullName);
        setWhatsappPhone(res.whatsappPhone);
        setEmail(res.email);
      })
      .catch(() => {
        // Ignore initial load errors silently
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateUserWhatsAppProfileAction({ fullName, whatsappPhone });
        toast.success("WhatsApp profile & login alert mobile saved!");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to save WhatsApp profile");
      }
    });
  };

  return (
    <form
      onSubmit={handleSave}
      className="rounded-2xl border border-slate-200/80 p-5 sm:p-6 bg-slate-50/50 space-y-4"
    >
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-emerald-100/80 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shrink-0">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            WhatsApp OTP Login &amp; New Device Alerts
          </h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">
            Link your WhatsApp mobile number to log in with a 6-digit OTP and receive instant
            &ldquo;New device login successful&rdquo; alerts with your name and location.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading profile...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Your Name (for alerts)</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={email || "e.g. Nur Islam Gazi"}
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Linked WhatsApp Mobile</label>
            <input
              type="tel"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          <span>Save WhatsApp Link</span>
        </button>
      </div>
    </form>
  );
}
