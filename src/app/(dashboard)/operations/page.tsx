import { getOperationsInboxAlerts } from "@/lib/operations/operationsInboxQuery";
import { OperationsInboxView } from "@/components/operations/OperationsInboxView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Operations Inbox — GCDS",
  description: "Real-time operational alerts across follow-ups, document expiries, and pending verifications",
};

export default async function OperationsPage() {
  const summary = await getOperationsInboxAlerts();
  return <OperationsInboxView initialSummary={summary} />;
}
