import { notFound } from "next/navigation";
import { getServiceRequestDrawerData } from "@/app/(dashboard)/requests/actions";
import { getRequestFollowupSummary } from "@/lib/operations/operationsQueryLayer";
import { RequestWorkspace } from "@/components/requests/RequestWorkspace";

export const dynamic = "force-dynamic";

const isValidUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export default async function ServiceRequestWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!id || !isValidUuid(id)) {
    notFound();
  }

  const [result, followupSummary] = await Promise.all([
    getServiceRequestDrawerData(id),
    getRequestFollowupSummary(id),
  ]);

  if (!result.data) {
    if (result.errorCode === "not_found" || result.errorCode === "invalid_id") {
      notFound();
    }

    if (result.errorCode === "auth_required") {
      throw new Error("Authentication required to view service request details.");
    }

    // result.errorCode === "query_failed" or other operational failure -> triggers error.tsx boundary
    throw new Error("Failed to load service request details.");
  }

  return <RequestWorkspace data={result.data} followupSummary={followupSummary} />;
}
