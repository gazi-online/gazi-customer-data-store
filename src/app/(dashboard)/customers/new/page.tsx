import { CustomerForm } from "@/components/forms/CustomerForm";

export const dynamic = "force-dynamic";

export default function NewCustomerPage() {
  return (
    <div className="py-6">
      <CustomerForm />
    </div>
  );
}
