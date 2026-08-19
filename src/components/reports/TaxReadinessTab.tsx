"use client";

import { TaxReadinessSummary } from "@/lib/reports/report-types";
import { FileText, AlertCircle, Info, Tag, Percent } from "lucide-react";

interface TaxReadinessTabProps {
  data: TaxReadinessSummary;
  dateFrom: string;
  dateTo: string;
}

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TaxReadinessTab({ data, dateFrom, dateTo }: TaxReadinessTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Disclaimer Alert Box */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
        <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm">Tax / GST Readiness Summary Notice</p>
          <p className="leading-relaxed">
            This summary is based on generic invoice tax amounts recorded in the system and is not a statutory GST return (e.g. GSTR-1 / GSTR-3B). Tax rates and state CGST/SGST/IGST splits are not inferred automatically.
          </p>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Taxable Subtotal Base */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Taxable Billing Base</p>
          <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {formatCurrency(data.taxableBillingBase)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">Invoice subtotal amount</p>
        </div>

        {/* Discount Total */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Discounts Allowed</p>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            - {formatCurrency(data.discountTotal)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">Deducted before tax</p>
        </div>

        {/* Tax Amount Billed */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Tax Billed</p>
          <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
            + {formatCurrency(data.taxAmountBilled)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">Generic invoice tax sum</p>
        </div>

        {/* Total Invoice Amount */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Gross Billed Total</p>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {formatCurrency(data.totalInvoiceAmount)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">Subtotal - Discount + Tax</p>
        </div>
      </div>

      {/* Invoice Tax Classification Breakdown */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
          <FileText className="h-4 w-4 mr-2 text-blue-500" />
          Invoice Tax Classification Breakdown ({data.totalActiveInvoicesCount} active invoices)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase">Invoices With Tax Charged</p>
              <p className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                {data.invoicesWithTaxCount} invoices
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-2.5 py-1 rounded-lg">
              {data.totalActiveInvoicesCount > 0 ? Math.round((data.invoicesWithTaxCount / data.totalActiveInvoicesCount) * 100) : 0}%
            </span>
          </div>

          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase">Zero-Tax / Exempt Invoices</p>
              <p className="text-xl font-bold font-mono text-zinc-700 dark:text-zinc-300 mt-1">
                {data.zeroTaxInvoicesCount} invoices
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 px-2.5 py-1 rounded-lg">
              {data.totalActiveInvoicesCount > 0 ? Math.round((data.zeroTaxInvoicesCount / data.totalActiveInvoicesCount) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
