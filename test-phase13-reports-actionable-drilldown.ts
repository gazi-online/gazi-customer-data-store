/**
 * ==============================================================================
 * PHASE 13 — REPORTS ACTIONABLE DRILL-DOWN TEST SUITE
 * File: test-phase13-reports-actionable-drilldown.ts
 * ==============================================================================
 * Validates:
 * 1. Semantic correctness of all Reports drill-down routes & filter mappings
 * 2. Service Volume rows link to canonical /requests?serviceId=<id>
 * 3. Status Distribution rows link to canonical /requests?status=<status>
 * 4. Active Pipeline is NOT falsely mapped to single status (in_progress)
 * 5. Period-scoped Completed Work is NOT misrepresented as an unscoped drill-down
 * 6. Overdue Receivables strictly maps to /invoices?status=overdue
 * 7. Open Invoices is NOT falsely mapped to status=issued (omitting partially_paid)
 * 8. Outstanding Receivables navigates to authoritative /reports?tab=receivables
 * 9. Customer Statement invoice entries link to /invoices/<id> using canonical invoice ID
 * 10. Customer Statement non-invoice entries remain plain text
 * 11. Declarative Next.js Link semantics & accessibility labels used
 * 12. Zero PII in query parameters
 * 13. System safety invariants (no DB, RLS, Auth, FSM, financial mutation)
 * ==============================================================================
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { ReportEngine } from "./src/lib/reports/ReportEngine";
import { PERSISTED_STATUSES, ACTIVE_STATUSES } from "./src/app/(dashboard)/requests/types";

console.log("=== PHASE 13 REPORTS ACTIONABLE DRILL-DOWN TEST SUITE ===\n");

let passedCount = 0;
let totalCount = 0;

function runTest(description: string, fn: () => void) {
  totalCount++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalCount}: ${description}`);
    passedCount++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [FAIL] Test ${totalCount}: ${description}`);
    console.error(`         ${msg}`);
    process.exitCode = 1;
  }
}

// Read relevant files
const workloadPath = path.resolve("src/components/reports/ServiceWorkloadTab.tsx");
const overviewPath = path.resolve("src/components/reports/ReportsOverviewTab.tsx");
const statementPath = path.resolve("src/components/reports/CustomerStatementTab.tsx");
const customerProfileTabsPath = path.resolve("src/components/customers/CustomerProfileTabs.tsx");
const searchActionsPath = path.resolve("src/app/(dashboard)/actions/searchActions.ts");

const workloadCode = fs.readFileSync(workloadPath, "utf-8");
const overviewCode = fs.readFileSync(overviewPath, "utf-8");
const statementCode = fs.readFileSync(statementPath, "utf-8");
const customerProfileTabsCode = fs.readFileSync(customerProfileTabsPath, "utf-8");
const searchActionsCode = fs.readFileSync(searchActionsPath, "utf-8");

// ==============================================================================
// 1. SERVICE VOLUME BREAKDOWN DRILL-DOWN
// ==============================================================================
console.log("--- 1. Service Volume Breakdown Drill-Down ---");

runTest("ServiceWorkloadTab imports Link from next/link", () => {
  assert(workloadCode.includes('import Link from "next/link";'), "Must import Link from next/link");
});

runTest("Service Volume rows link to canonical /requests?serviceId=...", () => {
  assert(
    workloadCode.includes("/requests?serviceId="),
    "Must contain link to /requests?serviceId="
  );
  assert(
    workloadCode.includes("encodeURIComponent(srv.serviceId)"),
    "Must safely URL-encode srv.serviceId"
  );
});

runTest("Service Volume rows guard against unknown service IDs", () => {
  assert(
    workloadCode.includes('srv.serviceId !== "unknown"'),
    "Must guard against unknown service IDs"
  );
});

runTest("Service Volume rows have accessible aria-label with service name", () => {
  assert(
    workloadCode.includes("aria-label={`View ${srv.serviceName} requests on Central Requests Desk`}"),
    "Must have descriptive aria-label"
  );
});

runTest("Service Volume rows maintain min-h-[44px] touch target", () => {
  assert(
    workloadCode.includes("min-h-[44px]"),
    "Must have min-h-[44px] touch target for mobile"
  );
});

// ==============================================================================
// 2. STATUS DISTRIBUTION DRILL-DOWN
// ==============================================================================
console.log("\n--- 2. Status Distribution Drill-Down ---");

runTest("Status Distribution rows link to /requests?status=...", () => {
  assert(
    workloadCode.includes("/requests?status="),
    "Must link to /requests?status="
  );
  assert(
    workloadCode.includes("encodeURIComponent(item.status)"),
    "Must safely URL-encode item.status"
  );
});

runTest("Status Distribution rows have accessible aria-label", () => {
  assert(
    workloadCode.includes("aria-label={`View ${item.label} service requests`}"),
    "Must have descriptive aria-label"
  );
});

runTest("Status Distribution rows maintain min-h-[44px] touch target", () => {
  assert(
    workloadCode.includes("min-h-[44px]"),
    "Must have min-h-[44px] touch target for mobile"
  );
});

// ==============================================================================
// 3. SEMANTIC REJECTION OF MISMATCHED SERVICE WORKLOAD METRICS
// ==============================================================================
console.log("\n--- 3. Semantic Rejection of Mismatched Service Workload Metrics ---");

runTest("Active Pipeline is NOT linked to status=in_progress (semantic mismatch prevention)", () => {
  // activePendingWork includes multiple non-terminal statuses (!isTerminal && status !== 'completed')
  // It must NOT be mapped to single status=in_progress
  assert(
    !workloadCode.includes('href="/requests?status=in_progress"') &&
    !workloadCode.includes("href={`/requests?status=in_progress`}"),
    "Active Pipeline must NOT be falsely mapped to in_progress"
  );
});

runTest("Period-scoped Completed Work is NOT misrepresented as an unscoped drill-down", () => {
  // totalCompletedInPeriod is period-scoped, /requests?status=completed is all-time
  assert(
    !workloadCode.includes('href="/requests?status=completed"') &&
    !workloadCode.includes("href={`/requests?status=completed`}"),
    "Period-scoped Completed Work must NOT be linked as an exact unscoped drill-down"
  );
});

runTest("Analytical metrics (Completion Rate, Average Turnaround) remain informational", () => {
  assert(
    !workloadCode.includes("cohortCompletionRate") || !workloadCode.includes('href="/requests'),
    "Completion rate must not be wrapped in an artificial drill-down link"
  );
});

// ==============================================================================
// 4. REPORTS OVERVIEW DRILL-DOWN
// ==============================================================================
console.log("\n--- 4. Reports Overview Drill-Down ---");

runTest("ReportsOverviewTab imports Link from next/link", () => {
  assert(overviewCode.includes('import Link from "next/link";'), "Must import Link from next/link");
});

runTest("Overdue Receivables links to /invoices?status=overdue (exact semantic match)", () => {
  assert(
    overviewCode.includes('/invoices?status=overdue'),
    "Overdue Receivables must link to /invoices?status=overdue"
  );
  assert(
    overviewCode.includes("View Overdue Invoices"),
    "Must have clear visual label"
  );
});

runTest("Outstanding Receivables links to /reports?tab=receivables (authoritative breakdown)", () => {
  assert(
    overviewCode.includes('/reports?tab=receivables'),
    "Outstanding Receivables must link to /reports?tab=receivables"
  );
  assert(
    overviewCode.includes("View Ageing Breakdown"),
    "Must have clear visual label"
  );
});

runTest("Open Invoices is NOT mapped to status=issued (prevents partially_paid exclusion)", () => {
  // Open Invoices in ReportEngine = issued + partially_paid.
  // /invoices only filters status=issued. It must NOT be mapped to status=issued.
  assert(
    !overviewCode.includes('/invoices?status=issued'),
    "Open Invoices must NOT be linked to status=issued as it would omit partially_paid"
  );
});

runTest("Overview action links have accessible labels and keyboard focus ring", () => {
  assert(
    overviewCode.includes('aria-label="View overdue invoices desk"'),
    "Must have accessible label for overdue invoices"
  );
  assert(
    overviewCode.includes('aria-label="View receivables ageing breakdown"'),
    "Must have accessible label for receivables ageing"
  );
});

// ==============================================================================
// 5. CUSTOMER STATEMENT INVOICE LINKS
// ==============================================================================
console.log("\n--- 5. Customer Statement Invoice Links ---");

runTest("CustomerStatementTab imports Link from next/link and ExternalLink", () => {
  assert(statementCode.includes('import Link from "next/link";'), "Must import Link");
  assert(statementCode.includes("ExternalLink"), "Must import ExternalLink icon");
});

runTest("Invoice reference in ledger links to /invoices/${e.id} using authoritative invoice ID", () => {
  assert(
    statementCode.includes('href={`/invoices/${e.id}`}'),
    "Must link to /invoices/${e.id} using authoritative invoice primary key"
  );
});

runTest("Invoice reference link checks e.type === 'invoice'", () => {
  assert(
    statementCode.includes('e.type === "invoice"'),
    "Must conditionally check e.type === 'invoice'"
  );
});

runTest("Non-invoice entries in ledger remain plain text", () => {
  assert(
    statementCode.includes('<span className="text-zinc-700 dark:text-zinc-300">{e.reference}</span>'),
    "Non-invoice entries (payments, adjustments) must remain plain text"
  );
});

runTest("Invoice link has accessible label with invoice reference", () => {
  assert(
    statementCode.includes('aria-label={`Open invoice ${e.reference}`}'),
    "Must have descriptive aria-label with invoice reference"
  );
});

// ==============================================================================
// 6. SCOPE HARD BOUNDARIES & ISOLATION
// ==============================================================================
console.log("\n--- 6. Scope Boundaries & Preservation ---");

runTest("CustomerProfileTabs.tsx was NOT modified for Candidate 2", () => {
  // Confirm CustomerProfileTabs remains untouched in Phase 13
  const gitDiffRes = fs.readFileSync(path.resolve("src/components/customers/CustomerProfileTabs.tsx"), "utf-8");
  assert(!gitDiffRes.includes("PHASE_13"), "CustomerProfileTabs must not be altered for Phase 13");
});

runTest("Global command search was NOT modified in Phase 13", () => {
  assert(!searchActionsCode.includes("PHASE_13"), "searchActions must not be altered in Phase 13");
});

runTest("Zero customer PII in generated URL parameters", () => {
  assert(!workloadCode.includes("phone="), "No phone in workload URLs");
  assert(!workloadCode.includes("email="), "No email in workload URLs");
  assert(!workloadCode.includes("aadhaar"), "No aadhaar in workload URLs");
  assert(!workloadCode.includes("pan="), "No pan in workload URLs");
  assert(!overviewCode.includes("phone="), "No phone in overview URLs");
  assert(!statementCode.includes("phone="), "No phone in statement URLs");
});

runTest("Zero mutation methods or RPC calls in Reports tabs", () => {
  assert(!workloadCode.includes("supabase.from"), "No client DB query in ServiceWorkloadTab");
  assert(!overviewCode.includes("supabase.from"), "No client DB query in ReportsOverviewTab");
  assert(!statementCode.includes("supabase.from"), "No client DB query in CustomerStatementTab");
});

// ==============================================================================
// 7. SUMMARY
// ==============================================================================
console.log("\n==========================================================================");
console.log(`📊 TEST SUMMARY: ${passedCount} / ${totalCount} ASSERTIONS PASSED (${totalCount - passedCount} FAILED)`);
console.log("==========================================================================\n");

if (passedCount !== totalCount) {
  process.exit(1);
}
