import { getPayments } from "./actions";
import { PaymentsView } from "@/components/payments/PaymentsView";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; method?: string }>;
}) {
  const { search, status, method } = await searchParams;
  const payments = await getPayments(search, status, method);

  return (
    <PaymentsView
      payments={payments || []}
      initialSearch={search}
      initialStatus={status}
      initialMethod={method}
    />
  );
}
