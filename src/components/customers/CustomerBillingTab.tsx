"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Receipt, 
  CreditCard, 
  Plus, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Eye, 
  FileText, 
  ArrowUpRight 
} from "lucide-react";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";

interface CustomerBillingTabProps {
  customerId: string;
  customerName: string;
  billingSummary: {
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
    overdue: number;
    invoices: any[];
    payments: any[];
  };
  error?: string | null;
}

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CustomerBillingTab({
  customerId,
  customerName,
  billingSummary,
  error,
}: CustomerBillingTabProps) {
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-300 text-sm">
        <p className="font-bold flex items-center mb-1">
          <AlertTriangle className="h-4 w-4 mr-2" /> Unable to load billing records
        </p>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  const openInvoices = (billingSummary.invoices || []).filter(
    (inv) => Number(inv.due_amount) > 0 && inv.status !== "draft" && inv.status !== "cancelled"
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
            <Receipt className="h-5 w-5 mr-2 text-blue-600" />
            Billing & Invoices History
          </h3>
          <p className="text-xs text-zinc-500">Customer ledger, outstanding balance & transaction history.</p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href={`/invoices/new?customer_id=${customerId}`}
            className="inline-flex items-center justify-center px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-xs shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Invoice
          </Link>
          <button
            onClick={() => setIsRecordPaymentOpen(true)}
            className="inline-flex items-center justify-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium text-xs shadow-sm"
          >
            <CreditCard className="h-3.5 w-3.5 mr-1" /> Record Payment
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Billed */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Total Billed</p>
          <p className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {formatCurrency(billingSummary.totalBilled)}
          </p>
        </div>

        {/* Total Paid */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Total Paid</p>
          <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {formatCurrency(billingSummary.totalPaid)}
          </p>
        </div>

        {/* Outstanding */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Outstanding</p>
          <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {formatCurrency(billingSummary.outstanding)}
          </p>
        </div>

        {/* Overdue */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Overdue</p>
          <p className="text-xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
            {formatCurrency(billingSummary.overdue)}
          </p>
        </div>
      </div>

      {/* Customer Invoices Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
          <Receipt className="h-4 w-4 mr-1.5 text-blue-500" /> Recent Invoices ({billingSummary.invoices?.length || 0})
        </h4>

        {!billingSummary.invoices || billingSummary.invoices.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <Receipt className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-xs font-semibold text-zinc-500">No invoices issued for this customer yet.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-right">Paid</th>
                    <th className="py-2.5 px-3 text-right">Due</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {billingSummary.invoices.map((inv: any) => {
                    const isOverdue =
                      inv.due_date &&
                      inv.due_date < today &&
                      Number(inv.due_amount) > 0 &&
                      inv.status !== "draft" &&
                      inv.status !== "cancelled";

                    return (
                      <tr key={inv.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                        <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                          <Link href={`/invoices/${inv.id}`} className="hover:underline">
                            #{inv.invoice_number}
                          </Link>
                        </td>
                        <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400">
                          {new Date(inv.invoice_date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold">
                          {formatCurrency(inv.total_amount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-600">
                          {formatCurrency(inv.paid_amount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-amber-600">
                          {formatCurrency(inv.due_amount)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {isOverdue ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Overdue
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              inv.status === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                              inv.status === "partially_paid" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" :
                              inv.status === "cancelled" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
                              "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                              {inv.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="text-blue-600 dark:text-blue-400 font-semibold hover:underline text-[11px] inline-flex items-center"
                          >
                            View <ArrowUpRight className="h-3 w-3 ml-0.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Customer Payments Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
          <CreditCard className="h-4 w-4 mr-1.5 text-emerald-500" /> Recent Payments ({billingSummary.payments?.length || 0})
        </h4>

        {!billingSummary.payments || billingSummary.payments.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <CreditCard className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-xs font-semibold text-zinc-500">No payment transactions recorded for this customer yet.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                    <th className="py-2.5 px-3">Payment #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-center">Method</th>
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {billingSummary.payments.map((pay: any) => (
                    <tr key={pay.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                      <td className="py-3 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        #{pay.payment_number}
                      </td>
                      <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400">
                        {new Date(pay.payment_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {formatCurrency(pay.amount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          {pay.payment_method}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-500">
                        {pay.reference_number || "-"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          pay.status === "recorded" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                          pay.status === "voided" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
                          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}>
                          {pay.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        preselectedCustomerId={customerId}
        preselectedCustomerName={customerName}
        openInvoicesList={openInvoices.map((i) => ({
          id: i.id,
          invoice_number: i.invoice_number,
          due_amount: Number(i.due_amount),
        }))}
      />
    </div>
  );
}
