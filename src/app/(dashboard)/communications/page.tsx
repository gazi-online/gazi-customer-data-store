import { getContactQueue, getShopBusinessName } from "./actions";
import { CommunicationCenterView } from "@/components/communications/CommunicationCenterView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Communications & Reminders — GCDS",
  description: "Customer outreach queue, WhatsApp deep links, and communication audit history",
};

export default async function CommunicationsPage() {
  const [queue, shopName] = await Promise.all([
    getContactQueue(),
    getShopBusinessName(),
  ]);

  return <CommunicationCenterView initialQueue={queue} shopName={shopName} />;
}
