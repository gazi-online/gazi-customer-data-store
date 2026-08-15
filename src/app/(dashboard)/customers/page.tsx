import Link from "next/link";
import { Plus } from "lucide-react";
import { CustomerTable } from "@/components/tables/CustomerTable";
import { getCustomers } from "./actions";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const { search, status } = await searchParams;
  const customers = await getCustomers(search, status);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Customers</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage and view all your customer data.</p>
        </div>
        <Link 
          href="/customers/new" 
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Link>
      </div>

      <CustomerTable customers={customers || []} />
    </div>
  );
}
