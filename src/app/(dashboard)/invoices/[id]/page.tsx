import { getInvoiceById } from "../actions";
import { notFound } from "next/navigation";
import { InvoiceDetailView } from "@/components/invoices/InvoiceDetailView";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let invoice;
  try {
    invoice = await getInvoiceById(id);
  } catch (err) {
    notFound();
  }

  if (!invoice) {
    notFound();
  }

  return <InvoiceDetailView invoice={invoice} />;
}
