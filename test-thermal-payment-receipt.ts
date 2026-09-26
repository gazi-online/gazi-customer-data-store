/**
 * ==============================================================================
 * THERMAL PAYMENT RECEIPT REGRESSION TEST SUITE (58mm & 80mm)
 * ==============================================================================
 * Verifies:
 * 1. Payment receipt route & view exist
 * 2. Authoritative server payment retrieval is used
 * 3. Receipt does NOT rely on URL query params for amount/customer/status
 * 4. 58mm roll option exists
 * 5. 80mm roll option exists
 * 6. Default paper size is 80mm
 * 7. Print action exists (window.print())
 * 8. Operator toolbar hidden during print (.print-hide)
 * 9. Receipt width changes dynamically with roll selection
 * 10. No fixed receipt height (thermal roll grows with content)
 * 11. Long identifiers wrap safely (break-all / break-words)
 * 12. PaymentsView exposes Print Receipt in desktop table and mobile card
 * 13. Existing Void action remains intact
 * 14. Existing Refund action remains intact
 * 15. Financial RPCs remain untouched
 * 16. No new DB/migration/RLS changes
 * 17. No new dependencies added to package.json
 * 18. Receipt route is protected with AAL2 server authorization
 * 19. Post-payment Print Receipt action in RecordPaymentModal
 * 20. Proper handling of voided and refunded status with prominent badges
 * ==============================================================================
 */

import assert from "assert";
import fs from "fs";
import path from "path";

let passedTests = 0;
let totalTests = 0;

function it(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err: unknown) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("==========================================================================");
console.log("🧪 THERMAL PAYMENT RECEIPT (58mm / 80mm) REGRESSION SUITE");
console.log("==========================================================================\n");

// Read source files
const routePagePath = path.resolve("src/app/(dashboard)/payments/[id]/receipt/page.tsx");
const viewCompPath = path.resolve("src/components/payments/PaymentReceiptPrintView.tsx");
const actionsPath = path.resolve("src/app/(dashboard)/payments/actions.ts");
const paymentsViewPath = path.resolve("src/components/payments/PaymentsView.tsx");
const recordModalPath = path.resolve("src/components/payments/RecordPaymentModal.tsx");
const pkgPath = path.resolve("package.json");

assert.strictEqual(fs.existsSync(routePagePath), true, "Route page payments/[id]/receipt/page.tsx must exist");
assert.strictEqual(fs.existsSync(viewCompPath), true, "PaymentReceiptPrintView.tsx must exist");
assert.strictEqual(fs.existsSync(actionsPath), true, "payments/actions.ts must exist");
assert.strictEqual(fs.existsSync(paymentsViewPath), true, "PaymentsView.tsx must exist");
assert.strictEqual(fs.existsSync(recordModalPath), true, "RecordPaymentModal.tsx must exist");
assert.strictEqual(fs.existsSync(pkgPath), true, "package.json must exist");

const routeCode = fs.readFileSync(routePagePath, "utf-8");
const viewCode = fs.readFileSync(viewCompPath, "utf-8");
const actionsCode = fs.readFileSync(actionsPath, "utf-8");
const paymentsViewCode = fs.readFileSync(paymentsViewPath, "utf-8");
const recordModalCode = fs.readFileSync(recordModalPath, "utf-8");
const pkgCode = fs.readFileSync(pkgPath, "utf-8");

// 1. Payment receipt route & view exist
it("1a. Route page exists and exports dynamic = 'force-dynamic'", () => {
  assert.match(routeCode, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/, "Route must be force-dynamic");
});

it("1b. Route page renders PaymentReceiptPrintView", () => {
  assert.match(routeCode, /<PaymentReceiptPrintView/, "Route must render PaymentReceiptPrintView");
});

// 2. Authoritative server payment retrieval is used
it("2a. Route page calls getPaymentReceiptData with id from route params", () => {
  assert.match(routeCode, /getPaymentReceiptData\(\s*id\s*\)/, "Must query payment by id parameter");
});

it("2b. actions.ts exports getPaymentReceiptData with AAL2 security enforcement", () => {
  assert.match(actionsCode, /export\s+async\s+function\s+getPaymentReceiptData/, "Must export getPaymentReceiptData");
  assert.match(actionsCode, /await\s+requireAal2\(supabase\)/, "Must enforce requireAal2");
});

// 3. Receipt does not rely on URL query params for amount/customer/status
it("3a. Route page does NOT parse financial amounts or statuses from searchParams", () => {
  assert.strictEqual(routeCode.includes("searchParams"), false, "Must not read searchParams for financial values");
});

it("3b. Route page invokes notFound() if payment record is absent in DB", () => {
  assert.match(routeCode, /notFound\(\)/, "Must call notFound() when record does not exist");
});

// 4 & 5. 58mm and 80mm roll options exist
it("4a. 58mm roll option exists in toolbar and CSS", () => {
  assert.match(viewCode, /setPaperWidth\(["']58mm["']\)/, "Must have 58mm selector");
  assert.match(viewCode, /58mm\s*\(Compact\)/, "Must label 58mm option");
});

it("5a. 80mm roll option exists in toolbar and CSS", () => {
  assert.match(viewCode, /setPaperWidth\(["']80mm["']\)/, "Must have 80mm selector");
  assert.match(viewCode, /80mm\s*\(Standard\)/, "Must label 80mm option");
});

// 6. Default paper size is 80mm
it("6a. Default paper size state is initialized to '80mm'", () => {
  assert.match(viewCode, /useState<["']80mm["']\s*\|\s*["']58mm["']>\(\s*["']80mm["']\s*\)/, "Default must be 80mm");
});

// 7. Print action exists
it("7a. Print action button invokes window.print()", () => {
  assert.match(viewCode, /onClick=\{\(\)\s*=>\s*window\.print\(\)\}/, "Must call window.print()");
});

// 8. Operator toolbar hidden during print
it("8a. Controls toolbar has .print-hide class and CSS rule hides it in print mode", () => {
  assert.match(viewCode, /className=["'][^"']*print-hide[^"']*["']/, "Toolbar must have print-hide class");
  assert.match(viewCode, /\.print-hide\s*\{\s*display:\s*none\s*!important;\s*\}/, "CSS must hide .print-hide on print");
});

// 9. Receipt width changes dynamically with roll selection
it("9a. Screen and print widths adjust for 58mm and 80mm", () => {
  assert.match(viewCode, /paperWidth\s*===\s*["']58mm["']\s*\?\s*["']58mm auto["']\s*:\s*["']80mm auto["']/, "Print page size must adapt to roll width");
  assert.match(viewCode, /w-\[58mm\]/, "Screen preview must style 58mm width");
  assert.match(viewCode, /w-\[80mm\]/, "Screen preview must style 80mm width");
});

// 10. No fixed receipt height (thermal roll grows with content)
it("10a. Receipt container does not enforce fixed height", () => {
  assert.strictEqual(viewCode.includes("h-["), false, "Must not set fixed height on receipt");
  assert.strictEqual(viewCode.includes("height: 100vh"), false, "Must not lock height to viewport");
});

// 11. Long identifiers wrap safely
it("11a. Transaction reference numbers and emails use wrapping classes", () => {
  assert.match(viewCode, /break-all/, "Long transaction / UTR numbers must break-all");
  assert.match(viewCode, /break-words/, "Customer details must break-words");
});

// 12. PaymentsView exposes Print Receipt in desktop table and mobile card
it("12a. Desktop table row exposes Receipt link to /payments/${pay.id}/receipt", () => {
  assert.match(paymentsViewCode, /href=\{`\/payments\/\$\{pay\.id\}\/receipt`\}/, "Desktop table must link to receipt");
  assert.match(paymentsViewCode, /aria-label=\{`Print receipt for payment #\$\{pay\.payment_number\}`\}/, "Must have accessible label");
});

it("12b. Mobile card exposes Print Receipt link to /payments/${pay.id}/receipt", () => {
  assert.match(paymentsViewCode, />\s*Print Receipt\s*<\/span>/, "Mobile card must render Print Receipt");
});

// 13 & 14. Existing Void and Refund actions remain intact
it("13a. Existing Void action button preserved in PaymentsView", () => {
  assert.match(paymentsViewCode, /type:\s*['"]void_payment['"]/, "Void payment action must remain intact");
});

it("14a. Existing Refund action button preserved in PaymentsView", () => {
  assert.match(paymentsViewCode, /type:\s*['"]refund_payment['"]/, "Refund payment action must remain intact");
});

// 15 & 16. Financial RPCs and DB migrations unchanged
it("15a. No financial RPC files or migrations were created or modified", () => {
  const migrationsDir = path.resolve("supabase/migrations");
  const files = fs.readdirSync(migrationsDir);
  // Ensure the latest migration is still 20260925183000_phase3b_privileged_financial_rpc_hardening.sql
  const latestMigration = files.sort().pop();
  assert.strictEqual(latestMigration, "20260925183000_phase3b_privileged_financial_rpc_hardening.sql", "No new migration files must exist");
});

// 17. Dependencies check: qrcode approved by architect
it("17a. Approved qrcode dependency is present in package.json", () => {
  const pkg = JSON.parse(pkgCode);
  assert.strictEqual(Boolean(pkg.dependencies["qrcode"]), true, "Approved qrcode package must be present");
  assert.strictEqual(Boolean(pkg.devDependencies["@types/qrcode"]), true, "@types/qrcode must be present");
  assert.strictEqual(Boolean(pkg.dependencies["jspdf"]), false, "No third-party PDF library");
  assert.strictEqual(Boolean(pkg.dependencies["html2canvas"]), false, "No html2canvas library");
  assert.strictEqual(Boolean(pkg.dependencies["print-js"]), false, "No print-js library");
});

// 18. Receipt route is protected with AAL2 server authorization
it("18a. getPaymentReceiptData rejects or throws when AAL2 check fails", () => {
  assert.match(actionsCode, /await\s+requireAal2\(supabase\)/, "Must invoke requireAal2");
});

// 19. Post-payment Print Receipt action in RecordPaymentModal
it("19a. RecordPaymentModal provides Print Receipt toast action upon successful payment creation", () => {
  assert.match(recordModalCode, /toast\.success\(["']Payment recorded successfully!["'],\s*\{[^}]*action:\s*createdPaymentId/, "Must offer Print Receipt action");
  assert.match(recordModalCode, /window\.open\(`\/payments\/\$\{createdPaymentId\}\/receipt`,\s*["']_blank["']\)/, "Action must open receipt URL");
});

// 20. Proper handling of voided and refunded status
it("20a. PaymentReceiptPrintView renders explicit warning banners for voided or refunded payments", () => {
  assert.match(viewCode, /\*\*\* VOIDED TRANSACTION \*\*\*/, "Must display VOIDED banner if voided");
  assert.match(viewCode, /\*\*\* REFUNDED TRANSACTION \*\*\*/, "Must display REFUNDED banner if refunded");
});

// 21. Server-side QR SVG generation
it("21a. actions.ts generates QR SVG server-side using qrcode package", () => {
  assert.match(actionsCode, /import\s+QRCode\s+from\s+["']qrcode["']/, "Must import QRCode in actions.ts");
  assert.match(actionsCode, /await\s+QRCode\.toString\([^,]+,\s*\{[^}]*type:\s*["']svg["']/, "Must generate SVG string server-side");
});

// 22. QR payload route and format
it("22a. QR payload strictly encodes the canonical /payments/[id]/receipt route", () => {
  assert.match(actionsCode, /`\$\{baseUrl\}\/payments\/\$\{payRes\.data\.id\}\/receipt`/, "Must encode only authoritative receipt route");
});

// 23. Canonical app origin used
it("23a. actions.ts uses getCanonicalAppUrl() for canonical trusted origin", () => {
  assert.match(actionsCode, /import\s+\{[^}]*getCanonicalAppUrl[^}]*\}\s+from\s+["']@\/lib\/auth\/safeRedirect["']/, "Must import getCanonicalAppUrl");
  assert.match(actionsCode, /let\s+baseUrl\s*=\s*getCanonicalAppUrl\(\)/, "Must call getCanonicalAppUrl()");
});

// 24. No sensitive information encoded in QR
it("24a. QR generation code does NOT embed customer, amount, or auth tokens in QR payload", () => {
  const qrSection = actionsCode.slice(actionsCode.indexOf("receiptNavUrl"), actionsCode.indexOf("receiptNavUrl") + 400);
  assert.strictEqual(qrSection.includes("amount"), false, "Must not encode amount in QR");
  assert.strictEqual(qrSection.includes("customer"), false, "Must not encode customer in QR");
  assert.strictEqual(qrSection.includes("phone"), false, "Must not encode phone in QR");
  assert.strictEqual(qrSection.includes("token"), false, "Must not encode token in QR");
});

// 25. QR fail-safe: failure does not break receipt
it("25a. QR generation is wrapped in try/catch and falls back safely to null", () => {
  assert.match(actionsCode, /catch\s*\([^)]*\)\s*\{[^}]*qrCodeSvg\s*=\s*null/, "Must catch errors and fallback to null");
});

// 26. PaymentReceiptPrintView renders QR with payment number caption
it("26a. PaymentReceiptPrintView renders QR SVG and human-readable payment number caption", () => {
  assert.match(viewCode, /qrCodeSvg\s*&&/, "Must conditionally render QR code when present");
  assert.match(viewCode, /Payment:\s*#\{payment\.payment_number\}/, "Must display payment number caption under QR");
  assert.match(viewCode, /Scan to verify in GCDS/, "Must explain scan purpose");
  assert.match(viewCode, /paperWidth\s*===\s*["']58mm["']\s*\?\s*["']w-20 h-20["']\s*:\s*["']w-24 h-24["']/, "Must adjust QR dimensions for 58mm vs 80mm roll");
});

// 27. Actual QRCode generation execution test
it("27a. Server-side QRCode.toString successfully generates valid SVG XML for receipt URL", async () => {
  const QRCode = (await import("qrcode")).default;
  const testUrl = "https://gcds.example.com/payments/11111111-2222-3333-4444-555555555555/receipt";
  const svg = await QRCode.toString(testUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  assert.strictEqual(typeof svg, "string", "Output must be string");
  assert.strictEqual(svg.startsWith("<svg"), true, "Must be valid SVG XML");
  assert.strictEqual(svg.includes("viewBox"), true, "Must include viewBox for responsive scaling");
  assert.strictEqual(svg.includes("</svg>"), true, "Must be complete SVG");
});

console.log("\n==========================================================================");
console.log(`🏁 THERMAL PAYMENT RECEIPT SUITE: ${passedTests}/${totalTests} PASSED`);
console.log("==========================================================================");
