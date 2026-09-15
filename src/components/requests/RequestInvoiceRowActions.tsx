"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, CreditCard, Send, Loader2 } from "lucide-react";
import { RequestDrawerInvoiceItem } from "@/app/(dashboard)/requests/types";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";
import { issueInvoice } from "@/app/(dashboard)/invoices/actions";
import { toast } from "sonner";

interface RequestInvoiceRowActionsProps {
  requestId: string;
  invoice: RequestDrawerInvoiceItem;
  customerId: string;
  customerName: string;
}

export function RequestInvoiceRowActions({
  requestId,
  invoice,
  customerId,
  customerName,
}: RequestInvoiceRowActionsProps) {
  const router = useRouter();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);

  const handleIssueInvoice = async () => {
    try {
      setIsIssuing(true);
      const res = await issueInvoice(invoice.invoiceId, requestId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Invoice ${invoice.invoiceNumber} issued successfully.`);
      router.refresh();
    } catch {
      toast.error("Failed to issue invoice.");
    } finally {
      setIsIssuing(false);
    }
  };

  const isPayable =
    (invoice.status === "issued" || invoice.status === "partially_paid") &&
    invoice.dueAmount > 0;

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0">
        {/* View Invoice Link */}
        <Link
          href={`/invoices/${invoice.invoiceId}`}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700 text-xs font-semibold transition-colors"
          title={`View ${invoice.invoiceNumber}`}
        >
          <span>View</span>
          <ExternalLink className="h-3 w-3 text-slate-400" />
        </Link>

        {/* Issue Invoice (for Draft) */}
        {invoice.status === "draft" && (
          <button
            type="button"
            onClick={handleIssueInvoice}
            disabled={isIssuing}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-50"
            title="Issue invoice to customer"
          >
            {isIssuing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            <span>{isIssuing ? "Issuing..." : "Issue"}</span>
          </button>
        )}

        {/* Record Payment (for Issued / Partially Paid with balance) */}
        {isPayable && (
          <button
            type="button"
            onClick={() => setIsPaymentOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
            title={`Record payment against ${invoice.invoiceNumber}`}
          >
            <CreditCard className="h-3 w-3" />
            <span>Pay</span>
          </button>
        )}
      </div>

      {/* Embedded Record Payment Modal */}
      {isPayable && (
        <RecordPaymentModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          onSuccess={() => {
            setIsPaymentOpen(false);
            router.refresh();
          }}
          preselectedCustomerId={customerId}
          preselectedCustomerName={customerName}
          preselectedInvoiceId={invoice.invoiceId}
          preselectedInvoiceNumber={invoice.invoiceNumber}
          preselectedDueAmount={invoice.dueAmount}
          openInvoicesList={[
            {
              id: invoice.invoiceId,
              invoice_number: invoice.invoiceNumber,
              due_amount: invoice.dueAmount,
            },
          ]}
        />
      )}
    </>
  );
}
