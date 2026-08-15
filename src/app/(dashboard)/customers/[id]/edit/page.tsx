import { CustomerForm } from "@/components/forms/CustomerForm";
import { getCustomerById } from "../../actions";
import { notFound } from "next/navigation";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let customer;
  try {
    customer = await getCustomerById(id);
  } catch {
    notFound();
  }

  return (
    <div className="py-6">
      <CustomerForm initialData={customer} />
    </div>
  );
}
