"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  CreditCard, 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle,
  X
} from "lucide-react";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { voidPayment, refundPayment, getPaymentFormOptions, PaymentListItem, PaymentFormCustomerOption, PaymentFormInvoiceOption } from "@/app/(dashboard)/payments/actions";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

interface PaymentsViewProps {
  payments: PaymentListItem[];
  customers?: PaymentFormCustomerOption[];
  openInvoices?: PaymentFormInvoiceOption[];
  initialSearch?: string;
  initialStatus?: string;
  initialMethod?: string;
}

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PaymentsView({
  payments,
  customers = [],
  openInvoices = [],
  initialSearch = "",
  initialStatus = "all",
  initialMethod = "all",
}: PaymentsViewProps) {
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [isFetchingOptions, setIsFetchingOptions] = useState(false);
  const [loadedCustomerOptions, setLoadedCustomerOptions] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [loadedInvoiceOptions, setLoadedInvoiceOptions] = useState<Array<{ id: string; invoice_number: string; due_amount: number }>>([]);
  const [confirmModal, setConfirmModal] = useState<{
    type: 'void_payment' | 'refund_payment';
    id: string;
    title: string;
    description: string;
  } | null>(null);

  const handleOpenRecordModal = async () => {
    setIsFetchingOptions(true);
    try {
      const { customers: custs, openInvoices: invs } = await getPaymentFormOptions();
      setLoadedCustomerOptions(
        custs.map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.middle_name ? c.middle_name + " " : ""}${c.last_name}`,
          code: c.customer_code || undefined,
        }))
      );
      setLoadedInvoiceOptions(
        invs.map((i) => ({
          id: i.id,
          invoice_number: i.invoice_number,
          due_amount: Number(i.due_amount),
        }))
      );
      setIsRecordModalOpen(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load payment options.";
      toast.error(message);
    } finally {
      setIsFetchingOptions(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmModal) return;

    try {
      setIsActionPending(true);
      if (confirmModal.type === 'void_payment') {
        const res = await voidPayment(confirmModal.id);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Payment voided successfully!");
      } else if (confirmModal.type === 'refund_payment') {
        const res = await refundPayment(confirmModal.id);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Payment refunded successfully!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed.";
      toast.error(msg);
    } finally {
      setIsActionPending(false);
      setConfirmModal(null);
    }
  };

  const customerOptions = customers.map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.middle_name ? c.middle_name + " " : ""}${c.last_name}`,
    code: c.customer_code || undefined,
  }));

  const invoiceOptions = openInvoices.map((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    due_amount: Number(i.due_amount),
  }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-150">
      {/* Header */}
      <PageHeader
        title="Payments & Collections"
        description="Payment audit trail, atomic allocation logs & void/refund management."
        icon={<CreditCard className="mr-3 h-8 w-8 text-emerald-600 shrink-0" />}
        actions={
          <button
            onClick={handleOpenRecordModal}
            disabled={isFetchingOptions}
            className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 text-white font-bold text-sm rounded-xl shadow-xs hover:shadow-sm transition-all"
          >
            <Plus className="mr-2 h-4 w-4" />
            {isFetchingOptions ? "Loading..." : "Record Payment"}
          </button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-center">
        <form method="GET" className="w-full flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              name="search"
              defaultValue={initialSearch}
              placeholder="Search payment #, ref # or customer..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-400 shrink-0" />
            <select
              name="status"
              defaultValue={initialStatus}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All Statuses</option>
              <option value="recorded">Recorded</option>
              <option value="voided">Voided</option>
              <option value="refunded">Refunded</option>
            </select>

            <select
              name="method"
              defaultValue={initialMethod}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All Methods</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-sm font-semibold transition-colors"
            >
              Apply
            </button>
          </div>
        </form>
      </div>

      {/* Payments Table */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments found"
            description="Record a payment or change search filters."
            action={
              <button
                onClick={handleOpenRecordModal}
                disabled={isFetchingOptions}
                className="inline-flex items-center px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs"
              >
                <Plus className="mr-1.5 h-4 w-4" /> {isFetchingOptions ? "Loading..." : "Record Payment"}
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <th className="py-3.5 px-4">Payment #</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4 text-center">Method</th>
                  <th className="py-3.5 px-4">Reference</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4">Allocated Invoices</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {payments.map((pay: PaymentListItem) => {
                  const customerName = pay.customer
                    ? `${pay.customer.first_name} ${pay.customer.middle_name ? pay.customer.middle_name + " " : ""}${pay.customer.last_name}`
                    : "Unknown Customer";

                  const isRecorded = pay.status === "recorded";

                  return (
                    <tr
                      key={pay.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors group"
                    >
                      <td className="py-4 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        #{pay.payment_number}
                      </td>
                      <td className="py-4 px-4 font-medium text-slate-900 dark:text-zinc-100">
                        {pay.customer ? (
                          <Link
                            href={`/customers/${pay.customer.id}`}
                            className="hover:text-violet-600 transition-colors"
                          >
                            {customerName}
                          </Link>
                        ) : (
                          customerName
                        )}
                      </td>
                      <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 text-xs">
                        {new Date(pay.payment_date).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(pay.amount)}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          {pay.payment_method}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-zinc-500">
                        {pay.reference_number || "-"}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isRecorded ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                          pay.status === "voided" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
                          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}>
                          {pay.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-xs">
                        {pay.allocations && pay.allocations.length > 0 ? (
                          <div className="space-y-1">
                            {pay.allocations.map((alloc) => (
                              <div key={alloc.id} className="flex items-center space-x-1 font-mono">
                                <Link
                                  href={`/invoices/${alloc.invoice?.id}`}
                                  className="text-blue-600 dark:text-blue-400 hover:underline font-bold"
                                >
                                  #{alloc.invoice?.invoice_number}
                                </Link>
                                <span className="text-zinc-400">({formatCurrency(alloc.amount)})</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">Unallocated</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {isRecorded ? (
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => setConfirmModal({
                                type: 'void_payment',
                                id: pay.id,
                                title: `Void Payment #${pay.payment_number}`,
                                description: `Are you sure you want to VOID payment #${pay.payment_number}? All associated invoice allocations will be recalculated.`,
                              })}
                              disabled={isActionPending}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/30 dark:hover:bg-red-900/50 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Void
                            </button>
                            <button
                              onClick={() => setConfirmModal({
                                type: 'refund_payment',
                                id: pay.id,
                                title: `Refund Payment #${pay.payment_number}`,
                                description: `Are you sure you want to REFUND payment #${pay.payment_number}? All associated invoice allocations will be recalculated.`,
                              })}
                              disabled={isActionPending}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:hover:bg-amber-900/50 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Refund
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">Locked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        customersList={loadedCustomerOptions.length > 0 ? loadedCustomerOptions : customerOptions}
        openInvoicesList={loadedInvoiceOptions.length > 0 ? loadedInvoiceOptions : invoiceOptions}
      />

      {/* Custom Confirmation Modal */}
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
