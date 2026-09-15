"use client";

import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number | null | undefined) {
  return (
    "₹" +
    Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "DRAFT",
  issued: "ISSUED",
  partially_paid: "PARTIALLY PAID",
  paid: "PAID",
  cancelled: "CANCELLED",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280",
  issued: "#4f46e5",
  partially_paid: "#2563eb",
  paid: "#059669",
  cancelled: "#dc2626",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface InvoicePrintViewProps {
  invoice: any;
}

export function InvoicePrintView({ invoice }: InvoicePrintViewProps) {
  const today = new Date().toISOString().split("T")[0];

  const isOverdue =
    invoice.due_date &&
    invoice.due_date < today &&
    Number(invoice.due_amount) > 0 &&
    invoice.status !== "draft" &&
    invoice.status !== "cancelled";

  const effectiveStatus = isOverdue ? "overdue" : invoice.status;

  const customerName = invoice.customer
    ? [
        invoice.customer.first_name,
        invoice.customer.middle_name,
        invoice.customer.last_name,
      ]
        .filter(Boolean)
        .join(" ")
    : "Unknown Customer";

  const items = [...(invoice.items || [])].sort((
    a: { line_position?: number | null; created_at?: string | null; id?: string },
    b: { line_position?: number | null; created_at?: string | null; id?: string }
  ) => {
    const posA = a.line_position ?? null;
    const posB = b.line_position ?? null;
    if (posA !== null && posB !== null) {
      if (posA !== posB) return posA - posB;
    } else if (posA !== null) {
      return -1;
    } else if (posB !== null) {
      return 1;
    }

    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (dateA !== dateB) return dateA - dateB;

    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  const allocations: any[] = invoice.allocations || [];

  const statusLabel =
    isOverdue
      ? "OVERDUE"
      : STATUS_LABELS[invoice.status] || invoice.status?.toUpperCase();

  const statusColor =
    isOverdue ? "#d97706" : STATUS_COLORS[invoice.status] || "#6b7280";

  return (
    <>
      {/* ── Screen-only control bar (hidden in print) ── */}
      <div
        className="print-hide flex items-center justify-between px-6 py-3 bg-zinc-900 text-white"
        aria-label="Print controls"
      >
        <Link
          href={`/invoices/${invoice.id}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
          aria-label="Back to invoice detail"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoice
        </Link>
        <button
          id="print-invoice-btn"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-md"
          aria-label="Print invoice"
        >
          <Printer className="h-4 w-4" />
          Print Invoice
        </button>
      </div>

      {/* ── Print document body ── */}
      <div className="invoice-print-body" aria-label="Invoice print document">
        {/* Cancelled watermark */}
        {invoice.status === "cancelled" && (
          <div
            className="print-watermark"
            aria-hidden="true"
          >
            CANCELLED
          </div>
        )}

        {/* ══ Header: GCDS brand + Invoice title ══ */}
        <header className="invoice-header">
          <div className="invoice-brand">
            <div className="invoice-brand-logo" aria-hidden="true">G</div>
            <span className="invoice-brand-name">GCDS</span>
          </div>

          <div className="invoice-title-block">
            <h1 className="invoice-title">INVOICE</h1>
            <div
              className="invoice-status-badge"
              style={{ color: statusColor, borderColor: statusColor }}
              aria-label={`Invoice status: ${statusLabel}`}
            >
              {statusLabel}
            </div>
          </div>
        </header>

        {/* ══ Invoice meta + Bill To ══ */}
        <div className="invoice-meta-grid">
          {/* Bill To */}
          <section aria-labelledby="bill-to-heading" className="invoice-meta-card">
            <h2 id="bill-to-heading" className="invoice-meta-label">Bill To</h2>
            <p className="invoice-customer-name">{customerName}</p>
            {invoice.customer?.customer_code && (
              <p className="invoice-meta-sub">
                Customer Code: <strong>{invoice.customer.customer_code}</strong>
              </p>
            )}
            {invoice.customer?.phone && (
              <p className="invoice-meta-sub">Phone: {invoice.customer.phone}</p>
            )}
            {invoice.customer?.email && (
              <p className="invoice-meta-sub">Email: {invoice.customer.email}</p>
            )}
            {invoice.customer?.address && (
              <p className="invoice-meta-sub text-zinc-600">
                {[
                  invoice.customer.address,
                  invoice.customer.city,
                  invoice.customer.district,
                  invoice.customer.state,
                  invoice.customer.pincode ? `PIN: ${invoice.customer.pincode}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </section>

          {/* Invoice Details */}
          <section aria-labelledby="inv-details-heading" className="invoice-meta-card invoice-meta-right">
            <h2 id="inv-details-heading" className="invoice-meta-label">Invoice Details</h2>
            <table className="invoice-detail-table" aria-label="Invoice metadata">
              <tbody>
                <tr>
                  <td className="detail-key">Invoice #</td>
                  <td className="detail-val detail-val-mono">
                    {invoice.invoice_number}
                  </td>
                </tr>
                <tr>
                  <td className="detail-key">Invoice Date</td>
                  <td className="detail-val">{formatDate(invoice.invoice_date)}</td>
                </tr>
                <tr>
                  <td className="detail-key">Due Date</td>
                  <td
                    className={`detail-val${isOverdue ? " detail-val-overdue" : ""}`}
                  >
                    {invoice.due_date ? formatDate(invoice.due_date) : "On Receipt"}
                    {isOverdue && " (Overdue)"}
                  </td>
                </tr>
                {invoice.status === "cancelled" && invoice.cancelled_at && (
                  <tr>
                    <td className="detail-key">Cancelled On</td>
                    <td className="detail-val detail-val-cancelled">
                      {formatDate(invoice.cancelled_at)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        {/* ══ Line Items Table ══ */}
        <section aria-labelledby="items-heading" className="invoice-items-section">
          <h2 id="items-heading" className="invoice-section-title">Items</h2>

          {items.length === 0 ? (
            <p className="invoice-empty-items">No line items on this invoice.</p>
          ) : (
            <table className="invoice-items-table" aria-label="Invoice line items">
              <thead>
                <tr className="invoice-items-thead-row">
                  <th className="col-desc">Description</th>
                  <th className="col-num">Qty</th>
                  <th className="col-num">Unit Price</th>
                  <th className="col-num">Discount</th>
                  <th className="col-num">Tax</th>
                  <th className="col-num col-total">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => (
                  <tr
                    key={item.id || idx}
                    className={`invoice-items-row${idx % 2 === 1 ? " invoice-items-row-alt" : ""}`}
                  >
                    <td className="col-desc-cell">{item.description}</td>
                    <td className="col-num-cell">{item.quantity}</td>
                    <td className="col-num-cell">{formatCurrency(item.unit_price)}</td>
                    <td className="col-num-cell col-muted">
                      {Number(item.discount_amount) > 0
                        ? `- ${formatCurrency(item.discount_amount)}`
                        : "—"}
                    </td>
                    <td className="col-num-cell col-muted">
                      {Number(item.tax_amount) > 0
                        ? `+ ${formatCurrency(item.tax_amount)}`
                        : "—"}
                    </td>
                    <td className="col-num-cell col-total-cell">
                      {formatCurrency(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ══ Totals ══ */}
        <section
          aria-labelledby="totals-heading"
          className="invoice-totals-section"
        >
          <h2 id="totals-heading" className="sr-only">Financial Summary</h2>
          <table className="invoice-totals-table" aria-label="Invoice totals">
            <tbody>
              <tr className="totals-row">
                <td className="totals-label">Subtotal</td>
                <td className="totals-value">{formatCurrency(invoice.subtotal)}</td>
              </tr>
              {Number(invoice.discount_amount) > 0 && (
                <tr className="totals-row">
                  <td className="totals-label">Discount</td>
                  <td className="totals-value totals-deduct">
                    − {formatCurrency(invoice.discount_amount)}
                  </td>
                </tr>
              )}
              {Number(invoice.tax_amount) > 0 && (
                <tr className="totals-row">
                  <td className="totals-label">Tax / GST</td>
                  <td className="totals-value">
                    + {formatCurrency(invoice.tax_amount)}
                  </td>
                </tr>
              )}
              <tr className="totals-row totals-grand">
                <td className="totals-label">Grand Total</td>
                <td className="totals-value">{formatCurrency(invoice.total_amount)}</td>
              </tr>
              {Number(invoice.paid_amount) > 0 && (
                <tr className="totals-row totals-paid">
                  <td className="totals-label">Amount Paid</td>
                  <td className="totals-value">
                    − {formatCurrency(invoice.paid_amount)}
                  </td>
                </tr>
              )}
              <tr className="totals-row totals-balance">
                <td className="totals-label">Balance Due</td>
                <td className="totals-value">{formatCurrency(invoice.due_amount)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ══ Payment Allocations (screen & print) ══ */}
        {allocations.filter((a) => a.payment?.status === "recorded").length > 0 && (
          <section
            aria-labelledby="payments-heading"
            className="invoice-payments-section"
          >
            <h2 id="payments-heading" className="invoice-section-title">
              Payment History
            </h2>
            <table
              className="invoice-payments-table"
              aria-label="Allocated payments"
            >
              <thead>
                <tr className="invoice-items-thead-row">
                  <th className="col-desc">Payment #</th>
                  <th className="col-desc">Method</th>
                  <th className="col-desc">Date</th>
                  <th className="col-num">Reference</th>
                  <th className="col-num col-total">Amount</th>
                </tr>
              </thead>
              <tbody>
                {allocations
                  .filter((a) => a.payment?.status === "recorded")
                  .map((alloc: any, idx: number) => {
                    const pay = alloc.payment || {};
                    return (
                      <tr
                        key={alloc.id || idx}
                        className={`invoice-items-row${idx % 2 === 1 ? " invoice-items-row-alt" : ""}`}
                      >
                        <td className="col-desc-cell payment-num">
                          #{pay.payment_number || "—"}
                        </td>
                        <td className="col-desc-cell">
                          {pay.payment_method?.toUpperCase() || "—"}
                        </td>
                        <td className="col-desc-cell">
                          {formatDate(pay.payment_date)}
                        </td>
                        <td className="col-num-cell col-muted">
                          {pay.reference_number || "—"}
                        </td>
                        <td className="col-num-cell col-total-cell">
                          {formatCurrency(alloc.amount)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        )}

        {/* ══ Notes ══ */}
        {invoice.notes && (
          <section aria-labelledby="notes-heading" className="invoice-notes-section">
            <h2 id="notes-heading" className="invoice-section-title">Notes</h2>
            <p className="invoice-notes-text">{invoice.notes}</p>
          </section>
        )}

        {/* ══ Footer ══ */}
        <footer className="invoice-footer" aria-label="Invoice footer">
          <p>GCDS — Gazi Customer Data Store</p>
          <p>
            Printed on{" "}
            {new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        </footer>
      </div>

      {/* ── Scoped print styles ── */}
      <style>{`
        /* ── Screen chrome: control bar sits above doc ── */
        .invoice-print-body {
          max-width: 210mm;
          margin: 0 auto;
          padding: 16mm 14mm;
          font-family: var(--font-geist-sans, 'Segoe UI', Arial, sans-serif);
          font-size: 11pt;
          color: #111827;
          background: #fff;
          min-height: 100vh;
          position: relative;
        }

        /* ── Cancelled watermark ── */
        .print-watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-35deg);
          font-size: 72pt;
          font-weight: 900;
          color: rgba(220, 38, 38, 0.12);
          white-space: nowrap;
          pointer-events: none;
          z-index: 0;
          letter-spacing: 0.1em;
        }

        /* ── Header ── */
        .invoice-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20pt;
          padding-bottom: 12pt;
          border-bottom: 2px solid #111827;
        }
        .invoice-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .invoice-brand-logo {
          width: 36px;
          height: 36px;
          background: #2563eb;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 900;
          font-size: 18pt;
          line-height: 1;
        }
        .invoice-brand-name {
          font-size: 20pt;
          font-weight: 800;
          color: #111827;
          letter-spacing: -0.03em;
        }
        .invoice-title-block {
          text-align: right;
        }
        .invoice-title {
          font-size: 26pt;
          font-weight: 900;
          color: #111827;
          letter-spacing: 0.04em;
          line-height: 1;
          margin: 0 0 6px 0;
        }
        .invoice-status-badge {
          display: inline-block;
          padding: 3px 10px;
          border: 1.5px solid;
          border-radius: 4px;
          font-size: 9pt;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* ── Meta grid ── */
        .invoice-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16pt;
          margin-bottom: 20pt;
        }
        .invoice-meta-card {
          padding: 10pt;
          background: #f9fafb;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
        }
        .invoice-meta-right {
          text-align: right;
        }
        .invoice-meta-label {
          font-size: 7.5pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #6b7280;
          margin: 0 0 5pt 0;
        }
        .invoice-customer-name {
          font-size: 13pt;
          font-weight: 700;
          color: #111827;
          margin: 0 0 3pt 0;
        }
        .invoice-meta-sub {
          font-size: 9.5pt;
          color: #374151;
          margin: 2pt 0 0 0;
        }

        /* Invoice detail key/value */
        .invoice-detail-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.5pt;
        }
        .invoice-detail-table td {
          padding: 2.5pt 0;
          vertical-align: top;
        }
        .detail-key {
          color: #6b7280;
          width: 44%;
          text-align: right;
          padding-right: 8pt;
        }
        .detail-val {
          color: #111827;
          font-weight: 600;
        }
        .detail-val-mono {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10pt;
          font-weight: 700;
          color: #1d4ed8;
        }
        .detail-val-overdue {
          color: #b45309;
          font-weight: 700;
        }
        .detail-val-cancelled {
          color: #dc2626;
          font-weight: 700;
        }

        /* ── Section title ── */
        .invoice-section-title {
          font-size: 9pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          margin: 0 0 6pt 0;
          padding-bottom: 4pt;
          border-bottom: 1px solid #e5e7eb;
        }

        /* ── Items table ── */
        .invoice-items-section {
          margin-bottom: 16pt;
        }
        .invoice-empty-items {
          font-size: 9.5pt;
          color: #6b7280;
          text-align: center;
          padding: 12pt;
          border: 1px dashed #e5e7eb;
          border-radius: 6px;
        }
        .invoice-items-table,
        .invoice-payments-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.5pt;
          page-break-inside: auto;
        }
        .invoice-items-thead-row th {
          padding: 5pt 6pt;
          background: #111827;
          color: #fff;
          font-weight: 700;
          font-size: 8pt;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        thead {
          display: table-header-group;
        }
        .col-desc { text-align: left; }
        .col-num { text-align: right; }
        .col-total { font-weight: 700; }

        .invoice-items-row td,
        .invoice-payments-table td {
          padding: 5pt 6pt;
          border-bottom: 1px solid #f3f4f6;
          vertical-align: top;
        }
        .invoice-items-row-alt td {
          background: #f9fafb;
        }
        .col-desc-cell { text-align: left; color: #111827; }
        .col-num-cell {
          text-align: right;
          font-family: var(--font-geist-mono, monospace);
          color: #374151;
          white-space: nowrap;
        }
        .col-muted { color: #9ca3af; }
        .col-total-cell {
          font-weight: 700;
          color: #111827;
        }
        .payment-num {
          font-family: var(--font-geist-mono, monospace);
          color: #1d4ed8;
          font-weight: 700;
        }

        /* Page-break: avoid cutting a row across pages */
        .invoice-items-row,
        .invoice-payments-table tr {
          page-break-inside: avoid;
        }

        /* ── Totals ── */
        .invoice-totals-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16pt;
          page-break-inside: avoid;
        }
        .invoice-totals-table {
          width: 52%;
          border-collapse: collapse;
          font-size: 10pt;
        }
        .totals-row td {
          padding: 3.5pt 6pt;
        }
        .totals-label {
          color: #374151;
          text-align: right;
          width: 55%;
        }
        .totals-value {
          text-align: right;
          font-family: var(--font-geist-mono, monospace);
          font-weight: 600;
          color: #111827;
        }
        .totals-deduct {
          color: #6b7280;
        }
        .totals-grand td {
          padding-top: 6pt;
          border-top: 2px solid #111827;
          font-weight: 800;
          font-size: 11pt;
        }
        .totals-paid td {
          color: #059669;
          font-weight: 700;
        }
        .totals-balance td {
          font-weight: 800;
          font-size: 12pt;
          color: #b45309;
          padding-top: 5pt;
          border-top: 1px solid #e5e7eb;
        }

        /* ── Payments section ── */
        .invoice-payments-section {
          margin-bottom: 16pt;
        }

        /* ── Notes ── */
        .invoice-notes-section {
          margin-bottom: 16pt;
          padding: 10pt;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 6px;
        }
        .invoice-notes-text {
          font-size: 9.5pt;
          color: #374151;
          white-space: pre-wrap;
          margin: 0;
        }

        /* ── Footer ── */
        .invoice-footer {
          margin-top: 20pt;
          padding-top: 8pt;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          font-size: 8pt;
          color: #9ca3af;
        }

        /* ── Print media ── */
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 10mm;
          }

          /* Hide the control bar */
          .print-hide { display: none !important; }

          /* Remove screen chrome injected by browser */
          body > * > *:not(.invoice-print-body):not(style):not(script) {
            display: none !important;
          }

          .invoice-print-body {
            padding: 0;
            max-width: 100%;
            min-height: auto;
            box-shadow: none;
          }

          /* Watermark stays */
          .print-watermark {
            position: fixed;
          }

          /* Keep totals together */
          .invoice-totals-section {
            page-break-inside: avoid;
          }

          /* Repeat table headers on every page */
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }

          /* Avoid orphaned rows */
          tr { page-break-inside: avoid; }

          /* Remove rounded corners and shadows (look cleaner on paper) */
          .invoice-meta-card,
          .invoice-notes-section {
            border-radius: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Force colours to print */
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        /* Screen utility */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0,0,0,0);
          white-space: nowrap;
          border-width: 0;
        }
      `}</style>
    </>
  );
}
