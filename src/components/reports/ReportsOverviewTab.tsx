"use client";

import { ReportOverviewData } from "@/lib/reports/report-types";
import { Receipt, CreditCard, Clock, AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react";

interface ReportsOverviewTabProps {
  data: ReportOverviewData;
  dateFrom: string;
  dateTo: string;
}

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ReportsOverviewTab({ data, dateFrom, dateTo }: ReportsOverviewTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
            Financial Executive Overview
          </h2>
          <p className="text-xs text-zinc-500">
            Reporting Period: <strong className="text-zinc-700 dark:text-zinc-300">{dateFrom}</strong> to <strong className="text-zinc-700 dark:text-zinc-300">{dateTo}</strong>
          </p>
        </div>
      </div>

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Billed */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Receipt className="h-12 w-12 text-blue-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Billed</p>
          <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-white mt-1">
            {formatCurrency(data.totalBilled)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">Issued/paid active invoices</p>
        </div>

        {/* Total Collected */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <CreditCard className="h-12 w-12 text-emerald-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Collected</p>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {formatCurrency(data.totalCollected)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">Valid recorded payments</p>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Clock className="h-12 w-12 text-amber-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Outstanding Receivables</p>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {formatCurrency(data.outstandingReceivables)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">Unpaid non-cancelled balance</p>
        </div>

        {/* Overdue Receivables */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <AlertTriangle className="h-12 w-12 text-red-600" />
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Overdue Receivables</p>
          <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
            {formatCurrency(data.overdueReceivables)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-2">Past due_date balance</p>
        </div>
      </div>

      {/* Secondary Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Open Invoices</p>
            <p className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
              {data.openInvoicesCount}
            </p>
          </div>
          <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg">
            Issued / Partial
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Fully Paid Invoices</p>
            <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {data.paidInvoicesCount}
            </p>
          </div>
          <span className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg">
            Fully Settled
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Collection Rate</p>
            <p className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
              {data.collectionRate}%
            </p>
          </div>
          <div className="w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, data.collectionRate)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
