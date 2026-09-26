import { notFound } from "next/navigation";
import { getPaymentReceiptData } from "../../actions";
import { PaymentReceiptPrintView } from "@/components/payments/PaymentReceiptPrintView";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const data = await getPaymentReceiptData(id);
    if (!data?.payment) return { title: "Payment Receipt — GCDS" };
    return {
      title: `Payment Receipt #${data.payment.payment_number} — GCDS`,
      description: `Authoritative payment receipt for #${data.payment.payment_number}`,
    };
  } catch {
    return { title: "Payment Receipt — GCDS" };
  }
}

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getPaymentReceiptData(id);
  } catch {
    notFound();
  }

  if (!data?.payment) {
    notFound();
  }

  return (
    <PaymentReceiptPrintView
      payment={data.payment}
      business={data.business}
      qrCodeSvg={data.qrCodeSvg}
    />
  );
}
