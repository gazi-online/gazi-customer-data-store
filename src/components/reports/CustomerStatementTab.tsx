"use client";

import { useState, useEffect } from "react";
import { CustomerStatementData } from "@/lib/reports/report-types";
import { getCustomerStatementData } from "@/app/(dashboard)/reports/actions";
import { FileText, Download, User, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface CustomerStatementTabProps {
  customersList: Array<{ id: string; first_name: string; middle_name?: string | null; last_name: string; customer_code?: string }>;
  initialCustomerId?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
}

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CustomerStatementTab({
  customersList,
  initialCustomerId,
  initialDateFrom = "2026-01-01",
  initialDateTo = new Date().toISOString().split("T")[0],
}: CustomerStatementTabProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomerId || (customersList[0]?.id || "")
  );
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);

  const [statement, setStatement] = useState<CustomerStatementData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadStatement = async (cId: string, dFrom: string, dTo: string) => {
    if (!cId) return;
    try {
      setIsLoading(true);
      const data = await getCustomerStatementData(cId, dFrom, dTo);
      setStatement(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load customer statement.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCustomerId) {
      loadStatement(selectedCustomerId, dateFrom, dateTo);
    }
  }, [selectedCustomerId]);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCustomerId) {
      loadStatement(selectedCustomerId, dateFrom, dateTo);
    }
  };

  const handleExportCsv = () => {
    if (!statement) return;

    const headers = ["Date", "Reference", "Type", "Description", "Debit (Billed)", "Credit (Paid)", "Running Balance"];
    const rows = statement.entries.map((e) => [
      e.date,
      `"${e.reference}"`,
      `"${e.type}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      e.debit,
      e.credit,
      e.balance,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [
      `Customer Statement: "${statement.customerName}" (${statement.customerCode || ""})`,
      `Period: ${statement.dateFrom} to ${statement.dateTo}`,
      `Opening Balance: ${statement.openingBalance}`,
      `Closing Balance: ${statement.closingBalance}`,
      "",
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Statement_${statement.customerName.replace(/\s+/g, "_")}_${statement.dateFrom}_to_${statement.dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Customer & Date Selector Bar */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleApplyFilter} className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4 text-zinc-400 shrink-0" />
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Customer...</option>
              {customersList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.middle_name ? c.middle_name + " " : ""}{c.last_name} {c.customer_code ? `(${c.customer_code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-900 dark:text-zinc-100"
            />
            <span className="text-zinc-400 text-xs">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            {isLoading ? "Loading..." : "Generate Statement"}
          </button>
        </form>

        {statement && (
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-semibold transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export Statement CSV
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-16 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-xs text-zinc-500 font-semibold">Generating customer financial statement ledger...</p>
        </div>
      ) : !statement ? (
        <div className="p-16 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <FileText className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">No Customer Selected</h3>
          <p className="text-xs text-zinc-500 mt-1">Select a customer above to view their financial statement ledger.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Statement Header Card */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Statement For Customer</p>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                <Link href={`/customers/${statement.customerId}`} className="hover:text-blue-600 transition-colors">
                  {statement.customerName}
                </Link>
                {statement.customerCode && <span className="ml-2 text-xs font-mono text-zinc-500">({statement.customerCode})</span>}
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Statement Period: <strong>{statement.dateFrom}</strong> to <strong>{statement.dateTo}</strong>
              </p>
            </div>

            {/* Account Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs text-right">
              <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-sans font-bold text-zinc-400 uppercase">Opening Bal</p>
                <p className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">{formatCurrency(statement.openingBalance)}</p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-sans font-bold text-zinc-400 uppercase">Billed</p>
                <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">+{formatCurrency(statement.billedDuringPeriod)}</p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-sans font-bold text-zinc-400 uppercase">Paid</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">-{formatCurrency(statement.paymentsDuringPeriod)}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-xl border border-blue-200 dark:border-blue-800">
                <p className="text-[10px] font-sans font-bold text-blue-600 dark:text-blue-400 uppercase">Closing Bal</p>
                <p className="font-bold text-blue-700 dark:text-blue-300 text-sm mt-0.5">{formatCurrency(statement.closingBalance)}</p>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Chronological Ledger Entries ({statement.entries.length})
            </h3>

            {statement.entries.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">
                <p className="text-xs text-zinc-500">No transactions recorded for this customer in the selected date range.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Reference</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3">Description</th>
                      <th className="py-3 px-3 text-right">Debit (Billed)</th>
                      <th className="py-3 px-3 text-right">Credit (Paid)</th>
                      <th className="py-3 px-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                    {/* Opening Balance Row */}
                    <tr className="bg-zinc-50/50 dark:bg-zinc-950/50 font-bold text-zinc-500">
                      <td className="py-2.5 px-3">{statement.dateFrom}</td>
                      <td className="py-2.5 px-3">-</td>
                      <td className="py-2.5 px-3 uppercase text-[10px]">OPENING</td>
                      <td className="py-2.5 px-3 font-sans">Opening Balance Prior to {statement.dateFrom}</td>
                      <td className="py-2.5 px-3 text-right">-</td>
                      <td className="py-2.5 px-3 text-right">-</td>
                      <td className="py-2.5 px-3 text-right text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(statement.openingBalance)}
                      </td>
                    </tr>

                    {statement.entries.map((e) => (
                      <tr key={e.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40">
                        <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400">{e.date}</td>
                        <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">{e.reference}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            e.type === "invoice" ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" :
                            e.type === "payment" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }`}>
                            {e.type.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-sans text-zinc-800 dark:text-zinc-200">{e.description}</td>
                        <td className="py-3 px-3 text-right text-indigo-600 font-bold">
                          {e.debit > 0 ? formatCurrency(e.debit) : "-"}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-600 font-bold">
                          {e.credit > 0 ? formatCurrency(e.credit) : "-"}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(e.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
