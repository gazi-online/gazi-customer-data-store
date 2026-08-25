import { createClient } from "@/lib/supabase/server";
import { CreateInvoiceForm } from "@/components/invoices/CreateInvoiceForm";

export const dynamic = "force-dynamic";

export default async function CreateInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string }>;
}) {
  const { customer_id } = await searchParams;
  const supabase = await createClient();

  // Fetch customers for selector
  const { data: customers } = await supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, customer_code")
    .is("deleted_at", null)
    .order("first_name", { ascending: true });

  // Fetch active service master definitions
  const { data: services } = await supabase
    .from("services")
    .select("id, service_name, service_code, default_price")
    .ilike("status", "active")
    .order("service_name", { ascending: true });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <CreateInvoiceForm
        customers={customers || []}
        services={services || []}
        preselectedCustomerId={customer_id}
      />
    </div>
  );
}
