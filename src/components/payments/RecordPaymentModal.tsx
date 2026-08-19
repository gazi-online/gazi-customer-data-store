"use client";

import { useState, useEffect } from "react";
import { X, CreditCard, DollarSign, Calendar, Hash, FileText } from "lucide-react";
import { PaymentMethod } from "@/types/billing";
import { createPayment } from "@/app/(dashboard)/payments/actions";
import { toast } from "sonner";

interface CustomerOption {
  id: string;
  name: string;
  code?: string;
}

interface InvoiceOption {
  id: string;
  invoice_number: string;
  due_amount: number;
}

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedCustomerId?: string;
  preselectedCustomerName?: string;
  preselectedInvoiceId?: string;
  preselectedInvoiceNumber?: string;
  preselectedDueAmount?: number;
  customersList?: CustomerOption[];
  openInvoicesList?: InvoiceOption[];
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedCustomerId,
  preselectedCustomerName,
  preselectedInvoiceId,
  preselectedInvoiceNumber,
  preselectedDueAmount,
  customersList = [],
  openInvoicesList = [],
}: RecordPaymentModalProps) {
  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [invoiceId, setInvoiceId] = useState(preselectedInvoiceId || "");
  const [amount, setAmount] = useState<number | "">(
    preselectedDueAmount && preselectedDueAmount > 0 ? preselectedDueAmount : ""
  );
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (preselectedCustomerId) setCustomerId(preselectedCustomerId);
    if (preselectedInvoiceId) setInvoiceId(preselectedInvoiceId);
    if (preselectedDueAmount && preselectedDueAmount > 0) setAmount(preselectedDueAmount);
  }, [preselectedCustomerId, preselectedInvoiceId, preselectedDueAmount]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      toast.error("Please select a customer.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      toast.error("Payment amount must be greater than zero.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createPayment({
        customer_id: customerId,
        amount: Number(amount),
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_number: referenceNumber || null,
        notes: notes || null,
        invoice_id: invoiceId || null,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.allocationResult && res.allocationResult.error) {
        toast.warning(`Payment recorded, but allocation warning: ${res.allocationResult.error}`);
      } else {
        toast.success("Payment recorded successfully!");
      }

      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center space-x-3 text-emerald-600 dark:text-emerald-400">
            <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-950/50 rounded-xl flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Record Payment</h3>
              <p className="text-xs text-zinc-500">Atomic database transaction with auto payment-numbering</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Customer Selection */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
              Customer <span className="text-red-500">*</span>
            </label>
            {preselectedCustomerId && preselectedCustomerName ? (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {preselectedCustomerName}
              </div>
            ) : (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">Select a Customer...</option>
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.code ? `(${c.code})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Invoice Direct Allocation (Optional) */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
              Apply to Invoice (Optional)
            </label>
            {preselectedInvoiceId && preselectedInvoiceNumber ? (
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-semibold text-blue-900 dark:text-blue-200 flex justify-between">
                <span>Invoice #{preselectedInvoiceNumber}</span>
                {preselectedDueAmount !== undefined && (
                  <span className="text-zinc-500 text-xs font-mono">Due: ₹{preselectedDueAmount.toLocaleString('en-IN')}</span>
                )}
              </div>
            ) : (
              <select
                value={invoiceId}
                onChange={(e) => {
                  const invId = e.target.value;
                  setInvoiceId(invId);
                  const selected = openInvoicesList.find((i) => i.id === invId);
                  if (selected && selected.due_amount > 0) {
                    setAmount(selected.due_amount);
                  }
                }}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">Unallocated / General Payment</option>
                {openInvoicesList.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    Invoice #{inv.invoice_number} (Due: ₹{inv.due_amount.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payment Amount */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Amount (₹) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  placeholder="0.00"
                  required
                  className="w-full pl-8 pr-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            {/* Payment Date */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payment Method */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                required
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
              >
                <option value="upi">UPI / GPay / PhonePe</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer (NEFT/IMPS/RTGS)</option>
                <option value="card">Card (POS Terminal)</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Reference Number */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Reference / Transaction ID
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. UTR / Txn No / Cheque No"
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
              Notes / Internal Memo
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional remarks..."
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-800 dark:text-amber-300">
            🔒 <strong>Security Note:</strong> Do not enter sensitive credentials (PINs, card numbers, passwords). Only record completed transaction references.
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center"
            >
              {isSubmitting ? "Recording..." : "Confirm & Save Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
