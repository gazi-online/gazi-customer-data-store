"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  Receipt, 
  User, 
  Calendar, 
  CreditCard, 
  AlertTriangle,
  Send,
  Ban,
  RotateCcw,
  X,
  Check,
  Printer,
  ClipboardList,
  ArrowRight
} from "lucide-react";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";
import { issueInvoice, cancelInvoice } from "@/app/(dashboard)/invoices/actions";
import { voidPayment, refundPayment } from "@/app/(dashboard)/payments/actions";
import { toast } from "sonner";

interface InvoiceDetailViewProps {
  invoice: any;
}

const isValidUuid = (id?: string | null): boolean =>
  Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function InvoiceDetailView({ invoice }: InvoiceDetailViewProps) {
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    type: 'cancel_invoice' | 'void_payment' | 'refund_payment';
    id: string;
    title: string;
    description: string;
  } | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const isOverdue =
    invoice.due_date &&
    invoice.due_date < today &&
    Number(invoice.due_amount) > 0 &&
    invoice.status !== "draft" &&
    invoice.status !== "cancelled";

  const customerName = invoice.customer
    ? `${invoice.customer.first_name} ${invoice.customer.middle_name ? invoice.customer.middle_name + " " : ""}${invoice.customer.last_name}`
    : "Unknown Customer";

  const handleIssue = async () => {
    try {
      setIsActionPending(true);
      const res = await issueInvoice(invoice.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Invoice issued successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to issue invoice.");
    } finally {
      setIsActionPending(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmModal) return;

    try {
      setIsActionPending(true);
      if (confirmModal.type === 'cancel_invoice') {
        const res = await cancelInvoice(confirmModal.id);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Invoice cancelled.");
      } else if (confirmModal.type === 'void_payment') {
        const res = await voidPayment(confirmModal.id);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Payment voided. Invoice balance recalculated.");
      } else if (confirmModal.type === 'refund_payment') {
        const res = await refundPayment(confirmModal.id);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Payment refunded. Invoice balance recalculated.");
      }
    } catch (err: any) {
      toast.error(err.message || "Action failed.");
    } finally {
      setIsActionPending(false);
      setConfirmModal(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-5xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <Link
            href="/invoices"
            className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-2"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Invoices
          </Link>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Invoice #{invoice.invoice_number}
            </h1>

            {/* Status Badges */}
            {isOverdue && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-600" /> Overdue
              </span>
            )}
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase ${
              invoice.status === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
              invoice.status === "partially_paid" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" :
              invoice.status === "issued" ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" :
              invoice.status === "cancelled" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
              "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            }`}>
              {invoice.status.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Print Invoice — always available */}
          <Link
            href={`/invoices/${invoice.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 font-semibold text-sm rounded-xl transition-colors"
            aria-label="Open print view for this invoice"
          >
            <Printer className="mr-1.5 h-4 w-4" /> Print Invoice
          </Link>

          {invoice.status === "draft" && (
            <button
              onClick={handleIssue}
              disabled={isActionPending}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
            >
              <Send className="mr-1.5 h-4 w-4" /> Issue Invoice
            </button>
          )}

          {invoice.status !== "cancelled" && Number(invoice.due_amount) > 0 && (
            <button
              onClick={() => setIsRecordPaymentOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors shadow-md hover:shadow-lg"
            >
              <CreditCard className="mr-1.5 h-4 w-4" /> Record Payment
            </button>
          )}

          {(invoice.status === "draft" || invoice.status === "issued") && Number(invoice.paid_amount) === 0 && (
            <button
              onClick={() => setConfirmModal({
                type: 'cancel_invoice',
                id: invoice.id,
                title: 'Cancel Invoice',
                description: 'Are you sure you want to cancel this invoice? Cancelled invoices cannot receive payment allocations.',
              })}
              disabled={isActionPending}
              className="inline-flex items-center px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-zinc-600 dark:text-zinc-400 font-semibold text-sm rounded-xl transition-colors"
            >
              <Ban className="mr-1.5 h-4 w-4" /> Cancel Invoice
            </button>
          )}
        </div>
      </div>

      {/* Customer & Invoice Meta Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center">
            <User className="mr-1.5 h-4 w-4 text-blue-500" /> Billed To
          </p>
          {invoice.customer ? (
            <div>
              <Link
                href={`/customers/${invoice.customer.id}`}
                className="font-bold text-lg text-zinc-900 dark:text-zinc-100 hover:text-blue-600 transition-colors"
              >
                {customerName}
              </Link>
              {invoice.customer.customer_code && (
                <p className="text-xs text-zinc-500 font-mono">Code: {invoice.customer.customer_code}</p>
              )}
              {invoice.customer.phone && (
                <p className="text-xs text-zinc-500 mt-1">Phone: {invoice.customer.phone}</p>
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold text-zinc-500">Unknown Customer</p>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center">
            <Calendar className="mr-1.5 h-4 w-4 text-blue-500" /> Dates & Validity
          </p>
          <div className="text-sm space-y-1 text-zinc-700 dark:text-zinc-300">
            <p>
              <span className="text-zinc-500">Invoice Date:</span>{" "}
              <strong>{new Date(invoice.invoice_date).toLocaleDateString()}</strong>
            </p>
            <p>
              <span className="text-zinc-500">Due Date:</span>{" "}
              <strong>{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "Immediate"}</strong>
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center">
            <Receipt className="mr-1.5 h-4 w-4 text-blue-500" /> Balance Summary
          </p>
          <div className="text-sm space-y-1">
            <p className="text-zinc-500">Total Billed: <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(invoice.total_amount)}</span></p>
            <p className="text-zinc-500">Paid Amount: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(invoice.paid_amount)}</span></p>
            <p className="text-zinc-500">Remaining Due: <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-base">{formatCurrency(invoice.due_amount)}</span></p>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Billed Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <th className="py-3 px-4">Item Description</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4 text-right">Unit Price</th>
                <th className="py-3 px-4 text-right">Discount</th>
                <th className="py-3 px-4 text-right">Tax</th>
                <th className="py-3 px-4 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(invoice.items || []).map((item: any) => (
                <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                  <td className="py-3.5 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                    <div>
                      <span>{item.description}</span>
                      {isValidUuid(item.customer_service_id) && (
                        <div className="mt-1.5">
                          <Link
                            href={`/requests/${item.customer_service_id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors border border-indigo-200/60 dark:border-indigo-800/60 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                            aria-label={`Open request for ${item.description || "item"}`}
                            title="Open Request Workspace"
                          >
                            <ClipboardList className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <span>Open Request</span>
                            <ArrowRight className="h-3 w-3 opacity-60 shrink-0" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                    {item.quantity}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-zinc-500">
                    {formatCurrency(item.discount_amount)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-zinc-500">
                    {formatCurrency(item.tax_amount)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Summary & Payment History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment History / Allocations */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6 space-y-4">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
            <CreditCard className="mr-2 h-5 w-5 text-emerald-600" />
            Allocated Payments ({invoice.allocations?.length || 0})
          </h3>

          {!invoice.allocations || invoice.allocations.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">
              <p className="text-xs text-zinc-500">No payments allocated to this invoice yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoice.allocations.map((alloc: any) => {
                const pay = alloc.payment || {};
                const isRecorded = pay.status === "recorded";
                return (
                  <div
                    key={alloc.id}
                    className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          #{pay.payment_number || "PAY"}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isRecorded ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                          pay.status === "voided" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
                          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}>
                          {pay.status || "recorded"}
                        </span>
                      </div>
                      <p className="text-zinc-500 mt-1">
                        Method: <strong className="uppercase">{pay.payment_method}</strong> | Date: {pay.payment_date ? new Date(pay.payment_date).toLocaleDateString() : "-"}
                      </p>
                      {pay.reference_number && (
                        <p className="text-zinc-400 text-[10px]">Ref: {pay.reference_number}</p>
                      )}
                    </div>

                    <div className="text-right space-y-1">
                      <p className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(alloc.amount)}
                      </p>

                      {isRecorded && (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setConfirmModal({
                              type: 'void_payment',
                              id: pay.id,
                              title: `Void Payment #${pay.payment_number}`,
                              description: `Are you sure you want to VOID payment #${pay.payment_number}? This will restore the invoice's outstanding balance.`
                            })}
                            disabled={isActionPending}
                            className="text-[10px] text-red-600 hover:underline font-semibold"
                          >
                            Void
                          </button>
                          <span className="text-zinc-300">|</span>
                          <button
                            onClick={() => setConfirmModal({
                              type: 'refund_payment',
                              id: pay.id,
                              title: `Refund Payment #${pay.payment_number}`,
                              description: `Are you sure you want to REFUND payment #${pay.payment_number}? This will restore the invoice's outstanding balance.`
                            })}
                            disabled={isActionPending}
                            className="text-[10px] text-amber-600 hover:underline font-semibold"
                          >
                            Refund
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Financial Calculation Breakdown */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6 space-y-3 font-mono text-sm">
          <h3 className="text-xs font-sans font-bold text-zinc-500 uppercase tracking-wider mb-3">
            Financial Ledger Summary
          </h3>
          <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
            <span>Subtotal:</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
            <span>Discount:</span>
            <span>- {formatCurrency(invoice.discount_amount)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
            <span>Tax:</span>
            <span>+ {formatCurrency(invoice.tax_amount)}</span>
          </div>
          <div className="flex justify-between py-2 text-base font-bold text-zinc-900 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-700">
            <span>Total Invoice Amount:</span>
            <span>{formatCurrency(invoice.total_amount)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-emerald-600 dark:text-emerald-400 font-bold border-b border-zinc-100 dark:border-zinc-800">
            <span>Total Paid (Allocated):</span>
            <span>- {formatCurrency(invoice.paid_amount)}</span>
          </div>
          <div className="flex justify-between py-2 text-lg font-bold text-amber-600 dark:text-amber-400">
            <span>Outstanding Balance:</span>
            <span>{formatCurrency(invoice.due_amount)}</span>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        preselectedCustomerId={invoice.customer?.id}
        preselectedCustomerName={customerName}
        preselectedInvoiceId={invoice.id}
        preselectedInvoiceNumber={invoice.invoice_number}
        preselectedDueAmount={Number(invoice.due_amount)}
      />

      {/* Confirmation Dialog Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
                {confirmModal.title}
              </h3>
              <button
                onClick={() => setConfirmModal(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {confirmModal.description}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={isActionPending}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md transition-all"
              >
                {isActionPending ? "Processing..." : "Yes, Confirm Action"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
