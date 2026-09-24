"use client";

import Link from "next/link";
import { Search, Filter, Edit, Eye, Receipt, X, Users, ChevronDown, Plus } from "lucide-react";
import { CustomerListRow } from "@/types/customer";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CustomerDeleteButton } from "@/components/customers/CustomerDeleteButton";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";
import { getCustomerListRows } from "@/app/(dashboard)/customers/actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineErrorState } from "@/components/ui/InlineErrorState";

interface CustomerTableProps {
  initialCustomers?: CustomerListRow[];
}

export function CustomerTable({ initialCustomers }: CustomerTableProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const normalizedSearch = searchParams.get("search")?.trim() || undefined;
  const normalizedStatus = searchParams.get("status") || undefined;
  const isFiltered = Boolean(normalizedSearch) || (Boolean(normalizedStatus) && normalizedStatus !== "all");

  const {
    data: customers = initialCustomers || [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.customers.list(DASHBOARD_MEMORY_SCOPE, {
      search: normalizedSearch,
      status: normalizedStatus,
    }),
    queryFn: () => getCustomerListRows(normalizedSearch, normalizedStatus),
    staleTime: 20 * 1000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });

  const visibleCustomers = customers.filter((c) => !deletedIds.includes(c.id));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search) {
      params.set("search", search);
    } else {
      params.delete("search");
    }
    router.push(`/customers?${params.toString()}`);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams);
    if (e.target.value && e.target.value !== "all") {
      params.set("status", e.target.value);
    } else {
      params.delete("status");
    }
    router.push(`/customers?${params.toString()}`);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-[0_4px_18px_rgba(15,23,42,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-150">
      {/* Toolbar */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-zinc-900/50">
        <form onSubmit={handleSearch} className="relative w-full sm:flex-1 sm:max-w-md">
          <label htmlFor="customer-search-input" className="sr-only">
            Search customers
          </label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-zinc-500 pointer-events-none" />
          <input
            id="customer-search-input"
            type="text"
            placeholder="Search customers by name, phone, code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2 min-h-[44px] bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all shadow-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                const params = new URLSearchParams(searchParams);
                params.delete("search");
                router.push(`/customers?${params.toString()}`);
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        <div className="relative w-full sm:w-auto min-w-[150px] sm:min-w-[160px]">
          <div className="relative flex items-center">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <select
              id="customer-status-filter"
              onChange={handleStatusChange}
              value={searchParams.get("status") || "all"}
              aria-label="Filter customers by status"
              className="w-full py-2 pl-8.5 pr-8 min-h-[44px] bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer shadow-xs appearance-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="lead">Lead</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Active Filter Indicators */}
      {isFiltered && (
        <div className="px-3.5 sm:px-4 py-2 bg-violet-50/50 dark:bg-violet-950/20 border-b border-violet-100 dark:border-violet-900/40 flex items-center justify-between text-xs text-slate-600 dark:text-zinc-300">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-700 dark:text-slate-300">Filters:</span>
            {normalizedSearch && (
              <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-[11px] font-mono">
                &ldquo;{normalizedSearch}&rdquo;
              </span>
            )}
            {normalizedStatus && normalizedStatus !== "all" && (
              <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-[11px] capitalize">
                {normalizedStatus}
              </span>
            )}
            <span className="text-slate-400">({visibleCustomers.length} results)</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              router.push("/customers");
            }}
            className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 hover:underline font-semibold"
          >
            Reset all
          </button>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-slate-50/80 dark:bg-zinc-800/50 border-b border-slate-200/80 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-5 py-3.5">Name</th>
              <th scope="col" className="px-5 py-3.5">Contact</th>
              <th scope="col" className="px-5 py-3.5">Status</th>
              <th scope="col" className="px-5 py-3.5">Added On</th>
              <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`customer-skeleton-${i}`} className="animate-pulse">
                  <td className="px-5 py-4">
                    <div className="h-4 w-32 bg-slate-200 dark:bg-zinc-800 rounded mb-1.5" />
                    <div className="h-3 w-16 bg-slate-100 dark:bg-zinc-800/60 rounded" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-4 w-28 bg-slate-200 dark:bg-zinc-800 rounded mb-1.5" />
                    <div className="h-3 w-36 bg-slate-100 dark:bg-zinc-800/60 rounded" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-5 w-16 bg-slate-200 dark:bg-zinc-800 rounded-full" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-4 w-20 bg-slate-200 dark:bg-zinc-800 rounded" />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="h-7 w-20 bg-slate-200 dark:bg-zinc-800 rounded-lg ml-auto" />
                  </td>
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={5} className="px-6 py-12">
                  <InlineErrorState
                    title="Unable to load customer list"
                    message="Please check your connection and try again."
                    onRetry={() => refetch()}
                    bordered={false}
                  />
                </td>
              </tr>
            ) : visibleCustomers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12">
                  {isFiltered ? (
                    <EmptyState
                      icon={Search}
                      title="No matching customers"
                      description="No customers match your search query or status filter. Try clearing filters to see all customers."
                      action={
                        <button
                          type="button"
                          onClick={() => {
                            setSearch("");
                            router.push("/customers");
                          }}
                          className="inline-flex items-center px-3.5 py-2 min-h-[44px] bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          Reset all filters
                        </button>
                      }
                      bordered={false}
                    />
                  ) : (
                    <EmptyState
                      icon={Users}
                      title="No customers yet"
                      description="Get started by adding your first customer to the directory."
                      action={
                        <Link
                          href="/customers/new"
                          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Add Customer</span>
                        </Link>
                      }
                      bordered={false}
                    />
                  )}
                </td>
              </tr>
            ) : (
              visibleCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors group"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-semibold text-slate-900 dark:text-zinc-100 hover:text-violet-600 dark:hover:text-violet-400 transition-colors focus:outline-none focus-visible:underline block"
                    >
                      {customer.first_name} {customer.middle_name ? `${customer.middle_name} ` : ""}{customer.last_name}
                    </Link>
                    {customer.customer_code && (
                      <span className="inline-block text-[11px] font-mono text-slate-400 dark:text-zinc-500 mt-0.5">
                        {customer.customer_code}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="font-mono text-xs sm:text-sm text-slate-700 dark:text-zinc-300 font-medium">
                      {customer.phone}
                    </div>
                    {customer.email && (
                      <div className="text-[11px] text-slate-400 dark:text-zinc-500 truncate max-w-[200px]" title={customer.email}>
                        {customer.email}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        customer.status === "active"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/40"
                          : customer.status === "inactive"
                          ? "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border-slate-200 dark:border-zinc-700"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/40"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${
                          customer.status === "active"
                            ? "bg-emerald-500"
                            : customer.status === "inactive"
                            ? "bg-slate-400 dark:bg-zinc-500"
                            : "bg-blue-500"
                        }`}
                        aria-hidden="true"
                      />
                      {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                    {new Date(customer.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/40 dark:hover:text-violet-300 text-slate-700 dark:text-zinc-200 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        aria-label={`View profile for ${customer.first_name} ${customer.last_name}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View</span>
                      </Link>
                      <Link
                        href={`/customers/${customer.id}/edit`}
                        className="p-1.5 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        title="Edit Customer"
                        aria-label={`Edit customer ${customer.first_name} ${customer.last_name}`}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        href={`/invoices/new?customer_id=${customer.id}`}
                        className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        title="Create Invoice"
                        aria-label={`Create invoice for ${customer.first_name} ${customer.last_name}`}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                      </Link>
                      <CustomerDeleteButton
                        customerId={customer.id}
                        customerName={`${customer.first_name} ${customer.last_name}`}
                        onDeleted={(id) => setDeletedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
                        onRestored={(id) => setDeletedIds((prev) => prev.filter((deletedId) => deletedId !== id))}
                        variant="icon"
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden divide-y divide-slate-100 dark:divide-zinc-800/80">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`customer-card-skeleton-${i}`} className="p-4 flex flex-col gap-3 animate-pulse">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-36 bg-slate-200 dark:bg-zinc-800 rounded mb-1" />
                  <div className="h-3 w-20 bg-slate-100 dark:bg-zinc-800/60 rounded" />
                </div>
                <div className="h-5 w-16 bg-slate-200 dark:bg-zinc-800 rounded-full" />
              </div>
              <div className="grid grid-cols-1 gap-1">
                <div className="h-3.5 w-28 bg-slate-100 dark:bg-zinc-800/60 rounded" />
                <div className="h-3 w-24 bg-slate-100 dark:bg-zinc-800/60 rounded" />
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
                <div className="h-9 w-16 bg-slate-100 dark:bg-zinc-800 rounded-lg" />
                <div className="h-9 w-16 bg-slate-100 dark:bg-zinc-800 rounded-lg" />
              </div>
            </div>
          ))
        ) : isError ? (
          <div className="p-4">
            <InlineErrorState
              title="Unable to load customer list"
              message="Please check your connection and try again."
              onRetry={() => refetch()}
              bordered={false}
            />
          </div>
        ) : visibleCustomers.length === 0 ? (
          <div className="p-4">
            {isFiltered ? (
              <EmptyState
                icon={Search}
                title="No matching customers"
                description="No customers match your search query or status filter. Try clearing filters to see all customers."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      router.push("/customers");
                    }}
                    className="inline-flex items-center px-3.5 py-2 min-h-[44px] bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    Reset all filters
                  </button>
                }
                bordered={false}
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No customers yet"
                description="Get started by adding your first customer to the directory."
                action={
                  <Link
                    href="/customers/new"
                    className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Customer</span>
                  </Link>
                }
                bordered={false}
              />
            )}
          </div>
        ) : (
          visibleCustomers.map((customer) => (
            <div
              key={customer.id}
              className="p-4 flex flex-col gap-3 hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition-colors"
            >
              {/* Header: Name + Code + Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-semibold text-slate-900 dark:text-zinc-100 hover:text-violet-600 dark:hover:text-violet-400 text-sm leading-snug break-words"
                  >
                    {customer.first_name} {customer.middle_name ? `${customer.middle_name} ` : ""}{customer.last_name}
                  </Link>
                  {customer.customer_code && (
                    <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 mt-0.5">
                      {customer.customer_code}
                    </div>
                  )}
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${
                    customer.status === "active"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/40"
                      : customer.status === "inactive"
                      ? "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border-slate-200 dark:border-zinc-700"
                      : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/40"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1 shrink-0 ${
                      customer.status === "active"
                        ? "bg-emerald-500"
                        : customer.status === "inactive"
                        ? "bg-slate-400 dark:bg-zinc-500"
                        : "bg-blue-500"
                    }`}
                    aria-hidden="true"
                  />
                  {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
                </span>
              </div>

              {/* Contact & Date */}
              <div className="grid grid-cols-1 gap-1 text-xs text-slate-600 dark:text-zinc-300">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-slate-400 dark:text-zinc-500 text-[11px]">Phone:</span>
                  <span className="font-medium font-mono text-slate-700 dark:text-zinc-200">{customer.phone}</span>
                </div>
                {customer.email && (
                  <div className="flex items-center gap-1.5 truncate text-slate-500 dark:text-zinc-400">
                    <span className="text-slate-400 dark:text-zinc-500 text-[11px]">Email:</span>
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
                <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                  Added on {new Date(customer.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Actions with min-h-[44px] touch target */}
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-end gap-2 flex-wrap">
                <Link
                  href={`/invoices/new?customer_id=${customer.id}`}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={`Create invoice for ${customer.first_name} ${customer.last_name}`}
                >
                  <Receipt className="h-3.5 w-3.5" />
                  <span>+ Invoice</span>
                </Link>
                <Link
                  href={`/customers/${customer.id}/edit`}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] text-xs font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  aria-label={`Edit customer ${customer.first_name} ${customer.last_name}`}
                >
                  <Edit className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </Link>
                <CustomerDeleteButton
                  customerId={customer.id}
                  customerName={`${customer.first_name} ${customer.last_name}`}
                  onDeleted={(id) => setDeletedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
                  onRestored={(id) => setDeletedIds((prev) => prev.filter((deletedId) => deletedId !== id))}
                  variant="icon"
                />
                <Link
                  href={`/customers/${customer.id}`}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] text-xs font-semibold rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 shadow-xs"
                  aria-label={`View profile for ${customer.first_name} ${customer.last_name}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>View</span>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
