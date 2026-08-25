/**
 * Bare layout for /invoices/[id]/print — strips the dashboard sidebar,
 * header, and navigation so only the invoice content renders in print.
 * The root layout still applies (fonts, Toaster is hidden via @media print).
 */
export default function InvoicePrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
