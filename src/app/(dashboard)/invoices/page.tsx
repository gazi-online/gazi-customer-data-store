import { Suspense } from "react";
import Link from "next/link";
import { getInvoices, InvoiceListItem } from "./actions";
import { Receipt, Plus, Search, Filter, AlertTriangle, Eye, CheckCircle2, Clock, XCircle, Printer } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getStatusBadge(status: string, isOverdue: boolean) {
  if (isOverdue) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
        <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" />
        Overdue
      </span>
    );
  }

  switch (status) {
    case "paid":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
          Paid
        </span>
      );
    case "partially_paid":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <Clock className="h-3 w-3 mr-1 text-blue-600" />
          Partially Paid
        </span>
      );
    case "issued":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          Issued
        </span>
      );
    case "draft":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
          Draft
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
          <XCircle className="h-3 w-3 mr-1 text-red-600" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          {status}
        </span>
      );
  }
}

function InvoicesTableSkeleton() {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden animate-pulse">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-50/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <th className="py-3.5 px-4">Invoice #</th>
              <th className="py-3.5 px-4">Customer</th>
              <th className="py-3.5 px-4">Invoice Date</th>
              <th className="py-3.5 px-4">Due Date</th>
              <th className="py-3.5 px-4 text-right">Total</th>
              <th className="py-3.5 px-4 text-right">Paid</th>
              <th className="py-3.5 px-4 text-right">Due</th>
              <th className="py-3.5 px-4 text-center">Status</th>
              <th className="py-3.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="h-16">
                <td className="py-4 px-4"><div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" /></td>
                <td className="py-4 px-4"><div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" /></td>
                <td className="py-4 px-4"><div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" /></td>
                <td className="py-4 px-4"><div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" /></td>
                <td className="py-4 px-4 text-right"><div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded ml-auto" /></td>
                <td className="py-4 px-4 text-right"><div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded ml-auto" /></td>
                <td className="py-4 px-4 text-right"><div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded ml-auto" /></td>
                <td className="py-4 px-4 text-center"><div className="h-6 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto" /></td>
                <td className="py-4 px-4 text-right"><div className="h-8 w-24 bg-zinc-200 dark:bg-zinc-800 rounded ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function InvoicesTableContent({
  search,
  status,
}: {
  search?: string;
  status?: string;
}) {
  const invoices = await getInvoices(search, status);
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices found"
          description="Try clearing filters or create a new invoice."
          action={
            <Link
              href="/invoices/new"
              className="inline-flex items-center px-4 py-2.5 min-h-[44px] bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition-colors shadow-xs"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Create Invoice
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-zinc-50/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <th className="py-3.5 px-4">Invoice #</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Invoice Date</th>
                <th className="py-3.5 px-4">Due Date</th>
                <th className="py-3.5 px-4 text-right">Total</th>
                <th className="py-3.5 px-4 text-right">Paid</th>
                <th className="py-3.5 px-4 text-right">Due</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {invoices.map((inv: InvoiceListItem) => {
                const isOverdue = Boolean(
                  inv.due_date &&
                  inv.due_date < today &&
                  Number(inv.due_amount) > 0 &&
                  inv.status !== "draft" &&
                  inv.status !== "cancelled"
                );

                const customerName = inv.customer
                  ? `${inv.customer.first_name} ${inv.customer.middle_name ? inv.customer.middle_name + " " : ""}${inv.customer.last_name}`
                  : "Unknown Customer";

                return (
                  <tr
                    key={inv.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors group"
                  >
                    <td className="py-4 px-4 font-mono font-bold text-violet-600 dark:text-violet-400">
                      <Link href={`/invoices/${inv.id}`} className="hover:underline">
                        #{inv.invoice_number}
                      </Link>
                    </td>
                    <td className="py-4 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                      {inv.customer ? (
                        <Link
                          href={`/customers/${inv.customer.id}`}
                          className="hover:text-violet-600 transition-colors"
                        >
                          {customerName}
                        </Link>
                      ) : (
                        customerName
                      )}
                    </td>
                    <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 text-xs">
                      {new Date(inv.invoice_date).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 text-xs">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "-"}
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(inv.paid_amount)}
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(inv.due_amount)}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {getStatusBadge(inv.status, isOverdue)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="inline-flex items-center px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-900/30 dark:hover:text-violet-400 rounded-lg text-xs font-semibold transition-colors"
                          aria-label={`View invoice #${inv.invoice_number}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Link>
                        <Link
                          href={`/invoices/${inv.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 rounded-lg text-xs font-semibold transition-colors"
                          aria-label={`Print invoice #${inv.invoice_number}`}
                        >
                          <Printer className="h-3.5 w-3.5 mr-1" /> Print
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const { search, status } = await searchParams;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-150">
      {/* Page Title & Actions */}
      <PageHeader
        title="Invoices Management"
        description="Authoritative billing records, status tracking & payment reconciliations."
        icon={Receipt}
        iconVariant="plain"
        actions={
          <Link
            href="/invoices/new"
            className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 text-white font-bold text-sm rounded-xl shadow-xs hover:shadow-sm transition-all"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Invoice
          </Link>
        }
      />

      {/* Filter and Search Toolbar */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <form method="GET" className="w-full md:w-auto flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              name="search"
              defaultValue={search || ""}
              placeholder="Search by invoice # or customer name..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-zinc-400 shrink-0" />
            <select
              name="status"
              defaultValue={status || "all"}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
              <option value="overdue">Overdue (Derived)</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-sm font-semibold transition-colors"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Invoices Table Streamed via Suspense Boundary */}
      <Suspense key={`${search || ""}-${status || ""}`} fallback={<InvoicesTableSkeleton />}>
        <InvoicesTableContent search={search} status={status} />
      </Suspense>
    </div>
  );
}
