import Link from "next/link";
import {
  getServiceRequestsDesk,
  getServiceRequestsSummaryMetrics,
  getDeskCatalogServices
} from "./queries";
import { RequestsDeskView } from "@/components/requests/RequestsDeskView";
import { ClipboardList, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

interface RequestsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const resolvedParams = await searchParams;

  const [deskResult, metrics, catalogServices] = await Promise.all([
    getServiceRequestsDesk(resolvedParams),
    getServiceRequestsSummaryMetrics(resolvedParams),
    getDeskCatalogServices(),
  ]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-150">
      {/* Page Title & Operational Subtitle */}
      <PageHeader
        title="Central Requests Desk"
        description="Centralized operational command center to search, track, and manage customer service requests."
        icon={ClipboardList}
        iconVariant="gradient"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/customers"
              className="inline-flex items-center justify-center px-3.5 py-2 min-h-[44px] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-xs text-slate-700 dark:text-zinc-200"
            >
              <Search className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
              Find Customer
            </Link>
            <Link
              href="/customers/new"
              className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Customer
            </Link>
          </div>
        }
      />

      {/* Main Interactive Desk View */}
      <RequestsDeskView
        initialRequests={deskResult.data}
        totalCount={deskResult.totalCount}
        page={deskResult.page}
        limit={deskResult.limit}
        totalPages={deskResult.totalPages}
        metrics={metrics}
        catalogServices={catalogServices}
        searchTooBroad={deskResult.searchTooBroad}
        error={deskResult.error}
      />
    </div>
  );
}
