"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  AgeingBucketSummary, 
  AgeingItem, 
  CustomerReceivableSummary 
} from "@/lib/reports/report-types";
import { Clock, AlertTriangle, Download, ArrowUpDown, ChevronRight, User } from "lucide-react";

interface ReceivablesAgeingTabProps {
  bucketSummaries: AgeingBucketSummary[];
  items: AgeingItem[];
  customerSummaries: CustomerReceivableSummary[];
  totalOutstanding: number;
}

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ReceivablesAgeingTab({
  bucketSummaries,
  items,
  customerSummaries,
  totalOutstanding,
}: ReceivablesAgeingTabProps) {
  const [selectedBucket, setSelectedBucket] = useState<string>("all");
  const [sortField, setSortField] = useState<'outstanding' | 'overdue' | 'customerName'>('outstanding');
  const [sortAsc, setSortAsc] = useState(false);

  const filteredItems = items.filter((it) => {
    if (selectedBucket === "all") return true;
    return it.bucketKey === selectedBucket;
  });

  const sortedCustomerSummaries = [...customerSummaries].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (typeof valA === "string") {
      valA = (valA as string).toLowerCase();
      valB = (valB as string).toLowerCase();
    }
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const handleExportCsv = () => {
    const headers = ["Customer", "Invoice Number", "Invoice Date", "Due Date", "Days Overdue", "Total Amount", "Paid Amount", "Outstanding", "Bucket"];
    const rows = filteredItems.map((it) => [
      `"${it.customerName.replace(/"/g, '""')}"`,
      `"${it.invoiceNumber}"`,
      it.invoiceDate,
      it.dueDate || "",
      it.daysOverdue,
      it.totalAmount,
      it.paidAmount,
      it.dueAmount,
      `"${it.bucketLabel}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Receivables_Ageing_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
            <Clock className="h-5 w-5 mr-2 text-amber-500" />
            Accounts Receivable Ageing Analysis
          </h2>
          <p className="text-xs text-zinc-500">
            Current total outstanding: <strong className="font-mono text-zinc-900 dark:text-zinc-100 text-sm">{formatCurrency(totalOutstanding)}</strong>
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="inline-flex items-center justify-center px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-semibold transition-colors shadow-sm"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </button>
      </div>

      {/* Ageing Bucket Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {bucketSummaries.map((b) => {
          const isSelected = selectedBucket === b.key;
          return (
            <div
              key={b.key}
              onClick={() => setSelectedBucket(isSelected ? "all" : b.key)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700 ring-2 ring-amber-500/20"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{b.label}</p>
              <p className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
                {formatCurrency(b.outstandingAmount)}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>{b.invoiceCount} inv ({b.customerCount} cust)</span>
                <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{b.percentageOfTotal}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Customer Receivable Breakdown Summary */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
            <User className="h-4 w-4 mr-2 text-blue-500" />
            Customer Receivable Summary ({customerSummaries.length})
          </h3>
          <p className="text-xs text-zinc-500">Identify high-risk accounts requiring follow-up</p>
        </div>

        {customerSummaries.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">
            <p className="text-xs text-zinc-500">No active customer receivables found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                  <th
                    onClick={() => {
                      if (sortField === "customerName") setSortAsc(!sortAsc);
                      else { setSortField("customerName"); setSortAsc(true); }
                    }}
                    className="py-3 px-3 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Customer <ArrowUpDown className="inline h-3 w-3 ml-1" />
                  </th>
                  <th className="py-3 px-3 text-right">Total Billed</th>
                  <th className="py-3 px-3 text-right">Total Paid</th>
                  <th
                    onClick={() => {
                      if (sortField === "outstanding") setSortAsc(!sortAsc);
                      else { setSortField("outstanding"); setSortAsc(false); }
                    }}
                    className="py-3 px-3 text-right cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Outstanding <ArrowUpDown className="inline h-3 w-3 ml-1" />
                  </th>
                  <th
                    onClick={() => {
                      if (sortField === "overdue") setSortAsc(!sortAsc);
                      else { setSortField("overdue"); setSortAsc(false); }
                    }}
                    className="py-3 px-3 text-right cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Overdue <ArrowUpDown className="inline h-3 w-3 ml-1" />
                  </th>
                  <th className="py-3 px-3 text-center">Oldest Overdue</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {sortedCustomerSummaries.map((c) => (
                  <tr key={c.customerId} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      <Link href={`/customers/${c.customerId}`} className="hover:text-blue-600 transition-colors">
                        {c.customerName}
                      </Link>
                      {c.customerCode && <span className="ml-1 text-zinc-400 font-mono text-[10px]">({c.customerCode})</span>}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-600 dark:text-zinc-400">
                      {formatCurrency(c.totalBilled)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600">
                      {formatCurrency(c.totalPaid)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(c.outstanding)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(c.overdue)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {c.oldestDaysOverdue > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                          {c.oldestDaysOverdue} days ({c.oldestInvoiceNumber})
                        </span>
                      ) : (
                        <span className="text-zinc-400 text-[10px]">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/reports?tab=statement&customer_id=${c.customerId}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-semibold inline-flex items-center"
                      >
                        Statement <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Itemized Ageing Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Unpaid Invoice Ageing Ledger ({filteredItems.length})
          </h3>
          {selectedBucket !== "all" && (
            <button
              onClick={() => setSelectedBucket("all")}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Clear Bucket Filter ({selectedBucket})
            </button>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">
            <p className="text-xs text-zinc-500">No overdue receivables in this bucket.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Invoice #</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3 text-center">Days Overdue</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3 text-right">Paid</th>
                  <th className="py-3 px-3 text-right">Outstanding</th>
                  <th className="py-3 px-3 text-center">Ageing Bucket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredItems.map((it) => (
                  <tr key={it.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      <Link href={`/customers/${it.customerId}`} className="hover:text-blue-600 transition-colors">
                        {it.customerName}
                      </Link>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      <Link href={`/invoices/${it.id}`} className="hover:underline">
                        #{it.invoiceNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400">
                      {it.dueDate ? new Date(it.dueDate).toLocaleDateString() : "-"}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-amber-600">
                      {it.daysOverdue > 0 ? `${it.daysOverdue} days` : "Current"}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-600">
                      {formatCurrency(it.totalAmount)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600">
                      {formatCurrency(it.paidAmount)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(it.dueAmount)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        it.bucketKey === "current" ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" :
                        it.bucketKey === "1_30" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" :
                        it.bucketKey === "31_60" ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" :
                        "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}>
                        {it.bucketLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
