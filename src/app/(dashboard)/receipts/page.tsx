"use client";

import React, { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ScanLine,
  Upload,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bot,
  Search,
  MessageSquare,
  Clock,
  X,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  analyzeReceiptUploadAction,
  getReceiptTransactionsAction,
  sendWithdrawalReceiptWhatsAppAction,
  type ReceiptHistorySummary,
  type ReceiptTransactionRow,
} from "./actions";
import type { ExtractedWithdrawalReceipt } from "@/lib/receipts/receiptAnalyzer";

export default function ReceiptsAnalyzerPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [autoSendOnAnalyze, setAutoSendOnAnalyze] = useState(false);
  const [receipt, setReceipt] = useState<ExtractedWithdrawalReceipt | null>(null);
  const [currentTransactionId, setCurrentTransactionId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isAnalyzing, startAnalyze] = useTransition();
  const [isSending, startSend] = useTransition();

  // Transaction History State
  const [transactions, setTransactions] = useState<ReceiptTransactionRow[]>([]);
  const [summary, setSummary] = useState<ReceiptHistorySummary>({
    totalCount: 0,
    totalAmount: 0,
    whatsappSentCount: 0,
    whatsappPendingCount: 0,
  });
  const [historySearch, setHistorySearch] = useState("");
  const [whatsappFilter, setWhatsappFilter] = useState<"all" | "sent" | "pending">("all");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [selectedTx, setSelectedTx] = useState<ReceiptTransactionRow | null>(null);
  const [resendPhone, setResendPhone] = useState("");
  const [resendMsg, setResendMsg] = useState("");
  const [isResending, setIsResending] = useState(false);

  const loadHistory = async (opts?: {
    search?: string;
    filter?: "all" | "sent" | "pending";
  }) => {
    setIsLoadingHistory(true);
    try {
      const res = await getReceiptTransactionsAction({
        search: opts?.search !== undefined ? opts.search : historySearch,
        whatsappFilter: opts?.filter !== undefined ? opts.filter : whatsappFilter,
      });
      setTransactions(res.transactions);
      setSummary(res.summary);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTx) return;
    setResendPhone(selectedTx.whatsapp_phone || selectedTx.extracted_phone || "");
    setResendMsg(selectedTx.whatsapp_message || "");
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isResending) setSelectedTx(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedTx, isResending]);

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
      setCurrentTransactionId(res.transactionId || null);
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
          transactionId: res.transactionId || null,
        });
        if (sendRes.error) {
          toast.error(`Auto-send failed: ${sendRes.error}`);
        } else {
          toast.success(`WhatsApp receipt auto-sent to ${foundPhone}!`);
        }
      }

      await loadHistory();
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
        transactionId: currentTransactionId,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`WhatsApp receipt sent to ${phoneInput}!`);
      }
      await loadHistory();
    });
  };

  const handleResendFromModal = async () => {
    if (!selectedTx) return;
    if (!resendPhone.trim() || !resendMsg.trim()) {
      toast.error("Phone number and message are required.");
      return;
    }
    setIsResending(true);
    try {
      const res = await sendWithdrawalReceiptWhatsAppAction({
        phone: resendPhone,
        message: resendMsg,
        rrnNumber: selectedTx.rrn_number,
        transactionId: selectedTx.id,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`WhatsApp SMS sent to ${resendPhone}!`);
        setSelectedTx(null);
      }
      await loadHistory();
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AEPS / UPI Receipt Analyzer"
        description="Upload an AEPS or UPI Cash Withdrawal receipt to extract Customer Name, RRN, Amount, and Mobile from UPI ID, send on WhatsApp, and store full transaction & SMS history."
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
              PayNearby, Spice Money, Fino, Airtel, PhonePe, GPay, Paytm, etc.
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

      {/* Transaction History & WhatsApp SMS Logs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/40">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Transaction History &amp; WhatsApp SMS Log
            </h2>
            <p className="text-xs text-slate-500">
              All analyzed Portal &amp; Telegram receipts with WhatsApp delivery status and SMS text.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="px-3 py-2 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Transactions</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">{summary.totalCount}</span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Amount</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                ₹{summary.totalAmount.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-600 block">WA Sent</span>
              <span className="text-sm font-bold text-emerald-800 tabular-nums">{summary.whatsappSentCount}</span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[10px] font-bold uppercase text-amber-700 block">Not Sent</span>
              <span className="text-sm font-bold text-amber-900 tabular-nums">{summary.whatsappPendingCount}</span>
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                void loadHistory({ search: e.target.value });
              }}
              placeholder="Search name, RRN, UPI ID, mobile..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="flex items-center gap-2">
            {(
              [
                ["all", "All"],
                ["sent", "WhatsApp Sent"],
                ["pending", "Not Sent"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setWhatsappFilter(key);
                  void loadHistory({ filter: key });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  whatsappFilter === key
                    ? "bg-violet-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => void loadHistory()}
              title="Refresh history"
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingHistory ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* History List */}
        {isLoadingHistory && transactions.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            Loading transaction history...
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No receipt transactions recorded yet. Analyze a receipt above or via Telegram Bot.
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left">
                <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Date &amp; Source</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">RRN / UPI ID</th>
                    <th className="px-5 py-3">WhatsApp SMS</th>
                    <th className="px-5 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-medium text-slate-800 flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {new Date(tx.created_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            tx.source === "telegram"
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-violet-50 text-violet-700 border border-violet-200"
                          }`}
                        >
                          {tx.source}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-semibold text-slate-900">
                          {tx.customer_name || "—"}
                        </div>
                        <div className="text-xs font-mono text-slate-500">
                          {tx.whatsapp_phone || tx.extracted_phone || "No mobile"}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-mono font-bold text-slate-900 tabular-nums">
                          {tx.amount !== null ? `₹${Number(tx.amount).toLocaleString("en-IN")}` : "—"}
                        </div>
                        <div className="text-[11px] capitalize text-slate-500">{tx.tx_status}</div>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-mono text-xs text-slate-800">
                          {tx.rrn_number || "—"}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          {tx.upi_id || "—"}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {tx.whatsapp_sent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Sent
                          </span>
                        ) : tx.whatsapp_error ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                            <AlertCircle className="h-3 w-3" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Not Sent
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTx(tx)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-violet-50 text-slate-700 hover:text-violet-700 transition-colors"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          View SMS
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {transactions.map((tx) => (
                <div key={tx.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">
                        {tx.customer_name || "Unknown"}
                      </div>
                      <div className="text-xs font-mono text-slate-500">
                        {tx.whatsapp_phone || tx.extracted_phone || "No mobile"} · {tx.source}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-900 text-sm">
                        {tx.amount !== null ? `₹${Number(tx.amount).toLocaleString("en-IN")}` : "—"}
                      </div>
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          tx.whatsapp_sent
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {tx.whatsapp_sent ? "WA Sent" : "Not Sent"}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    RRN: {tx.rrn_number || "—"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTx(tx)}
                    className="w-full py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700"
                  >
                    View WhatsApp SMS Details
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Telegram Bot Setup Info */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
          <Bot className="h-5 w-5" />
        </div>
        <div className="space-y-1 text-xs">
          <h3 className="font-bold text-slate-900">Telegram Bot Auto-Sender Ready</h3>
          <p className="text-slate-600 leading-relaxed">
            Send any receipt photo or PDF to <code className="px-1.5 py-0.5 bg-slate-100 rounded">@Gazi_OnlineBot</code> — it will analyze the receipt, send the WhatsApp confirmation automatically, and store the full transaction &amp; SMS record in the history table above.
          </p>
        </div>
      </div>

      {/* SMS Detail & Resend Modal */}
      {selectedTx &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Transaction &amp; WhatsApp SMS Details
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedTx.customer_name || "Customer"} · RRN {selectedTx.rrn_number || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Amount</span>
                    <span className="font-bold text-slate-900">
                      {selectedTx.amount !== null ? `₹${selectedTx.amount}` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Source</span>
                    <span className="font-semibold capitalize text-slate-800">{selectedTx.source}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">UPI ID</span>
                    <span className="font-mono text-slate-800 break-all">{selectedTx.upi_id || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">WA Status</span>
                    <span className="font-semibold text-slate-800">
                      {selectedTx.whatsapp_sent
                        ? `Sent (${selectedTx.whatsapp_sent_at ? new Date(selectedTx.whatsapp_sent_at).toLocaleString("en-IN") : ""})`
                        : selectedTx.whatsapp_error || "Not Sent"}
                    </span>
                  </div>
                  {selectedTx.whatsapp_message_id && (
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        OpenWA Message ID
                      </span>
                      <span className="font-mono text-slate-700">{selectedTx.whatsapp_message_id}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">WhatsApp Mobile</label>
                  <input
                    type="tel"
                    value={resendPhone}
                    onChange={(e) => setResendPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">WhatsApp SMS Content</label>
                  <textarea
                    rows={7}
                    value={resendMsg}
                    onChange={(e) => setResendMsg(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleResendFromModal}
                  disabled={isResending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isResending
                    ? "Sending..."
                    : selectedTx.whatsapp_sent
                    ? "Resend WhatsApp SMS"
                    : "Send WhatsApp SMS"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
