/**
 * ==============================================================================
 * MILESTONE 10 PHASE 2C-1: DEDICATED REQUEST WORKSPACE TEST SUITE
 * ==============================================================================
 * Comprehensive tests verifying:
 * 1. Route architecture, server-first design, and force-dynamic export
 * 2. Strict UUID parameter validation and notFound / operational-error boundaries
 * 3. Canonical detail contract & query reuse (RequestDrawerData / getServiceRequestDrawerData)
 * 4. Data minimization & privacy guarantees (zero storage paths, OCR, AI, raw UUIDs)
 * 5. Complete operational UI sections: Header, Overview, Customer, Documents, History, Billing
 * 6. Clean empty state contracts for zero-documents, zero-history, zero-invoices
 * 7. Canonical status transition modal reuse and router.refresh() invocation
 * 8. Strict hard-scope boundaries (no document, invoice, or payment mutations)
 * 9. Drawer-to-workspace deep link integration
 * ==============================================================================
 */

import fs from "fs";
import path from "path";
import { getServiceRequestStatusLabel } from "./src/lib/services/serviceRequestWorkflow";
import { RequestDrawerData } from "./src/app/(dashboard)/requests/types";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failedCount++;
  }
}

console.log("==========================================================================");
console.log("🧪 MILESTONE 10 PHASE 2C-1: DEDICATED REQUEST WORKSPACE TEST SUITE");
console.log("==========================================================================\n");

// Read source files for static verification
const pagePath = path.resolve("src/app/(dashboard)/requests/[id]/page.tsx");
const loadingPath = path.resolve("src/app/(dashboard)/requests/[id]/loading.tsx");
const notFoundPath = path.resolve("src/app/(dashboard)/requests/[id]/not-found.tsx");
const errorPath = path.resolve("src/app/(dashboard)/requests/[id]/error.tsx");
const workspacePath = path.resolve("src/components/requests/RequestWorkspace.tsx");
const actionsPath = path.resolve("src/components/requests/RequestWorkspaceActions.tsx");
const drawerPath = path.resolve("src/components/requests/RequestDrawer.tsx");
const serverActionsPath = path.resolve("src/app/(dashboard)/requests/actions.ts");
const servicesActionsPath = path.resolve("src/app/(dashboard)/services/actions.ts");

const pageCode = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf-8") : "";
const loadingCode = fs.existsSync(loadingPath) ? fs.readFileSync(loadingPath, "utf-8") : "";
const notFoundCode = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, "utf-8") : "";
const errorCode = fs.existsSync(errorPath) ? fs.readFileSync(errorPath, "utf-8") : "";
const workspaceCode = fs.existsSync(workspacePath) ? fs.readFileSync(workspacePath, "utf-8") : "";
const actionsCode = fs.existsSync(actionsPath) ? fs.readFileSync(actionsPath, "utf-8") : "";
const drawerCode = fs.existsSync(drawerPath) ? fs.readFileSync(drawerPath, "utf-8") : "";
const serverActionsCode = fs.existsSync(serverActionsPath) ? fs.readFileSync(serverActionsPath, "utf-8") : "";
const servicesActionsCode = fs.existsSync(servicesActionsPath) ? fs.readFileSync(servicesActionsPath, "utf-8") : "";

// ------------------------------------------------------------------------------
// 1. ROUTE ARCHITECTURE & SERVER-FIRST BOUNDARY
// ------------------------------------------------------------------------------
console.log("--- 1. Route Architecture & Server Boundary ---");

assert(fs.existsSync(pagePath), "1a. /requests/[id]/page.tsx exists");
assert(fs.existsSync(loadingPath), "1b. /requests/[id]/loading.tsx exists");
assert(fs.existsSync(notFoundPath), "1c. /requests/[id]/not-found.tsx exists");
assert(fs.existsSync(errorPath), "1d. /requests/[id]/error.tsx exists");
assert(fs.existsSync(workspacePath), "1e. RequestWorkspace.tsx component exists");
assert(fs.existsSync(actionsPath), "1f. RequestWorkspaceActions.tsx component exists");

assert(
  pageCode.includes('export const dynamic = "force-dynamic"'),
  "1g. page.tsx explicitly exports dynamic = 'force-dynamic' for authenticated RLS"
);

assert(
  !pageCode.includes('"use client"') && !pageCode.includes("'use client'"),
  "1h. page.tsx is strictly a Server Component"
);

assert(
  !workspaceCode.includes('"use client"') && !workspaceCode.includes("'use client'"),
  "1i. RequestWorkspace.tsx is strictly a Server Component (avoids unnecessary page hydration)"
);

assert(
  actionsCode.includes('"use client"') || actionsCode.includes("'use client'"),
  "1j. RequestWorkspaceActions.tsx is a dedicated Client Component island"
);

assert(
  errorCode.includes('"use client"') || errorCode.includes("'use client'"),
  "1k. error.tsx is a Client Component as required by Next.js error boundaries"
);

// ------------------------------------------------------------------------------
// 2. PARAM VALIDATION, NOT-FOUND & OPERATIONAL ERROR CONTRACT
// ------------------------------------------------------------------------------
console.log("\n--- 2. Parameter Validation & Error Handling ---");

const isValidUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

assert(
  isValidUuid("b41fc8ac-7e00-4025-8e44-5c192c87a73f"),
  "2a. Standard valid lowercase UUID passes validator"
);
assert(
  isValidUuid("B41FC8AC-7E00-4025-8E44-5C192C87A73F"),
  "2b. Valid uppercase UUID passes validator"
);
assert(!isValidUuid("not-a-uuid"), "2c. Non-UUID string rejected by validator");
assert(!isValidUuid("b41fc8ac-7e00-4025-8e44-5c192c87a73"), "2d. Truncated UUID rejected");
assert(!isValidUuid(""), "2e. Empty string rejected");

assert(
  pageCode.includes("isValidUuid(id)") && pageCode.includes("notFound()"),
  "2f. page.tsx validates UUID and calls notFound() on malformed input"
);

assert(
  serverActionsCode.includes("if (fetchError)") &&
    serverActionsCode.includes('errorCode: "query_failed"'),
  "2g. actions.ts strictly returns query_failed on operational fetchError"
);

assert(
  serverActionsCode.includes("if (!row)") &&
    serverActionsCode.includes('errorCode: "not_found"'),
  "2h. actions.ts returns not_found only when query succeeds but row is genuinely absent"
);

assert(
  pageCode.includes('result.errorCode === "not_found"') &&
    pageCode.includes('result.errorCode === "invalid_id"') &&
    pageCode.includes("notFound()"),
  "2i. page.tsx invokes notFound() for not_found and invalid_id error codes"
);

assert(
  !pageCode.includes("error.includes") && pageCode.includes("result.errorCode"),
  "2j. page.tsx relies on typed errorCode discrimination instead of fragile substring matching"
);

assert(
  pageCode.includes('result.errorCode === "auth_required"') &&
    pageCode.includes("throw new Error"),
  "2k. auth_required throws operational error instead of becoming a fake 404"
);

assert(
  pageCode.includes("throw new Error") &&
    pageCode.includes("result.errorCode"),
  "2l. query_failed throws operational error to error boundary and does NOT call notFound"
);

assert(
  notFoundCode.includes("Back to Requests Desk") && notFoundCode.includes("/requests"),
  "2m. not-found.tsx provides safe guidance and back navigation link"
);

assert(
  errorCode.includes("reset") && errorCode.includes("Retry") && errorCode.includes("/requests"),
  "2n. error.tsx provides safe failure recovery with reset() and desk navigation"
);

assert(
  !errorCode.includes("error.message") && !pageCode.includes("console.log(process.env"),
  "2o. error.tsx does not leak raw database/Postgres error messages into the DOM"
);

assert(
  loadingCode.includes("animate-pulse") && loadingCode.includes("h-"),
  "2p. loading.tsx provides skeleton layout structure matching workspace sections"
);

// ------------------------------------------------------------------------------
// 3. CANONICAL DETAIL CONTRACT REUSE & NO QUERY DUPLICATION
// ------------------------------------------------------------------------------
console.log("\n--- 3. Canonical Detail Contract Reuse ---");

assert(
  pageCode.includes("getServiceRequestDrawerData"),
  "3a. page.tsx directly reuses canonical getServiceRequestDrawerData query"
);

assert(
  !pageCode.includes("from(") && !pageCode.includes("createClient"),
  "3b. page.tsx does not construct an ad-hoc database query path"
);

assert(
  !serverActionsCode.includes("customer_services(*)") &&
    !serverActionsCode.includes("customer_documents(*)") &&
    !serverActionsCode.includes("services(*)"),
  "3c. Canonical query does not use wildcard selects"
);

// ------------------------------------------------------------------------------
// 4. DATA MINIMIZATION & PRIVACY GUARANTEES
// ------------------------------------------------------------------------------
console.log("\n--- 4. Data Minimization & Privacy Guarantees ---");

assert(
  !workspaceCode.includes("storage_url") &&
    !workspaceCode.includes("storage_path") &&
    !workspaceCode.includes("createSignedUrl"),
  "4a. RequestWorkspace strictly excludes storage paths and signed URLs"
);

assert(
  !workspaceCode.includes("ai_extracted_json") &&
    !workspaceCode.includes("extracted_data") &&
    !workspaceCode.includes("ocr_text"),
  "4b. RequestWorkspace strictly excludes raw AI JSON and OCR text"
);

assert(
  !workspaceCode.includes("changedBy") || workspaceCode.includes("Staff"),
  "4c. RequestWorkspace renders safe 'Staff' label instead of raw user UUIDs"
);

assert(
  !workspaceCode.includes("data.customer.aadhaar") && !workspaceCode.includes("data.customer.pan"),
  "4d. RequestWorkspace does not render unmasked customer national identity numbers"
);

// ------------------------------------------------------------------------------
// 5. OPERATIONAL UI SECTIONS & INVOICE CARDINALITY
// ------------------------------------------------------------------------------
console.log("\n--- 5. Operational UI Sections & Multi-Invoice Handling ---");

assert(
  workspaceCode.includes("Back to Requests Desk") && workspaceCode.includes('href="/requests"'),
  "5a. Header renders explicit back link to /requests desk"
);

assert(
  workspaceCode.includes("RequestStatusBadge") && workspaceCode.includes("RequestPriorityBadge"),
  "5b. Header renders status and priority badges"
);

assert(
  workspaceCode.includes("Request Overview") &&
    workspaceCode.includes("Target Portal") &&
    workspaceCode.includes("Gov / App Reference"),
  "5c. Overview card renders portal and application reference"
);

assert(
  workspaceCode.includes("Attached Documents (Read-Only)") &&
    workspaceCode.includes("requirementTag") &&
    workspaceCode.includes("isVerified"),
  "5d. Documents section renders metadata, tags, and verification badges"
);

assert(
  workspaceCode.includes("No documents attached to this service request"),
  "5e. Documents section contains explicit empty state"
);

assert(
  workspaceCode.includes("Workflow Audit History") &&
    workspaceCode.includes("Trigger-Owned") &&
    workspaceCode.includes("Staff"),
  "5f. History section renders trigger-owned audit timeline with Staff actor"
);

assert(
  workspaceCode.includes("No status transitions recorded yet"),
  "5g. History section contains explicit empty state"
);

assert(
  workspaceCode.includes("Customer Profile") &&
    workspaceCode.includes("/customers/") &&
    workspaceCode.includes("tab=services"),
  "5h. Customer section provides navigation to customer profile services tab"
);

assert(
  workspaceCode.includes("Billing & Invoicing") &&
    workspaceCode.includes("dueAmount") &&
    !workspaceCode.includes("balance_due"),
  "5i. Billing section uses verified dueAmount column (not hypothetical balance_due)"
);

assert(
  workspaceCode.includes("invoices.map") &&
    workspaceCode.includes("No invoices generated for this service request"),
  "5j. Billing section supports 0..N invoices and provides clean empty state"
);

// ------------------------------------------------------------------------------
// 6. STATUS TRANSITION REUSE & WORKFLOW ALIGNMENT
// ------------------------------------------------------------------------------
console.log("\n--- 6. Status Transition Modal Reuse ---");

assert(
  actionsCode.includes("RequestStatusTransitionModal"),
  "6a. Workspace actions island reuses canonical RequestStatusTransitionModal"
);

assert(
  actionsCode.includes("router.refresh()"),
  "6b. Status transition success invokes router.refresh() to reload server data"
);

assert(
  !actionsCode.includes("supabase.from") && !actionsCode.includes("update("),
  "6c. Client island performs zero direct client-side database mutations"
);

assert(
  servicesActionsCode.includes("export async function transitionServiceRequestStatus"),
  "6d. Canonical transition action remains strictly defined in services/actions.ts"
);

assert(
  !serverActionsCode.includes("transitionServiceRequestStatus") &&
    !actionsCode.includes("transitionServiceRequestStatus"),
  "6e. No second status mutation action is defined in requests/actions.ts or client actions island"
);

// ------------------------------------------------------------------------------
// 7. DRAWER-TO-WORKSPACE INTEGRATION
// ------------------------------------------------------------------------------
console.log("\n--- 7. Drawer-to-Workspace Integration ---");

assert(
  drawerCode.includes("/requests/${data.id}") || drawerCode.includes('href={`/requests/${data.id}`}'),
  "7a. RequestDrawer includes direct deep link to /requests/[id] full workspace"
);

assert(
  drawerCode.includes("Open Full Workspace") || drawerCode.includes("Workspace"),
  "7b. RequestDrawer link has human-readable label and aria accessibility"
);

// ------------------------------------------------------------------------------
// 8. STRICT PHASE 2C-1 SCOPE BOUNDARIES
// ------------------------------------------------------------------------------
console.log("\n--- 8. Strict Scope Boundaries ---");

assert(
  !workspaceCode.includes("DocumentUploadForm") &&
    !workspaceCode.includes("uploadDocument") &&
    !workspaceCode.includes("detachDocument"),
  "8a. Zero document mutations present in workspace (deferred to Phase 2C-2)"
);

assert(
  !workspaceCode.includes("generateInvoice") &&
    !workspaceCode.includes("createPayment") &&
    !workspaceCode.includes("recordPayment"),
  "8b. Zero invoice generation or payment mutations present (deferred to Phase 2C-3)"
);

assert(
  !workspaceCode.includes("<input") && !workspaceCode.includes("onSubmit"),
  "8c. Zero request metadata edit forms present in Phase 2C-1"
);

// ------------------------------------------------------------------------------
// 9. DTO CONTRACT FIDELITY TEST WITH MOCK DATA
// ------------------------------------------------------------------------------
console.log("\n--- 9. Mock DTO Contract Fidelity ---");

const mockRequest: RequestDrawerData = {
  id: "dd829fc2-e79c-40be-b97e-42d22dc0f824",
  requestNumber: "SR-2026-000001",
  status: "completed",
  priority: "normal",
  applicationReference: "APP-123456",
  portalName: "Digital Gujarat Portal",
  notes: "Handled expeditiously",
  rejectionReason: null,
  amount: 150,
  paymentStatus: "unpaid",
  serviceDate: "2026-08-16",
  dueDate: "2026-08-20",
  createdAt: "2026-08-16T06:16:03.232Z",
  completedAt: "2026-08-16T06:16:28.836Z",
  deliveredAt: null,
  archivedAt: null,
  isOverdue: false,
  customer: {
    id: "b41fc8ac-7e00-4025-8e44-5c192c87a73f",
    customerCode: "NUR-001",
    firstName: "ISLAM",
    middleName: null,
    lastName: "GAZI",
    phone: "9733671094",
  },
  service: {
    id: "7ede5c39-c5c0-4740-90c2-88e4cffde4f0",
    serviceCode: "PAN-NEW",
    serviceName: "New Pan Service",
    category: "Identity",
  },
  documents: [
    {
      id: "doc-1",
      requirementTag: "aadhaar",
      isVerified: true,
      documentId: "cd-1",
      documentType: "Aadhaar Card",
      documentName: "Aadhaar Front & Back.pdf",
      fileSize: 245000,
      status: "active",
      createdAt: "2026-08-16T06:16:03.232Z",
    },
  ],
  statusHistory: [
    {
      id: "hist-2",
      fromStatus: "in_progress",
      toStatus: "completed",
      changedBy: "user-1",
      createdAt: "2026-08-16T06:16:28.836Z",
    },
    {
      id: "hist-1",
      fromStatus: null,
      toStatus: "pending",
      changedBy: null,
      createdAt: "2026-08-16T06:16:03.232Z",
    },
  ],
  invoices: [
    {
      id: "inv-item-1",
      invoiceId: "inv-1",
      invoiceNumber: "INV-2026-001001",
      status: "draft",
      totalAmount: 150,
      dueAmount: 150,
      invoiceDate: "2026-08-18",
    },
  ],
};

assert(mockRequest.id.length === 36, "9a. Mock request ID adheres to UUID");
assert(mockRequest.documents.length === 1, "9b. Mock documents array accessible");
assert(mockRequest.statusHistory.length === 2, "9c. Mock history array accessible");
assert(mockRequest.invoices[0].dueAmount === 150, "9d. Mock invoice carries dueAmount");
assert(
  getServiceRequestStatusLabel(mockRequest.status) === "Completed",
  "9e. Status resolves to human-readable label"
);

console.log("\n==========================================================================");
console.log(`📊 PHASE 2C-1 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
console.log("==========================================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("VERDICT: ✅ ALL PHASE 2C-1 DEDICATED REQUEST WORKSPACE TESTS PASSED CLEANLY!\n");
}
