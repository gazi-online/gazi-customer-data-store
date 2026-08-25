"use client";

import Link from "next/link";
import { Search, Filter, Edit, Eye } from "lucide-react";
import { Customer } from "@/types/customer";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CustomerDeleteButton } from "@/components/customers/CustomerDeleteButton";

export function CustomerTable({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const visibleCustomers = customers.filter(c => !deletedIds.includes(c.id));

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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Toolbar */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <form onSubmit={handleSearch} className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
        </form>

        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          <select
            onChange={handleStatusChange}
            defaultValue={searchParams.get("status") || "all"}
            className="py-2 pl-3 pr-8 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="lead">Lead</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
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
            {visibleCustomers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <p className="font-medium text-zinc-900 dark:text-zinc-300">No customers found</p>
                    <p className="text-xs">Try adjusting your search or filter to find what you're looking for.</p>
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
                    <div className="flex items-center justify-end space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
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
    </div>
  );
}
