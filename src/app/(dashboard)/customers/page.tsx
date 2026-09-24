import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { CustomerTable } from "@/components/tables/CustomerTable";

import { PageHeader } from "@/components/ui/PageHeader";

export default function CustomersPage() {
  return (
    <div className="space-y-5 sm:space-y-6 w-full max-w-full overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-150">
      <PageHeader
        title="Customers"
        description="Manage and view all your customer data."
        icon={Users}
        iconVariant="badge"
        actions={
          <Link 
            href="/customers/new" 
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 text-white rounded-xl transition-all shadow-xs font-semibold text-xs sm:text-sm"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Add Customer</span>
          </Link>
        }
      />

      <CustomerTable />
    </div>
  );
}
