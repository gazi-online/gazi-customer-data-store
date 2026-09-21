import { OperationsInboxView } from "@/components/operations/OperationsInboxView";

export const metadata = {
  title: "Operations Inbox — GCDS",
  description: "Real-time operational alerts across follow-ups, document expiries, and pending verifications",
};

export default function OperationsPage() {
  return <OperationsInboxView />;
}
