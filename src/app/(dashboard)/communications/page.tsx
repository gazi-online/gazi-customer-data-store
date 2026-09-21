import { CommunicationCenterView } from "@/components/communications/CommunicationCenterView";

export const metadata = {
  title: "Communications & Reminders — GCDS",
  description: "Customer outreach queue, WhatsApp deep links, and communication audit history",
};

export default function CommunicationsPage() {
  return <CommunicationCenterView />;
}
