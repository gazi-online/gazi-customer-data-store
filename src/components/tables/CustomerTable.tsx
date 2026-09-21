"use client";

import Link from "next/link";
import { Search, Filter, Edit, Eye, AlertCircle, RefreshCw } from "lucide-react";
import { CustomerListRow } from "@/types/customer";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CustomerDeleteButton } from "@/components/customers/CustomerDeleteButton";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";
import { getCustomerListRows } from "@/app/(dashboard)/customers/actions";

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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-150">
      {/* Toolbar */}
      <div className="p-3.5 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
        <form onSubmit={handleSearch} className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-shadow"
          />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-zinc-500 shrink-0" />
          <select
            onChange={handleStatusChange}
            defaultValue={searchParams.get("status") || "all"}
            className="w-full sm:w-auto py-2.5 sm:py-2 pl-3 pr-8 min-h-[44px] sm:min-h-0 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="lead">Lead</option>
          </select>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Contact</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Added On</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`customer-skeleton-${i}`} className="animate-pulse">
                  <td className="px-6 py-4">
                    <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded mb-1.5" />
                    <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800 rounded mb-1.5" />
                    <div className="h-3 w-36 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded ml-auto" />
                  </td>
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <AlertCircle className="h-6 w-6 text-red-500" />
                    <p className="font-medium text-zinc-900 dark:text-zinc-300">Unable to load customer list</p>
                    <p className="text-xs text-zinc-500">Please check your connection and try again.</p>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 hover:bg-violet-100 transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Retry</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : visibleCustomers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <p className="font-medium text-zinc-900 dark:text-zinc-300">No customers found</p>
                    <p className="text-xs">Try adjusting your search or filter to find what you&apos;re looking for.</p>
                  </div>
                </td>
              </tr>
            ) : (
              visibleCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <Link href={`/customers/${customer.id}`} className="font-medium text-zinc-900 dark:text-zinc-50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {customer.first_name} {customer.middle_name ? `${customer.middle_name} ` : ""}{customer.last_name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-zinc-600 dark:text-zinc-300">{customer.phone}</div>
                    {customer.email && <div className="text-xs text-zinc-400">{customer.email}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      customer.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800/30' :
                      customer.status === 'inactive' ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/30'
                    }`}>
                      {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">
                    {new Date(customer.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <Link href={`/customers/${customer.id}`} className="p-1 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="View Profile">
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link href={`/customers/${customer.id}/edit`} className="p-1 text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors" title="Edit Customer">
                        <Edit className="h-4 w-4" />
                      </Link>
                      <CustomerDeleteButton
                        customerId={customer.id}
                        customerName={`${customer.first_name} ${customer.last_name}`}
                        onDeleted={(id) => setDeletedIds(prev => [...prev, id])}
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
      <div className="md:hidden divide-y divide-zinc-200 dark:divide-zinc-800">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`customer-card-skeleton-${i}`} className="p-4 flex flex-col gap-3 animate-pulse">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-36 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
                  <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                </div>
                <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
              </div>
              <div className="grid grid-cols-1 gap-1">
                <div className="h-3.5 w-28 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
              </div>
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
                <div className="h-8 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
                <div className="h-8 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
              </div>
            </div>
          ))
        ) : isError ? (
          <div className="p-8 text-center text-zinc-500 flex flex-col items-center justify-center space-y-2">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <p className="font-medium text-zinc-900 dark:text-zinc-300">Unable to load customer list</p>
            <p className="text-xs text-zinc-500">Please check your connection and try again.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 hover:bg-violet-100 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : visibleCustomers.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            <p className="font-medium text-zinc-900 dark:text-zinc-300">No customers found</p>
            <p className="text-xs mt-1">Try adjusting your search or filter to find what you&apos;re looking for.</p>
          </div>
        ) : (
          visibleCustomers.map((customer) => (
            <div key={customer.id} className="p-4 flex flex-col gap-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
              {/* Header: Name + Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link 
                    href={`/customers/${customer.id}`} 
                    className="font-semibold text-zinc-900 dark:text-zinc-50 hover:text-violet-600 dark:hover:text-violet-400 text-sm sm:text-base leading-snug break-words"
                  >
                    {customer.first_name} {customer.middle_name ? `${customer.middle_name} ` : ""}{customer.last_name}
                  </Link>
                  {customer.customer_code && (
                    <div className="text-[11px] font-mono text-zinc-400 mt-0.5">{customer.customer_code}</div>
                  )}
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                  customer.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800/30' :
                  customer.status === 'inactive' ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50' :
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/30'
                }`}>
                  {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
                </span>
              </div>

              {/* Contact & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-zinc-400 text-[11px]">Phone:</span>
                  <span className="font-medium font-mono">{customer.phone}</span>
                </div>
                {customer.email && (
                  <div className="flex items-center gap-1.5 truncate text-zinc-500">
                    <span className="text-zinc-400 text-[11px]">Email:</span>
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Added on {new Date(customer.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
                <Link 
                  href={`/customers/${customer.id}`} 
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[38px] text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>View</span>
                </Link>
                <Link 
                  href={`/customers/${customer.id}/edit`} 
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[38px] text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors"
                >
                  <Edit className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </Link>
                <CustomerDeleteButton
                  customerId={customer.id}
                  customerName={`${customer.first_name} ${customer.last_name}`}
                  onDeleted={(id) => setDeletedIds(prev => [...prev, id])}
                  variant="icon"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
