"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Receipt, Loader2 } from "lucide-react";
import { generateInvoiceForRequest } from "@/app/(dashboard)/requests/actions";
import { toast } from "sonner";

interface GenerateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  customerName: string;
  serviceName: string;
  defaultAmount: number;
  isAdditional?: boolean;
}

export function GenerateInvoiceModal({
  isOpen,
  onClose,
  requestId,
  customerName,
  serviceName,
  defaultAmount,
  isAdditional = false,
}: GenerateInvoiceModalProps) {
  const router = useRouter();
  const [description, setDescription] = useState(serviceName || "Service Fee");
  const [amount, setAmount] = useState<number | "">(
    defaultAmount > 0 ? defaultAmount : 0
  );
  const [status, setStatus] = useState<"issued" | "draft">("issued");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      toast.error("Line item description is required.");
      return;
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      toast.error("Invoice amount cannot be negative.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await generateInvoiceForRequest({
        requestId,
        description: description.trim(),
        amount: numAmount,
        status,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to generate invoice.");
        return;
      }

      toast.success(
        res.data?.invoice_number
          ? `Invoice ${res.data.invoice_number} created successfully.`
          : "Invoice generated successfully."
      );
      onClose();
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred while generating the invoice.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                {isAdditional ? "Create Additional Invoice" : "Generate Invoice"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {customerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Service info summary */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/60 space-y-1">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
              Service Request
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-zinc-100">
              {serviceName}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-zinc-300">
              Line Item Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-zinc-300">
              Amount (₹) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm font-bold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Status Selection */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-zinc-300">
              Initial Invoice Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus("issued")}
                disabled={isSubmitting}
                className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                  status === "issued"
                    ? "bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-950/40 dark:border-blue-400 dark:text-blue-300"
                    : "border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-50"
                }`}
              >
                Issued (Ready to Pay)
              </button>
              <button
                type="button"
                onClick={() => setStatus("draft")}
                disabled={isSubmitting}
                className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                  status === "draft"
                    ? "bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-950/40 dark:border-amber-400 dark:text-amber-300"
                    : "border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-50"
                }`}
              >
                Draft (Review First)
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              {status === "issued"
                ? "Issued invoices create official customer debt and accept immediate payment."
                : "Draft invoices are uncommitted and must be issued before recording payments."}
            </p>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-zinc-300">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              placeholder="Add payment terms or instructions..."
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-600 dark:text-zinc-400 font-semibold hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isSubmitting ? "Generating..." : "Generate Invoice"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
