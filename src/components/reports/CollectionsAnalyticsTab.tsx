"use client";

import { CollectionsAnalyticsData } from "@/lib/reports/report-types";
import { CreditCard, Wallet, Landmark, QrCode, Banknote, HelpCircle } from "lucide-react";
import { PaymentMethod } from "@/types/billing";

interface CollectionsAnalyticsTabProps {
  data: CollectionsAnalyticsData;
  dateFrom: string;
  dateTo: string;
}

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CollectionsAnalyticsTab({ data, dateFrom, dateTo }: CollectionsAnalyticsTabProps) {
  const methodIcons: Record<PaymentMethod, any> = {
    upi: QrCode,
    cash: Banknote,
    bank_transfer: Landmark,
    card: CreditCard,
    cheque: Wallet,
    other: HelpCircle,
  };

  const methodLabels: Record<PaymentMethod, string> = {
    upi: "UPI / QR",
    cash: "Cash",
    bank_transfer: "Bank Transfer (NEFT/RTGS/IMPS)",
    card: "Debit / Credit Card",
    cheque: "Cheque",
    other: "Other",
  };

  const total = data.totalCollections || 1;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
            <CreditCard className="h-5 w-5 mr-2 text-emerald-600" />
            Collections Analytics (Money Received)
          </h2>
          <p className="text-xs text-zinc-500">
            Total Collections ({data.recentPaymentsCount} valid recorded payments):{" "}
            <strong className="font-mono text-emerald-600 dark:text-emerald-400 text-sm">{formatCurrency(data.totalCollections)}</strong>
          </p>
        </div>
        <div className="text-xs text-zinc-400 italic">
          * Excludes voided & refunded transactions
        </div>
      </div>

      {/* Payment Method Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Object.keys(data.byMethod) as PaymentMethod[]).map((method) => {
          const amt = data.byMethod[method] || 0;
          const Icon = methodIcons[method] || HelpCircle;
          const pct = Math.round((amt / total) * 100);

          return (
            <div
              key={method}
              className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-start justify-between"
            >
              <div>
                <div className="flex items-center space-x-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  <Icon className="h-4 w-4 text-emerald-600" />
                  <span>{methodLabels[method]}</span>
                </div>
                <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-2">
                  {formatCurrency(amt)}
                </p>
                <div className="mt-3 flex items-center space-x-2">
                  <div className="w-24 bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-semibold text-zinc-500">{pct}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly Collections Breakdown Table & Visual Bars */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          Monthly Collections Breakdown
        </h3>

        {data.monthlyTrends.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">
            <p className="text-xs text-zinc-500">No collection records found for this period.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                    <th className="py-3 px-4">Period (Month)</th>
                    <th className="py-3 px-4 text-right">Collections</th>
                    <th className="py-3 px-4 text-right">Distribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {data.monthlyTrends.map((t) => {
                    const pct = Math.round((t.amount / total) * 100);
                    return (
                      <tr key={t.month} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                        <td className="py-3 px-4 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                          {t.month}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(t.amount)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <div className="w-32 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-emerald-600 h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="font-mono text-zinc-500 text-[11px] w-8">{pct}%</span>
                          </div>
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
    </div>
  );
}
