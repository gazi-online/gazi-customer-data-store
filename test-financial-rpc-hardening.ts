/**
 * ==============================================================================
 * GCDS Phase S3B: Privileged Financial RPC Role Hardening Test Suite (AMENDED)
 * File: test-financial-rpc-hardening.ts
 *
 * Verifies that all privileged financial RPCs (void_payment_atomic, refund_payment_atomic,
 * set_request_payment_waiver, unallocate_payment_atomic):
 * 1. Enforce authoritative database-level authentication (auth.uid() IS NOT NULL)
 * 2. Absolutely DO NOT rely on current_user inside SECURITY DEFINER (avoids function owner bypass)
 * 3. Contain NO service_role bypass; no legitimate service_role caller exists in GCDS
 * 4. Enforce authoritative database-level AAL2 assurance via auth.jwt()
 * 5. Enforce authoritative tenant membership (active member in customer's business)
 * 6. Enforce strict role boundary (owner or admin only; staff and viewer denied)
 * 7. Enforce Supabase hardened search_path: SET search_path = '' with schema qualification
 * 8. Revoke PUBLIC, anon, and service_role execute grants; grant ONLY to authenticated
 * 9. Prevent client role/user impersonation
 * 10. Preserve normal transactional operations for staff
 * 11. Preserve application-layer server action AAL2 enforcement
 * ==============================================================================
 */

import * as fs from "fs";
import * as path from "path";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(description: string, actual: unknown, expected: unknown) {
  totalTests++;
  const isMatch = actual === expected;
  if (isMatch) {
    passedTests++;
    console.log(`[PASS] ${description}: Expected '${expected}' | Got '${actual}' ➔ ✅`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${description}: Expected '${expected}' | Got '${actual}' ➔ ❌`);
  }
}

console.log("\n==========================================================================");
console.log("🛡️  GCDS S3B: PRIVILEGED FINANCIAL RPC ROLE HARDENING REGRESSION SUITE (AMENDED)");
console.log("==========================================================================\n");

// Read migration and source files
const migrationFilePath = path.join(process.cwd(), "supabase/migrations/20260925183000_phase3b_privileged_financial_rpc_hardening.sql");
assert("S3B migration file exists", fs.existsSync(migrationFilePath), true);

const migrationSql = fs.readFileSync(migrationFilePath, "utf8");
const paymentsActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/payments/actions.ts"), "utf8");
const servicesActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/services/actions.ts"), "utf8");
const invoicesActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/invoices/actions.ts"), "utf8");

// Parse functions from migration
const PRIVILEGED_RPCS = [
  "void_payment_atomic",
  "refund_payment_atomic",
  "set_request_payment_waiver",
  "unallocate_payment_atomic"
];

console.log("--- 1. Migration Structure & Privileged RPC Inventory ---");
for (const rpc of PRIVILEGED_RPCS) {
  const hasFunction = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}`, "i").test(migrationSql);
  assert(`Migration defines public.${rpc}`, hasFunction, true);
}

console.log("\n--- 2. Database-Level Authentication Enforcement & Zero current_user Reliance ---");
// ARCHITECTURAL RULE: Inside SECURITY DEFINER, current_user changes to function owner.
// Tests MUST fail if current_user is used as authorization boundary.
assert("Migration NEVER uses current_user as caller-identity or bypass check", !migrationSql.includes("current_user"), true);

for (const rpc of PRIVILEGED_RPCS) {
  const fullRpc = migrationSql.split(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}`, "i"))[1]?.split(/\n-- ===/)[0] || "";
  
  assert(`${rpc}: checks auth.uid() IS NULL fail-closed`, fullRpc.includes("v_user_id := auth.uid()") && fullRpc.includes("v_user_id IS NULL"), true);
  assert(`${rpc}: returns 'Authentication required' on unauthenticated call`, fullRpc.includes("'Authentication required'"), true);
  assert(`${rpc}: does NOT contain current_user bypass`, !fullRpc.includes("current_user"), true);
}

console.log("\n--- 3. Database-Level AAL2 Assurance Enforcement ---");
assert("Migration does NOT schema-qualify SQL syntax coalesce as pg_catalog.coalesce", !migrationSql.includes("pg_catalog.coalesce"), true);

for (const rpc of PRIVILEGED_RPCS) {
  const fullRpc = migrationSql.split(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}`, "i"))[1]?.split(/\n-- ===/)[0] || "";
  assert(`${rpc}: checks trusted JWT aal claim for 'aal2'`, fullRpc.includes("auth.jwt()->>'aal'") && fullRpc.includes("'aal2'"), true);
  assert(`${rpc}: schema-qualifies current_setting with pg_catalog`, fullRpc.includes("pg_catalog.current_setting('request.jwt.claim.aal', true)"), true);
  assert(`${rpc}: denies AAL1 invocation with elevated security verification error`, fullRpc.includes("'Elevated security verification required (AAL2)'"), true);
}

console.log("\n--- 4. Authoritative Tenant & Role Boundary (Owner/Admin Only) ---");
for (const rpc of PRIVILEGED_RPCS) {
  const fullRpc = migrationSql.split(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}`, "i"))[1]?.split(/\n-- ===/)[0] || "";
  assert(`${rpc}: resolves role from public.business_memberships using auth.uid()`, fullRpc.includes("FROM public.customers c") && fullRpc.includes("JOIN public.business_memberships bm ON bm.business_id = c.business_id") && fullRpc.includes("bm.user_id = v_user_id"), true);
  assert(`${rpc}: validates active status in business_memberships`, fullRpc.includes("bm.status = 'active'"), true);
  assert(`${rpc}: restricts access to ('owner', 'admin') only`, fullRpc.includes("v_caller_role NOT IN ('owner', 'admin')"), true);
  assert(`${rpc}: denies non-owner/non-admin roles with explicit error`, fullRpc.includes("'Access denied: Only shop owners or administrators can perform this operation'"), true);
  assert(`${rpc}: denies cross-tenant or inactive users`, fullRpc.includes("'Access denied: User is not an active member of this business'"), true);
}

console.log("\n--- 5. Supabase Hardened search_path = '' & Schema Qualification Audit ---");
for (const rpc of PRIVILEGED_RPCS) {
  const fullRpc = migrationSql.split(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}`, "i"))[1]?.split(/\n-- ===/)[0] || "";
  assert(`${rpc}: explicitly declared SECURITY DEFINER`, /SECURITY\s+DEFINER/i.test(fullRpc), true);
  // Must use empty search_path per Supabase hardening guidance
  assert(`${rpc}: sets hardened search_path = ''`, /SET\s+search_path\s*=\s*''/i.test(fullRpc), true);
  assert(`${rpc}: does NOT use public, pg_temp in search_path`, !/SET\s+search_path\s*=\s*['"]?public/i.test(fullRpc), true);
  // Must use schema-qualified built-in helpers
  assert(`${rpc}: schema-qualifies jsonb_build_object with pg_catalog`, fullRpc.includes("pg_catalog.jsonb_build_object"), true);
  assert(`${rpc}: uses standard SQL syntax coalesce (NOT pg_catalog.coalesce)`, !fullRpc.includes("pg_catalog.coalesce") && fullRpc.includes("coalesce("), true);
  if (rpc !== "unallocate_payment_atomic") {
    assert(`${rpc}: schema-qualifies set_config with pg_catalog`, fullRpc.includes("pg_catalog.set_config"), true);
  }
}

console.log("\n--- 6. Least-Privilege Execution Grants: Zero service_role/anon/PUBLIC Access ---");
for (const rpc of PRIVILEGED_RPCS) {
  // Revoke from PUBLIC, anon, and service_role
  assert(`${rpc}: revokes execution from PUBLIC, anon, service_role`, new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[^;]+FROM\\s+PUBLIC,\\s*anon,\\s*service_role;`, "i").test(migrationSql), true);
  // Grant ONLY to authenticated
  assert(`${rpc}: grants execution ONLY to authenticated`, new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[^;]+TO\\s+authenticated;`, "i").test(migrationSql), true);
  // Must NOT grant to service_role (no legitimate service_role caller exists)
  assert(`${rpc}: does NOT grant execution to service_role`, !new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[^;]+TO[^;]*\\bservice_role\\b`, "i").test(migrationSql), true);
}

console.log("\n--- 7. Client Impersonation & Parameter Spoofing Prevention ---");
// Verify signatures do NOT accept user_id or business_id parameters from caller
assert("void_payment_atomic accepts ONLY p_payment_id uuid", /void_payment_atomic\(\s*p_payment_id\s+(?:pg_catalog\.)?uuid\s*\)/i.test(migrationSql), true);
assert("refund_payment_atomic accepts ONLY p_payment_id uuid", /refund_payment_atomic\(\s*p_payment_id\s+(?:pg_catalog\.)?uuid\s*\)/i.test(migrationSql), true);
assert("set_request_payment_waiver accepts ONLY p_request_id UUID, p_waived BOOLEAN/BOOL", /set_request_payment_waiver\(\s*p_request_id\s+(?:pg_catalog\.)?UUID,\s*p_waived\s+(?:pg_catalog\.)?bool(?:ean)?\s*\)/i.test(migrationSql), true);
assert("unallocate_payment_atomic accepts ONLY p_payment_id UUID, p_invoice_id UUID", /unallocate_payment_atomic\(\s*p_payment_id\s+(?:pg_catalog\.)?UUID,\s*p_invoice_id\s+(?:pg_catalog\.)?UUID\s*\)/i.test(migrationSql), true);

console.log("\n--- 8. Simulated PostgreSQL Authorization Logic Matrix (Amended) ---");

interface SimulatedContext {
  userId: string | null;
  jwtAal: string | null;
  membership: { businessId: string; role: string; status: string } | null;
  targetCustomerBusinessId: string;
}

function simulateRpcAuthorization(ctx: SimulatedContext): { allowed: boolean; error?: string } {
  const v_user_id = ctx.userId;

  // 1. Fail-closed authentication check: auth.uid() must be non-null
  if (!v_user_id) {
    return { allowed: false, error: "Authentication required" };
  }

  // 2. Authoritative AAL2 check: trusted JWT claim must be 'aal2'
  if (ctx.jwtAal !== "aal2") {
    return { allowed: false, error: "Elevated security verification required (AAL2)" };
  }

  // 3. Authoritative Tenant & Role check: must be active owner or admin
  if (!ctx.membership || ctx.membership.businessId !== ctx.targetCustomerBusinessId || ctx.membership.status !== "active") {
    return { allowed: false, error: "Access denied: User is not an active member of this business" };
  }

  if (!["owner", "admin"].includes(ctx.membership.role)) {
    return { allowed: false, error: "Access denied: Only shop owners or administrators can perform this operation" };
  }

  return { allowed: true };
}

// Test Matrix
const BIZ_A = "biz-1111-aaaa";
const BIZ_B = "biz-2222-bbbb";

// Case 1: Unauthenticated caller
const resUnauth = simulateRpcAuthorization({
  userId: null,
  jwtAal: null,
  membership: null,
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated unauthenticated caller rejected", resUnauth.allowed, false);
assert("Simulated unauthenticated caller error is 'Authentication required'", resUnauth.error, "Authentication required");

// Case 2: Authenticated but AAL1 only
const resAal1 = simulateRpcAuthorization({
  userId: "user-1",
  jwtAal: "aal1",
  membership: { businessId: BIZ_A, role: "owner", status: "active" },
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated AAL1 owner caller rejected", resAal1.allowed, false);
assert("Simulated AAL1 error is AAL2 verification required", resAal1.error, "Elevated security verification required (AAL2)");

// Case 3: Authenticated AAL2 but viewer role
const resViewer = simulateRpcAuthorization({
  userId: "user-2",
  jwtAal: "aal2",
  membership: { businessId: BIZ_A, role: "viewer", status: "active" },
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated AAL2 viewer rejected", resViewer.allowed, false);
assert("Simulated viewer error is owner/admin required", resViewer.error, "Access denied: Only shop owners or administrators can perform this operation");

// Case 4: Authenticated AAL2 but staff role
const resStaff = simulateRpcAuthorization({
  userId: "user-3",
  jwtAal: "aal2",
  membership: { businessId: BIZ_A, role: "staff", status: "active" },
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated AAL2 staff rejected from privileged financial RPC", resStaff.allowed, false);
assert("Simulated staff error is owner/admin required", resStaff.error, "Access denied: Only shop owners or administrators can perform this operation");

// Case 5: Authenticated AAL2 but operator role
const resOperator = simulateRpcAuthorization({
  userId: "user-4",
  jwtAal: "aal2",
  membership: { businessId: BIZ_A, role: "operator", status: "active" },
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated AAL2 operator rejected from privileged financial RPC", resOperator.allowed, false);

// Case 6: Authenticated AAL2 owner of DIFFERENT business (Cross-tenant attack)
const resCrossTenant = simulateRpcAuthorization({
  userId: "user-5",
  jwtAal: "aal2",
  membership: { businessId: BIZ_B, role: "owner", status: "active" },
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated cross-tenant owner rejected", resCrossTenant.allowed, false);
assert("Simulated cross-tenant error is not an active member of this business", resCrossTenant.error, "Access denied: User is not an active member of this business");

// Case 7: Suspended owner
const resSuspended = simulateRpcAuthorization({
  userId: "user-6",
  jwtAal: "aal2",
  membership: { businessId: BIZ_A, role: "owner", status: "suspended" },
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated suspended owner rejected", resSuspended.allowed, false);

// Case 8: Authenticated AAL2 admin of target business
const resAdmin = simulateRpcAuthorization({
  userId: "user-7",
  jwtAal: "aal2",
  membership: { businessId: BIZ_A, role: "admin", status: "active" },
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated valid AAL2 admin allowed", resAdmin.allowed, true);

// Case 9: Authenticated AAL2 owner of target business
const resOwner = simulateRpcAuthorization({
  userId: "user-8",
  jwtAal: "aal2",
  membership: { businessId: BIZ_A, role: "owner", status: "active" },
  targetCustomerBusinessId: BIZ_A
});
assert("Simulated valid AAL2 owner allowed", resOwner.allowed, true);

// Case 10: Zero-caller service_role or unauthenticated maintenance attempt without auth.uid() fails closed
const resNoAuth = simulateRpcAuthorization({
  userId: null,
  jwtAal: null,
  membership: null,
  targetCustomerBusinessId: BIZ_A
});
assert("Direct unauthenticated/service_role invocation without auth.uid() fails closed", resNoAuth.allowed, false);

console.log("\n--- 9. Application Compatibility & Defense-in-Depth Verification ---");
// Check that server actions maintain requireAal2 AND pass exact RPC parameters
assert("payments/actions.ts: voidPayment calls requireAal2", /export async function voidPayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?supabase\.rpc\("void_payment_atomic"/.test(paymentsActionsSrc), true);
assert("payments/actions.ts: refundPayment calls requireAal2", /export async function refundPayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?supabase\.rpc\("refund_payment_atomic"/.test(paymentsActionsSrc), true);
assert("payments/actions.ts: unallocatePayment calls requireAal2", /export async function unallocatePayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?supabase\.rpc\("unallocate_payment_atomic"/.test(paymentsActionsSrc), true);
assert("services/actions.ts: setRequestPaymentWaiver calls requireAal2", /export async function setRequestPaymentWaiver[\s\S]*?requireAal2\(supabase\)[\s\S]*?supabase\.rpc\("set_request_payment_waiver"/.test(servicesActionsSrc), true);
assert("invoices/actions.ts: createInvoice calls requireAal2", /export async function createInvoice[\s\S]*?requireAal2\(supabase\)[\s\S]*?supabase\.rpc\("create_invoice_atomic"/.test(invoicesActionsSrc), true);
assert("payments/actions.ts: allocatePayment calls requireAal2", /export async function allocatePayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?supabase\.rpc\("allocate_payment_atomic"/.test(paymentsActionsSrc), true);
assert("payments/actions.ts: createPayment calls requireAal2", /export async function createPayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?supabase\.rpc\("record_payment/.test(paymentsActionsSrc), true);

console.log("\n--- 10. Normal Transactional Operations Preserve Staff Usability ---");
// Verify that allocate_payment_atomic, record_payment_atomic, create_invoice_atomic are NOT restricted to owner/admin
const allocateFunc = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.allocate_payment_atomic\b/i.test(migrationSql);
assert("Migration does NOT restrict normal allocate_payment_atomic to owner/admin", !allocateFunc, true);
const recordPaymentFunc = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_payment_atomic\b/i.test(migrationSql);
assert("Migration does NOT restrict normal record_payment_atomic to owner/admin", !recordPaymentFunc, true);
const createInvoiceFunc = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_invoice_atomic\b/i.test(migrationSql);
assert("Migration does NOT restrict normal create_invoice_atomic to owner/admin", !createInvoiceFunc, true);

console.log("\n==========================================================================");
console.log(`TOTAL S3B TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log("==========================================================================\n");

if (failedTests > 0) {
  process.exit(1);
}
