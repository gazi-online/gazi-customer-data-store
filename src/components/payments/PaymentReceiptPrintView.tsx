"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { PaymentReceiptData } from "@/app/(dashboard)/payments/actions";
import { formatKolkataDateTime } from "@/lib/operations/dateUtils";

interface PaymentReceiptPrintViewProps {
  payment: PaymentReceiptData["payment"];
  business: PaymentReceiptData["business"];
  qrCodeSvg?: string | null;
}

function formatCurrency(amount: number | null | undefined): string {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PaymentReceiptPrintView({
  payment,
  business,
  qrCodeSvg,
}: PaymentReceiptPrintViewProps) {
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm");

  const customerName = payment.customer
    ? [
        payment.customer.first_name,
        payment.customer.middle_name,
        payment.customer.last_name,
      ]
        .filter(Boolean)
        .join(" ")
    : "Walk-in Customer";

  const shopName = business?.business_name || "Gazi Cyber Data Store";
  const addressParts = [
    business?.address_line1,
    business?.address_line2,
    business?.city,
    business?.district,
    business?.state,
    business?.pincode ? `PIN: ${business.pincode}` : null,
  ].filter(Boolean);

  const isVoided = payment.status === "voided";
  const isRefunded = payment.status === "refunded";

  return (
    <>
      {/* ── Operator Toolbar (Screen Only) ── */}
      <header
        className="print-hide sticky top-0 z-40 bg-zinc-900 border-b border-zinc-800 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg"
        aria-label="Receipt Print Controls"
      >
        <Link
          href="/payments"
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
          aria-label="Back to Payments"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Payments</span>
        </Link>

        {/* Paper Size Selector */}
        <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-xl text-xs font-medium">
          <span className="text-[11px] text-zinc-400 px-2 font-semibold">Roll:</span>
          <button
            type="button"
            onClick={() => setPaperWidth("80mm")}
            className={`px-3 py-1 rounded-lg transition-colors font-bold ${
              paperWidth === "80mm"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-white"
            }`}
            aria-pressed={paperWidth === "80mm"}
          >
            80mm (Standard)
          </button>
          <button
            type="button"
            onClick={() => setPaperWidth("58mm")}
            className={`px-3 py-1 rounded-lg transition-colors font-bold ${
              paperWidth === "58mm"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-white"
            }`}
            aria-pressed={paperWidth === "58mm"}
          >
            58mm (Compact)
          </button>
        </div>

        {/* Print Button */}
        <button
          type="button"
          id="print-receipt-btn"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors shadow-md cursor-pointer"
          aria-label="Print Payment Receipt"
        >
          <Printer className="h-4 w-4" />
          <span>Print Receipt</span>
        </button>
      </header>

      {/* ── Screen Page Wrapper ── */}
      <main className="min-h-screen bg-zinc-100 dark:bg-zinc-950 py-6 px-3 flex justify-center items-start print:bg-white print:p-0 print:m-0">
        <article
          className={`receipt-container bg-white text-black border border-zinc-300 shadow-xl rounded-lg p-3 sm:p-4 font-mono text-[11px] leading-tight transition-all duration-150 ${
            paperWidth === "58mm"
              ? "w-[58mm] max-w-[58mm] min-w-[58mm] text-[10px]"
              : "w-[80mm] max-w-[80mm] min-w-[80mm]"
          }`}
          aria-label="Payment Receipt Document"
        >
          {/* Shop Header */}
          <div className="text-center space-y-0.5">
            <h1 className="font-bold text-sm sm:text-base uppercase tracking-tight text-black">
              {shopName}
            </h1>
            {business?.legal_name && business.legal_name !== shopName && (
              <p className="text-[10px] text-zinc-700 font-sans">{business.legal_name}</p>
            )}
            {addressParts.length > 0 && (
              <p className="text-[10px] text-zinc-700 break-words leading-tight">
                {addressParts.join(", ")}
              </p>
            )}
            {business?.phone && (
              <p className="text-[10px] text-zinc-700">Phone: {business.phone}</p>
            )}
            {business?.email && (
              <p className="text-[10px] text-zinc-700 break-all">{business.email}</p>
            )}
            {business?.gstin && (
              <p className="text-[10px] font-bold text-black">GSTIN: {business.gstin}</p>
            )}
          </div>

          {/* Dotted Divider */}
          <div className="border-t border-dashed border-zinc-800 my-2" />

          {/* Receipt Title & Status */}
          <div className="text-center space-y-1">
            <p className="font-extrabold tracking-widest text-xs uppercase">
              PAYMENT RECEIPT
            </p>

            {/* Voided Warning Banner */}
            {isVoided && (
              <div className="border-2 border-dashed border-red-600 bg-red-50 text-red-700 p-1 rounded font-bold text-[10px] uppercase my-1">
                <p>*** VOIDED TRANSACTION ***</p>
                {payment.voided_at && (
                  <p className="text-[9px] font-normal lowercase">
                    on {formatKolkataDateTime(payment.voided_at)}
                  </p>
                )}
                {payment.void_reason && (
                  <p className="text-[9px] font-normal italic">
                    Reason: {payment.void_reason}
                  </p>
                )}
              </div>
            )}

            {/* Refunded Warning Banner */}
            {isRefunded && (
              <div className="border-2 border-dashed border-amber-600 bg-amber-50 text-amber-800 p-1 rounded font-bold text-[10px] uppercase my-1">
                <p>*** REFUNDED TRANSACTION ***</p>
                {payment.refunded_at && (
                  <p className="text-[9px] font-normal lowercase">
                    on {formatKolkataDateTime(payment.refunded_at)}
                  </p>
                )}
                {payment.refund_reason && (
                  <p className="text-[9px] font-normal italic">
                    Reason: {payment.refund_reason}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Receipt Metadata */}
          <div className="space-y-0.5 mt-2 text-[10px]">
            <div className="flex justify-between items-center">
              <span className="text-zinc-600">Receipt No:</span>
              <span className="font-bold text-black">#{payment.payment_number}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-600">Date & Time:</span>
              <span className="font-semibold text-black">
                {formatKolkataDateTime(payment.created_at || payment.payment_date)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-600">Status:</span>
              <span className="font-bold uppercase text-black">{payment.status}</span>
            </div>
          </div>

          {/* Dotted Divider */}
          <div className="border-t border-dashed border-zinc-800 my-2" />

          {/* Customer Section */}
          <div className="space-y-0.5 text-[10px]">
            <p className="text-zinc-500 font-semibold uppercase text-[9px]">Customer Details</p>
            <p className="font-bold text-black break-words">{customerName}</p>
            {payment.customer?.phone && (
              <p className="text-zinc-700">Phone: {payment.customer.phone}</p>
            )}
            {payment.customer?.customer_code && (
              <p className="text-zinc-600 font-mono">ID: {payment.customer.customer_code}</p>
            )}
          </div>

          {/* Dotted Divider */}
          <div className="border-t border-dashed border-zinc-800 my-2" />

          {/* Financial Breakdown */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-zinc-600">Payment Mode:</span>
              <span className="font-bold uppercase text-black">
                {payment.payment_method.replace(/_/g, " ")}
              </span>
            </div>

            {payment.reference_number && (
              <div className="flex justify-between items-start gap-1">
                <span className="text-zinc-600 shrink-0">Ref / UTR:</span>
                <span className="font-mono text-right break-all text-black">
                  {payment.reference_number}
                </span>
              </div>
            )}

            {payment.notes && (
              <div className="text-[9px] text-zinc-600 italic break-words">
                Note: {payment.notes}
              </div>
            )}

            {/* Prominent Amount Box */}
            <div className="border-y-2 border-black py-1.5 my-2 flex justify-between items-center">
              <span className="font-bold uppercase text-xs">AMOUNT RECEIVED</span>
              <span className="font-bold text-sm sm:text-base text-black">
                {formatCurrency(payment.amount)}
              </span>
            </div>
          </div>

          {/* Allocation Section */}
          {payment.allocations && payment.allocations.length > 0 ? (
            <div className="space-y-1 text-[10px] mt-2">
              <p className="text-zinc-500 font-semibold uppercase text-[9px]">
                Invoice Allocation
              </p>
              <div className="space-y-0.5">
                {payment.allocations.map((alloc) => (
                  <div key={alloc.id} className="flex justify-between items-center">
                    <span className="text-zinc-800 truncate max-w-[130px]">
                      #{alloc.invoice?.invoice_number || "Invoice"}
                    </span>
                    <span className="font-semibold text-black">
                      {formatCurrency(alloc.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[9px] text-zinc-500 italic text-center py-1">
              Account Credit / Unallocated
            </div>
          )}

          {/* Dotted Divider */}
          <div className="border-t border-dashed border-zinc-800 my-2" />

          {/* Secure Verification QR Code */}
          {qrCodeSvg && (
            <div className="my-2 flex flex-col items-center justify-center text-center">
              <div
                className={`bg-white p-1 border border-zinc-300 rounded-sm inline-block leading-none [&>svg]:w-full [&>svg]:h-full [&>svg]:block ${
                  paperWidth === "58mm" ? "w-20 h-20" : "w-24 h-24"
                }`}
                dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
              />
              <p className="mt-1 font-mono text-[9px] font-bold text-black tracking-tight">
                Payment: #{payment.payment_number}
              </p>
              <p className="text-[7.5px] text-zinc-500">Scan to verify in GCDS</p>
            </div>
          )}

          {/* Short Professional Footer */}
          <footer className="text-center space-y-1 text-[9px] text-zinc-600 mt-2">
            <p className="font-bold text-black uppercase">
              {business?.invoice_footer || "Thank you for your payment!"}
            </p>
            <p className="text-[8px] text-zinc-500">
              Computer-generated receipt • GCDS
            </p>
            <p className="text-[8px] text-zinc-400">
              Printed on {formatKolkataDateTime(new Date().toISOString())}
            </p>
          </footer>
        </article>
      </main>

      {/* ── Thermal Print Media Styles ── */}
      <style>{`
        @media print {
          @page {
            size: ${paperWidth === "58mm" ? "58mm auto" : "80mm auto"};
            margin: ${paperWidth === "58mm" ? "1mm 1.5mm" : "2mm 2.5mm"};
          }

          /* Hide screen-only chrome */
          .print-hide {
            display: none !important;
          }

          /* Hide Next.js framework root chrome if present */
          body > * > *:not(main):not(style):not(script) {
            display: none !important;
          }

          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          main {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
          }

          .receipt-container {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            border-radius: 0 !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </>
  );
}
