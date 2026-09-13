import {
  getServiceRequestsDesk,
  getServiceRequestsSummaryMetrics,
  getDeskCatalogServices
} from "./queries";
import { RequestsDeskView } from "@/components/requests/RequestsDeskView";
import { ClipboardList } from "lucide-react";

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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Title & Operational Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <ClipboardList className="h-5 w-5" />
            </div>
            Central Requests Desk
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1">
            Centralized operational command center to search, track, and manage customer service requests.
          </p>
        </div>
      </div>

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
