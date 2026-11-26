"use client";

import React, { useState, useTransition } from "react";
import {
  ScanLine,
  Upload,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  analyzeReceiptUploadAction,
  sendWithdrawalReceiptWhatsAppAction,
} from "./actions";
import type { ExtractedWithdrawalReceipt } from "@/lib/receipts/receiptAnalyzer";

export default function ReceiptsAnalyzerPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [autoSendOnAnalyze, setAutoSendOnAnalyze] = useState(false);
  const [receipt, setReceipt] = useState<ExtractedWithdrawalReceipt | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isAnalyzing, startAnalyze] = useTransition();
  const [isSending, startSend] = useTransition();

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please select a receipt image or PDF first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    startAnalyze(async () => {
      const res = await analyzeReceiptUploadAction(formData);
      if (res.error || !res.receipt) {
        toast.error(res.error || "Failed to analyze receipt.");
        return;
      }

      setReceipt(res.receipt);
      const foundPhone = res.receipt.extractedPhone || "";
      setPhoneInput(foundPhone);
      setMessageText(res.previewMessage || "");
      toast.success(
        foundPhone
          ? `Receipt analyzed! Extracted mobile: ${foundPhone}`
          : "Receipt analyzed! Please enter customer mobile number."
      );

      if (autoSendOnAnalyze && foundPhone && res.previewMessage) {
        const sendRes = await sendWithdrawalReceiptWhatsAppAction({
          phone: foundPhone,
          message: res.previewMessage,
          rrnNumber: res.receipt.rrnNumber,
        });
        if (sendRes.error) {
          toast.error(`Auto-send failed: ${sendRes.error}`);
        } else {
          toast.success(`WhatsApp receipt auto-sent to ${foundPhone}!`);
        }
      }
    });
  };

  const handleSendWhatsApp = () => {
    if (!phoneInput.trim()) {
      toast.error("Please enter the customer's 10-digit mobile number.");
      return;
    }
    startSend(async () => {
      const res = await sendWithdrawalReceiptWhatsAppAction({
        phone: phoneInput,
        message: messageText,
        rrnNumber: receipt?.rrnNumber,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`WhatsApp receipt sent to ${phoneInput}!`);
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AEPS / UPI Receipt Analyzer"
        description="Upload an AEPS or UPI Cash Withdrawal receipt to extract Customer Name, RRN, Amount, and Mobile from UPI ID, and send it directly on WhatsApp."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload & Analyze Card */}
        <form
          onSubmit={handleAnalyze}
          className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Upload Withdrawal Receipt</h2>
              <p className="text-xs text-slate-500">Supports JPG, PNG, WEBP, or PDF (max 10 MB)</p>
            </div>
          </div>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-violet-400 rounded-2xl p-6 cursor-pointer bg-slate-50/50 transition-colors text-center">
            <Upload className="h-7 w-7 text-slate-400 mb-2" />
            <span className="text-xs font-semibold text-slate-700">
              {selectedFile ? selectedFile.name : "Click to choose receipt image or PDF"}
            </span>
            <span className="text-[11px] text-slate-400 mt-1">
              PayNearby, Spice Money, Fino, PhonePe, GPay, Paytm, etc.
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSendOnAnalyze}
              onChange={(e) => setAutoSendOnAnalyze(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Auto-send WhatsApp immediately if mobile number is extracted</span>
          </label>

          <button
            type="submit"
            disabled={isAnalyzing || !selectedFile}
            className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing Receipt...</span>
              </>
            ) : (
              <>
                <ScanLine className="h-4 w-4" />
                <span>Analyze Receipt</span>
              </>
            )}
          </button>
        </form>

        {/* Extracted Details & WhatsApp Send Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">Extracted Details &amp; WhatsApp</h2>
            {receipt && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                {receipt.provider === "gemini" ? "AI Vision" : "OCR.space"}
              </span>
            )}
          </div>

          {!receipt ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Upload and analyze a receipt on the left to preview extracted details and send on WhatsApp.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                  <span className="font-semibold text-slate-800 capitalize">{receipt.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Amount</span>
                  <span className="font-semibold text-slate-800">
                    {receipt.amount ? `₹${receipt.amount}` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Name</span>
                  <span className="font-semibold text-slate-800">{receipt.customerName || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">RRN / UTR</span>
                  <span className="font-semibold text-slate-800">{receipt.rrnNumber || "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">UPI ID</span>
                  <span className="font-semibold text-slate-800">{receipt.upiId || "—"}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Customer WhatsApp Number</span>
                  {!receipt.extractedPhone && (
                    <span className="text-[11px] text-amber-600 flex items-center gap-1 font-normal">
                      <AlertCircle className="h-3 w-3" /> Not in UPI ID — enter manually
                    </span>
                  )}
                </label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="10-digit mobile e.g. 9876543210"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">WhatsApp Message (Editable)</label>
                <textarea
                  rows={7}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={isSending || !phoneInput.trim()}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Sending WhatsApp...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Send WhatsApp Receipt</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Telegram Bot Setup Info */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
          <Bot className="h-5 w-5" />
        </div>
        <div className="space-y-1 text-xs">
          <h3 className="font-bold text-slate-900">Telegram Bot Auto-Sender Ready</h3>
          <p className="text-slate-600 leading-relaxed">
            Set <code className="px-1.5 py-0.5 bg-slate-100 rounded">TELEGRAM_BOT_TOKEN</code> in Vercel and register your webhook to{" "}
            <code className="px-1.5 py-0.5 bg-slate-100 rounded">https://gonline.vercel.app/api/webhooks/telegram</code>.
            Send any receipt photo or PDF to your Telegram bot — it will analyze the receipt, extract the mobile number from the UPI ID, and send the WhatsApp confirmation automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
