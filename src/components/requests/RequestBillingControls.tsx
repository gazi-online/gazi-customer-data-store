"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, CreditCard, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import {
  RequestDrawerInvoiceItem,
  RequestBillingSummary,
} from "@/app/(dashboard)/requests/types";
import { PaymentStatus } from "@/types/service";
import { GenerateInvoiceModal } from "./GenerateInvoiceModal";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";
import { setRequestPaymentWaiver } from "@/app/(dashboard)/services/actions";
import { toast } from "sonner";

interface RequestBillingControlsProps {
  requestId: string;
  customerId: string;
  customerName: string;
  customerCode?: string;
  serviceName: string;
  defaultAmount: number;
  paymentStatus: PaymentStatus;
  billingSummary: RequestBillingSummary;
  invoices: RequestDrawerInvoiceItem[];
}

export function RequestBillingControls({
  requestId,
  customerId,
  customerName,
  customerCode,
  serviceName,
  defaultAmount,
  paymentStatus,
  billingSummary,
  invoices,
}: RequestBillingControlsProps) {
  const router = useRouter();
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isWaiverSubmitting, setIsWaiverSubmitting] = useState(false);

  // Payable active invoices: status issued or partially_paid and dueAmount > 0
  const payableInvoices = invoices.filter(
    (inv) =>
      (inv.status === "issued" || inv.status === "partially_paid") &&
      inv.dueAmount > 0
  );

  const hasSinglePayableInvoice = payableInvoices.length === 1;
  const singlePayableInvoice = hasSinglePayableInvoice ? payableInvoices[0] : null;

  // Toggle waiver
  const handleToggleWaiver = async () => {
    const nextWaived = paymentStatus !== "waived";

    try {
      setIsWaiverSubmitting(true);
      const res = await setRequestPaymentWaiver(requestId, nextWaived);

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success(
        nextWaived
          ? "Payment waived successfully."
          : "Payment waiver removed. Status recalculated from ledger."
      );
      router.refresh();
    } catch {
      toast.error("Failed to update payment waiver.");
    } finally {
      setIsWaiverSubmitting(false);
    }
  };

  const hasZeroActiveInvoices = billingSummary.activeInvoiceCount === 0;
  const hasBalanceDue = billingSummary.balanceDue > 0;

  return (
    <>
      <div className="flex items-center flex-wrap gap-2.5 pt-1">
        {/* 1. Record Payment (shown whenever balance due > 0) */}
        {hasBalanceDue && (
          <button
            type="button"
            onClick={() => setIsPaymentOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="Record payment against outstanding balance"
          >
            <CreditCard className="h-4 w-4" />
            <span>Record Payment</span>
          </button>
        )}

        {/* 2. Generate Invoice (Primary if 0 active invoices, Secondary if already has active) */}
        {hasZeroActiveInvoices ? (
          <button
            type="button"
            onClick={() => setIsGenerateOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="Generate invoice for this request"
          >
            <Receipt className="h-4 w-4" />
            <span>Generate Invoice</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsGenerateOpen(true)}
            className="px-3.5 py-2 border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            title="Create an additional invoice for this request"
          >
            <Receipt className="h-4 w-4 text-slate-500" />
            <span>+ Additional Invoice</span>
          </button>
        )}

        {/* 3. Waive Payment (Strictly shown ONLY when zero active invoices exist) */}
        {hasZeroActiveInvoices && (
          <button
            type="button"
            onClick={handleToggleWaiver}
            disabled={isWaiverSubmitting}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              paymentStatus === "waived"
                ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
                : "border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700"
            }`}
            title={
              paymentStatus === "waived"
                ? "Remove waiver and return to ledger status"
                : "Waive payment requirement for this request"
            }
          >
            {isWaiverSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : paymentStatus === "waived" ? (
              <ShieldAlert className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
            )}
            <span>
              {isWaiverSubmitting
                ? "Updating..."
                : paymentStatus === "waived"
                ? "Remove Waiver"
                : "Waive Payment"}
            </span>
          </button>
        )}
      </div>

      {/* Generate Invoice Modal */}
      <GenerateInvoiceModal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        requestId={requestId}
        customerName={customerName}
        serviceName={serviceName}
        defaultAmount={defaultAmount}
        isAdditional={!hasZeroActiveInvoices}
      />

      {/* Record Payment Modal */}
      {hasBalanceDue && (
        <RecordPaymentModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          onSuccess={() => {
            setIsPaymentOpen(false);
            router.refresh();
          }}
          preselectedCustomerId={customerId}
          preselectedCustomerName={customerName}
          preselectedInvoiceId={singlePayableInvoice ? singlePayableInvoice.invoiceId : undefined}
          preselectedInvoiceNumber={singlePayableInvoice ? singlePayableInvoice.invoiceNumber : undefined}
          preselectedDueAmount={
            singlePayableInvoice ? singlePayableInvoice.dueAmount : billingSummary.balanceDue
          }
          customersList={[
            {
              id: customerId,
              name: customerName,
              code: customerCode,
            },
          ]}
          openInvoicesList={payableInvoices.map((inv) => ({
            id: inv.invoiceId,
            invoice_number: inv.invoiceNumber,
            due_amount: inv.dueAmount,
          }))}
        />
      )}
    </>
  );
}
