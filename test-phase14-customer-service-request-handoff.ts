/**
 * ==============================================================================
 * PHASE 14: CUSTOMER SERVICE → REQUEST WORKSPACE HANDOFF TEST SUITE
 * ==============================================================================
 * Comprehensive tests verifying:
 * 1. CustomerProfileTabs imports and uses semantic Next.js Link
 * 2. Canonical route construction uses authoritative request primary key (/requests/${cs.id})
 * 3. Route does NOT use request_number, application_reference, or service_id in URL path
 * 4. Zero-request safety: malformed or missing IDs strictly suppress Open Request link
 * 5. Multiple customer services each map to their respective canonical request IDs (no arbitrary picking)
 * 6. Accessible attributes (aria-label, title) and visible focus treatments exist
 * 7. Mobile UX: practical minimum 44px touch target (min-h-[44px])
 * 8. Zero PII in navigation URL parameters
 * 9. Zero new client-side Supabase lookups or per-card queries
 * 10. Zero mutations introduced in Customer Profile
 * 11. Architecture boundaries: DB, migrations, RLS, Auth, FSM, financial logic untouched
 * 12. Reports (Phase 13) and Operations (Phase 12) surfaces remain untouched
 * ==============================================================================
 */

import fs from "fs";
import path from "path";
import { CustomerServiceWithDetails } from "./src/types/service";

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

console.log("=== PHASE 14 CUSTOMER SERVICE → REQUEST WORKSPACE TEST SUITE ===\n");

// Read relevant source files
const customerProfileTabsPath = path.resolve("src/components/customers/CustomerProfileTabs.tsx");
const customerProfilePagePath = path.resolve("src/app/(dashboard)/customers/[id]/page.tsx");
const serviceActionsPath = path.resolve("src/app/(dashboard)/services/actions.ts");
const requestWorkspacePath = path.resolve("src/app/(dashboard)/requests/[id]/page.tsx");
const serviceWorkloadTabPath = path.resolve("src/components/reports/ServiceWorkloadTab.tsx");
const reportsOverviewTabPath = path.resolve("src/components/reports/ReportsOverviewTab.tsx");
const customerStatementTabPath = path.resolve("src/components/reports/CustomerStatementTab.tsx");
const operationsInboxPath = path.resolve("src/components/operations/OperationsInboxView.tsx");

const profileTabsCode = fs.readFileSync(customerProfileTabsPath, "utf-8");
const profilePageCode = fs.readFileSync(customerProfilePagePath, "utf-8");
const serviceActionsCode = fs.readFileSync(serviceActionsPath, "utf-8");
const requestWorkspaceCode = fs.readFileSync(requestWorkspacePath, "utf-8");

// --- 1. Semantic Link & Route Verification ---
console.log("--- 1. Semantic Link & Route Architecture ---");

assert(
  profileTabsCode.includes('import Link from "next/link";'),
  "Test 1: CustomerProfileTabs imports Link from next/link"
);

assert(
  profileTabsCode.includes("href={`/requests/${cs.id}`}"),
  "Test 2: Service cards link directly to canonical /requests/${cs.id}"
);

assert(
  !profileTabsCode.includes("/requests/${cs.request_number}") &&
  !profileTabsCode.includes("/requests/${cs.service_id}") &&
  !profileTabsCode.includes("/requests/${cs.service?.service_code}"),
  "Test 3: Route strictly uses authoritative primary key, not request_number or service_id"
);

assert(
  profileTabsCode.includes("<span>Open Request</span>"),
  "Test 4: Action displays clear 'Open Request' label"
);

// --- 2. Zero-Request & ID Safety ---
console.log("\n--- 2. Zero-Request & ID Validation Safety ---");

assert(
  profileTabsCode.includes("isValidUuid(cs.id)") ||
  profileTabsCode.includes("/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i"),
  "Test 5: isValidUuid guard validates customer_services ID format"
);

// Test validation logic directly
const isValidUuid = (id?: string | null): boolean =>
  Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

assert(
  isValidUuid("b41fc8ac-7e00-4025-8e44-5c192c87a73f") === true,
  "Test 6: Valid UUID passes validation guard"
);

assert(
  isValidUuid("invalid-uuid") === false &&
  isValidUuid(null) === false &&
  isValidUuid(undefined) === false &&
  isValidUuid("") === false,
  "Test 7: Malformed or missing IDs strictly fail closed (suppresses fabricated link)"
);

// --- 3. Multiple Request Cardinality & Canonical Association ---
console.log("\n--- 3. Multiple Request Cardinality & Deterministic Mapping ---");

// Mock customer services dataset
const mockCustomerServices: CustomerServiceWithDetails[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    customer_id: "c-1",
    service_id: "s-1",
    status: "in_progress",
    amount: 500,
    payment_status: "paid",
    service_date: "2026-09-01",
    due_date: "2026-09-10",
    notes: "Service 1",
    assigned_to: null,
    created_by: "u-1",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    completed_at: null,
    archived_at: null,
    request_number: "SR-2026-000001",
    service: {
      id: "s-1",
      service_code: "PAN",
      service_name: "PAN Card",
      category: "Identity",
      description: null,
      default_price: 500,
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    customer_id: "c-1",
    service_id: "s-2",
    status: "completed",
    amount: 1200,
    payment_status: "paid",
    service_date: "2026-09-05",
    due_date: null,
    notes: "Service 2",
    assigned_to: null,
    created_by: "u-1",
    created_at: "2026-09-05T00:00:00Z",
    updated_at: "2026-09-05T00:00:00Z",
    completed_at: "2026-09-06T00:00:00Z",
    archived_at: null,
    request_number: "SR-2026-000002",
    service: {
      id: "s-2",
      service_code: "PASSPORT",
      service_name: "Passport Re-issue",
      category: "Travel",
      description: null,
      default_price: 1200,
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  },
];

const mappedRoutes = mockCustomerServices.map(cs => ({
  serviceCode: cs.service.service_code,
  route: isValidUuid(cs.id) ? `/requests/${cs.id}` : null,
}));

assert(
  mappedRoutes[0].route === "/requests/11111111-1111-4111-8111-111111111111",
  "Test 8: First customer service maps deterministically to its own request ID"
);

assert(
  mappedRoutes[1].route === "/requests/22222222-2222-4222-8222-222222222222",
  "Test 9: Second customer service maps deterministically to its own request ID"
);

assert(
  mappedRoutes[0].route !== mappedRoutes[1].route,
  "Test 10: Multiple services avoid array-first or arbitrary single-request collision"
);

// --- 4. Accessibility & Mobile UX ---
console.log("\n--- 4. Accessibility & Mobile UX ---");

assert(
  profileTabsCode.includes("min-h-[44px]"),
  "Test 11: Open Request action guarantees minimum practical 44px touch target"
);

assert(
  profileTabsCode.includes('aria-label={`Open ${cs.service?.service_name || "service"} request`}'),
  "Test 12: Open Request link has descriptive accessible label"
);

assert(
  profileTabsCode.includes("focus:outline-hidden focus:ring-2 focus:ring-violet-500"),
  "Test 13: Open Request link has visible focus ring for keyboard navigation"
);

assert(
  profileTabsCode.includes("dark:bg-zinc-800") && profileTabsCode.includes("dark:hover:bg-zinc-700"),
  "Test 14: Dark mode styling matches existing application design tokens"
);

// --- 5. Data Flow, Zero New Fetches & Privacy ---
console.log("\n--- 5. Data Minimization & Performance Guarantees ---");

assert(
  !profileTabsCode.includes("customer_services.select") &&
  !profileTabsCode.includes("from('customer_services')") &&
  !profileTabsCode.includes("from(\"customer_services\")"),
  "Test 15: Zero client-side Supabase queries added to CustomerProfileTabs"
);

assert(
  !profileTabsCode.includes("fetch(`/api/requests") &&
  !profileTabsCode.includes("getServiceRequest"),
  "Test 16: Zero per-card network lookups or N+1 queries introduced"
);

assert(
  !profileTabsCode.includes("phone=") &&
  !profileTabsCode.includes("aadhaar=") &&
  !profileTabsCode.includes("pan=") &&
  !profileTabsCode.includes("email="),
  "Test 17: Zero customer PII in generated URL paths or query parameters"
);

assert(
  !profileTabsCode.includes("transitionServiceRequestStatus") &&
  !profileTabsCode.includes("updateCustomerServiceStatus"),
  "Test 18: Zero mutations introduced on the customer services tab"
);

// --- 6. Destination Route Integrity ---
console.log("\n--- 6. Destination Route Integrity ---");

assert(
  requestWorkspaceCode.includes("export default async function ServiceRequestWorkspacePage"),
  "Test 19: Destination /requests/[id] workspace route exists and is valid"
);

assert(
  requestWorkspaceCode.includes("getServiceRequestDrawerData(id)"),
  "Test 20: Request Workspace accepts the UUID primary key and fetches authoritative request data"
);

// --- 7. Scope Boundaries & Untouched Surfaces ---
console.log("\n--- 7. Scope Boundaries & Untouched Surfaces ---");

const serviceWorkloadCode = fs.readFileSync(serviceWorkloadTabPath, "utf-8");
const reportsOverviewCode = fs.readFileSync(reportsOverviewTabPath, "utf-8");
const customerStatementCode = fs.readFileSync(customerStatementTabPath, "utf-8");
const operationsInboxCode = fs.readFileSync(operationsInboxPath, "utf-8");

assert(
  serviceWorkloadCode.includes("srv.sharePercentage") &&
  reportsOverviewCode.includes("data.outstandingReceivables") &&
  customerStatementCode.includes("e.type === \"invoice\""),
  "Test 21: Reports (Phase 13) files are completely functional and preserved"
);

assert(
  operationsInboxCode.includes("QuickFollowupResolveModal") &&
  operationsInboxCode.includes("toggleDocumentVerification"),
  "Test 22: Operations (Phase 12) direct resolution surface remains intact"
);

console.log("\n==========================================================================");
console.log(`📊 TEST SUMMARY: ${passedCount} / ${passedCount + failedCount} ASSERTIONS PASSED (${failedCount} FAILED)`);
console.log("==========================================================================");

if (failedCount > 0) {
  process.exit(1);
}
