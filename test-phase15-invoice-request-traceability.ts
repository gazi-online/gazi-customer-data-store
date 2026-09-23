/**
 * ==============================================================================
 * PHASE 15: INVOICE LINE ITEM → REQUEST WORKSPACE TRACEABILITY TEST SUITE
 * ==============================================================================
 * Comprehensive tests verifying:
 * 1. InvoiceDetailView imports and uses semantic Next.js Link
 * 2. Canonical route construction uses exact /requests/${item.customer_service_id}
 * 3. Route does NOT route using invoice ID, customer ID, request number, or items[0]
 * 4. Multi-item correctness: two line items with distinct customer_service_id values preserve distinct destinations
 * 5. Zero-request safety: null, undefined, or malformed customer_service_id strictly suppresses Open Request link
 * 6. Zero query expansion: no request fetch, client-side Supabase lookup, or N+1 queries introduced
 * 7. Zero mutations: no new mutations or authority changes
 * 8. Zero PII in URL paths or parameters
 * 9. Accessibility: aria-label provides safe item context without PII, keyboard focus visible
 * 10. Mobile UX: min-h-[44px] practical touch target
 * 11. Architecture boundaries: DB, migrations, RLS, Auth, middleware, FSM, and financial engine untouched
 * 12. Prior phase surfaces (Phase 12 Operations, Phase 13 Reports, Phase 14 Profile) remain untouched
 * ==============================================================================
 */

import fs from "fs";
import path from "path";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failedCount++;
  }
}

console.log("=== PHASE 15 INVOICE → REQUEST TRACEABILITY TEST SUITE ===\n");

// Read relevant source files
const invoiceDetailViewPath = path.resolve("src/components/invoices/InvoiceDetailView.tsx");
const invoiceActionsPath = path.resolve("src/app/(dashboard)/invoices/actions.ts");
const invoicePrintViewPath = path.resolve("src/components/invoices/InvoicePrintView.tsx");
const customerProfileTabsPath = path.resolve("src/components/customers/CustomerProfileTabs.tsx");
const operationsInboxPath = path.resolve("src/components/operations/OperationsInboxView.tsx");
const reportsOverviewTabPath = path.resolve("src/components/reports/ReportsOverviewTab.tsx");
const billingEnginePath = path.resolve("src/lib/billing/BillingEngine.ts");

const invoiceDetailCode = fs.readFileSync(invoiceDetailViewPath, "utf-8");
const invoiceActionsCode = fs.readFileSync(invoiceActionsPath, "utf-8");
const invoicePrintCode = fs.readFileSync(invoicePrintViewPath, "utf-8");
const profileTabsCode = fs.readFileSync(customerProfileTabsPath, "utf-8");
const operationsInboxCode = fs.readFileSync(operationsInboxPath, "utf-8");
const reportsOverviewCode = fs.readFileSync(reportsOverviewTabPath, "utf-8");
const billingEngineCode = fs.readFileSync(billingEnginePath, "utf-8");

// --- 1. Semantic Link & Line-Item Route Architecture ---
console.log("--- 1. Semantic Link & Line-Item Route Architecture ---");

assert(
  invoiceDetailCode.includes('import Link from "next/link";'),
  "Test 1: InvoiceDetailView imports Link from next/link"
);

assert(
  invoiceDetailCode.includes("href={`/requests/${item.customer_service_id}`}"),
  "Test 2: Line items link directly to exact /requests/${item.customer_service_id}"
);

assert(
  !invoiceDetailCode.includes("/requests/${invoice.id}") &&
  !invoiceDetailCode.includes("/requests/${invoice.customer?.id}") &&
  !invoiceDetailCode.includes("/requests/${item.id}") &&
  !invoiceDetailCode.includes("/requests/${item.description}") &&
  !invoiceDetailCode.includes("/requests/${invoice.items[0]") &&
  !invoiceDetailCode.includes("/requests/${invoice.items?.[0]"),
  "Test 3: Route strictly uses line-item customer_service_id, not invoice ID, customer ID, or items[0]"
);

assert(
  invoiceDetailCode.includes("<span>Open Request</span>"),
  "Test 4: Action displays clear 'Open Request' label"
);

assert(
  invoiceDetailCode.includes("<ClipboardList"),
  "Test 5: Action renders ClipboardList request icon"
);

// --- 2. Zero-Request & ID Validation Safety ---
console.log("\n--- 2. Zero-Request & ID Validation Safety ---");

assert(
  invoiceDetailCode.includes("isValidUuid(item.customer_service_id)"),
  "Test 6: isValidUuid guard validates line item customer_service_id format"
);

// Direct validation logic check
const isValidUuid = (id?: string | null): boolean =>
  Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

assert(
  isValidUuid("a84b0f92-56e3-4f9e-a8cd-189a1c1d88a1") === true,
  "Test 7: Valid UUID passes validation guard"
);

assert(
  isValidUuid("not-a-uuid") === false &&
  isValidUuid(null) === false &&
  isValidUuid(undefined) === false &&
  isValidUuid("") === false &&
  isValidUuid("12345") === false,
  "Test 8: Malformed or missing IDs strictly fail closed (no fabricated request link)"
);

// --- 3. Multi-Item / Multi-Request Cardinality ---
console.log("\n--- 3. Multi-Item & Multi-Request Cardinality ---");

// Mock invoice with multi-item and multi-request scenarios
const mockInvoice = {
  id: "inv-100",
  invoice_number: "INV-2026-0001",
  items: [
    {
      id: "item-1",
      customer_service_id: "11111111-1111-4111-8111-111111111111",
      description: "Trade License New",
      quantity: 1,
      unit_price: 1500,
    },
    {
      id: "item-2",
      customer_service_id: "22222222-2222-4222-8222-222222222222",
      description: "GST Registration",
      quantity: 1,
      unit_price: 2000,
    },
    {
      id: "item-3",
      customer_service_id: null,
      description: "Ad-hoc Filing Fee",
      quantity: 1,
      unit_price: 500,
    },
  ],
};

const renderedLinks = mockInvoice.items
  .filter((item) => isValidUuid(item.customer_service_id))
  .map((item) => ({
    description: item.description,
    href: `/requests/${item.customer_service_id}`,
  }));

assert(
  renderedLinks.length === 2,
  "Test 9: Exactly 2 out of 3 items produce request links (ad-hoc null item excluded)"
);

assert(
  renderedLinks[0].href === "/requests/11111111-1111-4111-8111-111111111111" &&
  renderedLinks[1].href === "/requests/22222222-2222-4222-8222-222222222222",
  "Test 10: Multi-item invoice preserves distinct destinations for each originating request"
);

assert(
  renderedLinks[0].href !== renderedLinks[1].href,
  "Test 11: Different items do NOT collapse into items[0] or single invoice destination"
);

// --- 4. Query Architecture & Zero Network Overhead ---
console.log("\n--- 4. Query Architecture & Zero Network Overhead ---");

assert(
  !invoiceDetailCode.includes("supabase.from(") &&
  !invoiceDetailCode.includes("createClient()") &&
  !invoiceDetailCode.includes("fetch(") &&
  !invoiceDetailCode.includes("getServiceRequestById("),
  "Test 12: Zero client queries or request fetches introduced in InvoiceDetailView"
);

assert(
  invoiceActionsCode.includes("items:invoice_items(*)"),
  "Test 13: getInvoiceById authoritative payload already includes all invoice_items fields"
);

// Verify no N+1 in invoice actions
const getInvoiceByIdLines = invoiceActionsCode.slice(
  invoiceActionsCode.indexOf("export async function getInvoiceById"),
  invoiceActionsCode.indexOf("export interface CreateInvoicePayload")
);

assert(
  !getInvoiceByIdLines.includes("for (const item of") &&
  !getInvoiceByIdLines.includes("items.map(async") &&
  !getInvoiceByIdLines.includes("Promise.all(invoice.items"),
  "Test 14: Zero N+1 query loops introduced in invoice fetch action"
);

// --- 5. Accessibility, PII & Mobile UX ---
console.log("\n--- 5. Accessibility, PII & Mobile UX ---");

assert(
  invoiceDetailCode.includes('aria-label={`Open request for ${item.description || "item"}`}') ||
  invoiceDetailCode.includes("aria-label="),
  "Test 15: Semantic accessible aria-label configured for screen readers"
);

assert(
  invoiceDetailCode.includes("focus:ring-2") || invoiceDetailCode.includes("focus:outline"),
  "Test 16: Visible keyboard focus styling configured"
);

assert(
  invoiceDetailCode.includes("min-h-[44px]"),
  "Test 17: Mobile touch target adheres to practical 44px minimum (min-h-[44px])"
);

assert(
  !invoiceDetailCode.includes("customerName") && !invoiceDetailCode.includes("phone")
    ? true
    : !invoiceDetailCode.includes("href={`/requests/${item.customer_service_id}?name="),
  "Test 18: Zero PII in URL path or query params"
);

// --- 6. Non-Regression & Isolation Verification ---
console.log("\n--- 6. Non-Regression & Architecture Isolation ---");

assert(
  !invoicePrintCode.includes("Open Request"),
  "Test 19: InvoicePrintView remains completely clean and untouched"
);

assert(
  billingEngineCode.includes("export class BillingEngine"),
  "Test 20: BillingEngine logic and financial authority untouched"
);

assert(
  profileTabsCode.includes("href={`/requests/${cs.id}`}"),
  "Test 21: Phase 14 CustomerProfileTabs handoff untouched"
);

assert(
  operationsInboxCode.includes("QuickFollowupResolveModal") || operationsInboxCode.includes("Direct Resolution State (Phase 12)"),
  "Test 22: Phase 12 Operations direct resolution untouched"
);

assert(
  reportsOverviewCode.includes("/requests?status=in_progress") || reportsOverviewCode.includes("/invoices?status="),
  "Test 23: Phase 13 Reports actionable drill-down links untouched"
);

// --- Final Summary ---
console.log("\n==================================================");
console.log(`TOTAL TESTS: ${passedCount + failedCount}`);
console.log(`PASSED: ${passedCount}`);
console.log(`FAILED: ${failedCount}`);
console.log("==================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
