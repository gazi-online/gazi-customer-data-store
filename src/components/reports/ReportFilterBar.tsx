"use client";

import { useState } from "react";
import { Filter, Calendar, Users, RefreshCw } from "lucide-react";
import { QuickDateRange, ReportFilterParams } from "@/lib/reports/report-types";

interface ReportFilterBarProps {
  customersList: Array<{ id: string; first_name: string; middle_name?: string | null; last_name: string; customer_code?: string }>;
  initialParams: ReportFilterParams;
  onFilterChange: (params: ReportFilterParams) => void;
  showCustomerFilter?: boolean;
}

export function ReportFilterBar({
  customersList,
  initialParams,
  onFilterChange,
  showCustomerFilter = true,
}: ReportFilterBarProps) {
  const [quickRange, setQuickRange] = useState<QuickDateRange>(
    initialParams.quickRange || "this_month"
  );
  const [dateFrom, setDateFrom] = useState(initialParams.dateFrom || "");
  const [dateTo, setDateTo] = useState(initialParams.dateTo || "");
  const [customerId, setCustomerId] = useState(initialParams.customerId || "");
  const [invoiceStatus, setInvoiceStatus] = useState(initialParams.invoiceStatus || "all");
  const [paymentMethod, setPaymentMethod] = useState(initialParams.paymentMethod || "all");

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onFilterChange({
      quickRange,
      dateFrom,
      dateTo,
      customerId: customerId || undefined,
      invoiceStatus: invoiceStatus !== "all" ? invoiceStatus : undefined,
      paymentMethod: paymentMethod !== "all" ? paymentMethod : undefined,
    });
  };

  const handleQuickRangeChange = (range: QuickDateRange) => {
    setQuickRange(range);
    onFilterChange({
      quickRange: range,
      dateFrom: range === "custom" ? dateFrom : undefined,
      dateTo: range === "custom" ? dateTo : undefined,
      customerId: customerId || undefined,
      invoiceStatus: invoiceStatus !== "all" ? invoiceStatus : undefined,
      paymentMethod: paymentMethod !== "all" ? paymentMethod : undefined,
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Quick Date Range Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl text-xs font-semibold">
          {[
            { id: "this_month", label: "This Month" },
            { id: "last_month", label: "Last Month" },
            { id: "last_30_days", label: "Last 30 Days" },
            { id: "this_financial_year", label: "This FY (Apr-Mar)" },
            { id: "custom", label: "Custom Dates" },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => handleQuickRangeChange(r.id as QuickDateRange)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                quickRange === r.id
                  ? "bg-blue-600 text-white shadow-sm font-bold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => handleApply()}
          className="inline-flex items-center px-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-semibold transition-colors shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh Filters
        </button>
      </div>

      {/* Filter Inputs Grid */}
      <form onSubmit={handleApply} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        {/* Date From & Date To (for custom range or explicit dates) */}
        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setQuickRange("custom");
            }}
            placeholder="From Date"
            className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-zinc-400 text-xs">-</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setQuickRange("custom");
            }}
            placeholder="To Date"
            className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Customer Filter */}
        {showCustomerFilter && (
          <div>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Customers</option>
              {customersList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.middle_name ? c.middle_name + " " : ""}{c.last_name} {c.customer_code ? `(${c.customer_code})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Invoice Status Filter */}
        <div>
          <select
            value={invoiceStatus}
            onChange={(e) => setInvoiceStatus(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Invoice Statuses</option>
            <option value="issued">Issued</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {/* Payment Method Filter */}
        <div>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Payment Methods</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </div>
      </form>
    </div>
  );
}
