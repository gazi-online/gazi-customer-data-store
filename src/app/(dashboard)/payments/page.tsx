import { getPayments } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { PaymentsView } from "@/components/payments/PaymentsView";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; method?: string }>;
}) {
  const { search, status, method } = await searchParams;
  const supabase = await createClient();

  const payments = await getPayments(search, status, method);

  // Fetch customers list for payment creation modal
  const { data: customers } = await supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, customer_code")
    .is("deleted_at", null)
    .order("first_name", { ascending: true });

  // Fetch open/issued invoices list for payment allocation selector
  const { data: openInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, due_amount")
    .gt("due_amount", 0)
    .not("status", "in", '("draft","cancelled")')
    .order("created_at", { ascending: false });

  return (
    <PaymentsView
      payments={payments || []}
      customers={customers || []}
      openInvoices={openInvoices || []}
      initialSearch={search}
      initialStatus={status}
      initialMethod={method}
    />
  );
}
