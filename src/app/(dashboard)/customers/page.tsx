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
    <div className="space-y-5 sm:space-y-6 w-full max-w-full overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Customers</h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 sm:mt-1">Manage and view all your customer data.</p>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Link 
            href="/customers/new" 
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-sm font-semibold text-xs sm:text-sm"
          >
            <Plus className="mr-1.5 h-4 w-4 shrink-0" />
            Add Customer
          </Link>
        </div>
      </div>

      <CustomerTable customers={customers || []} />
    </div>
  );
}
