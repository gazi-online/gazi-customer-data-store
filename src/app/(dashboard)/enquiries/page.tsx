import { EnquiriesView } from "@/components/enquiries/EnquiriesView";
import { getEnquiries, getEnquiryFormOptions } from "./actions";

export const metadata = {
  title: "Enquiries & Follow-ups — GCDS",
  description: "Manage customer queries, follow-ups, and WhatsApp updates",
};

export default async function EnquiriesPage() {
  const [{ enquiries, stats }, { customers, services }] = await Promise.all([
    getEnquiries(),
    getEnquiryFormOptions(),
  ]);

  return (
    <EnquiriesView
      initialEnquiries={enquiries}
      initialStats={stats}
      customers={customers}
      services={services}
    />
  );
}
