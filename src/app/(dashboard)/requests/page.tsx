import {
  getServiceRequestsDesk,
  getServiceRequestsSummaryMetrics,
  getDeskCatalogServices
} from "./queries";
import { RequestsDeskView } from "@/components/requests/RequestsDeskView";
import { ClipboardList } from "lucide-react";

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
