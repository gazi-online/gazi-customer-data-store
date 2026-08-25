import { getInvoiceById } from "../../actions";
import { notFound } from "next/navigation";
import { InvoicePrintView } from "@/components/invoices/InvoicePrintView";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const invoice = await getInvoiceById(id);
    return {
      title: `Invoice #${invoice.invoice_number} — GCDS`,
    };
  } catch {
    return { title: "Invoice — GCDS" };
  }
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let invoice;
  try {
    invoice = await getInvoiceById(id);
  } catch {
    notFound();
  }

  if (!invoice) {
    notFound();
  }

  return <InvoicePrintView invoice={invoice} />;
}
