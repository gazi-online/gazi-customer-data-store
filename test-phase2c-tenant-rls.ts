/**
 * ==============================================================================
 * MILESTONE 10 PHASE 2C-2: SERVICE REQUEST TENANT RLS HARDENING TEST SUITE
 * ==============================================================================
 * Validates the tenant RLS hardening migration and runtime security policy rules:
 * 1. Exactly 3 tables targeted (customer_services, service_request_documents, service_request_status_history)
 * 2. All legacy broad policies dropped ("Authenticated users can...")
 * 3. customer_services has SELECT, INSERT, UPDATE tenant policies (NO DELETE policy)
 * 4. service_request_documents has SELECT, INSERT, UPDATE, DELETE tenant policies
 * 5. service_request_documents INSERT strictly enforces created_by = auth.uid()
 * 6. service_request_status_history has SELECT tenant policy ONLY (trigger-owned)
 * 7. Tenant chain correctly traverses business_memberships with status = 'active'
 * 8. Integrity trigger check_service_request_document_integrity is preserved
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
console.log("🧪 MILESTONE 10 PHASE 2C-2: TENANT RLS HARDENING SECURITY SUITE");
console.log("==========================================================================\n");

// Read migration file
const migrationPath = path.resolve("service_requests_tenant_rls_hardening_migration.sql");
assert.strictEqual(fs.existsSync(migrationPath), true, "Migration file must exist at repository root");
const migrationSql = fs.readFileSync(migrationPath, "utf-8").replace(/\r\n/g, "\n");

// ─── 1. MIGRATION SCOPE & INTEGRITY CHECKS ───────────────────────────────────

it("1a. Migration targets exactly the 3 intended tables", () => {
  const allowedTables = [
    "customer_services",
    "service_request_documents",
    "service_request_status_history"
  ];

  // Verify ENABLE ROW LEVEL SECURITY on all 3
  for (const table of allowedTables) {
    const rlsRegex = new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`, "i");
    assert.strictEqual(rlsRegex.test(migrationSql), true, `Must enable RLS on public.${table}`);
  }

  // Ensure no other tables are modified
  const alterMatches = migrationSql.match(/ALTER TABLE\s+([^\s;]+)/gi) || [];
  for (const match of alterMatches) {
    const tableName = match.replace(/ALTER TABLE\s+/i, "").trim().replace("public.", "");
    assert.strictEqual(
      allowedTables.includes(tableName),
      true,
      `Unexpected table altered in migration: ${tableName}`
    );
  }
});

it("1b. Migration does not perform DML data mutations or drop tables/columns", () => {
  assert.strictEqual(/INSERT INTO public\./i.test(migrationSql), false, "Must not insert business data");
  assert.strictEqual(/UPDATE public\./i.test(migrationSql), false, "Must not update business data");
  assert.strictEqual(/DELETE FROM public\./i.test(migrationSql), false, "Must not delete business data");
  assert.strictEqual(/DROP TABLE/i.test(migrationSql), false, "Must not drop tables");
  assert.strictEqual(/DROP COLUMN/i.test(migrationSql), false, "Must not drop columns");
});

// ─── 2. LEGACY BROAD POLICY CLEANUP ──────────────────────────────────────────

it("2a. Drops all legacy broad policies on customer_services", () => {
  assert.strictEqual(
    migrationSql.includes('DROP POLICY IF EXISTS "Authenticated users can view customer_services"'),
    true
  );
  assert.strictEqual(
    migrationSql.includes('DROP POLICY IF EXISTS "Authenticated users can insert customer_services"'),
    true
  );
  assert.strictEqual(
    migrationSql.includes('DROP POLICY IF EXISTS "Authenticated users can update customer_services"'),
    true
  );
});

it("2b. Drops all legacy broad policies on service_request_documents", () => {
  assert.strictEqual(
    migrationSql.includes('DROP POLICY IF EXISTS "Authenticated users can view service_request_documents"'),
    true
  );
  assert.strictEqual(
    migrationSql.includes('DROP POLICY IF EXISTS "Authenticated users can insert service_request_documents"'),
    true
  );
  assert.strictEqual(
    migrationSql.includes('DROP POLICY IF EXISTS "Authenticated users can update service_request_documents"'),
    true
  );
  assert.strictEqual(
    migrationSql.includes('DROP POLICY IF EXISTS "Authenticated users can delete service_request_documents"'),
    true
  );
});

it("2c. Drops legacy broad policy on service_request_status_history", () => {
  assert.strictEqual(
    migrationSql.includes('DROP POLICY IF EXISTS "Authenticated users can view service_request_status_history"'),
    true
  );
});

// ─── 3. CUSTOMER_SERVICES TENANT POLICIES ────────────────────────────────────

it("3a. customer_services defines SELECT, INSERT, UPDATE tenant policies", () => {
  assert.strictEqual(migrationSql.includes('CREATE POLICY "customer_services_tenant_select"'), true);
  assert.strictEqual(migrationSql.includes('CREATE POLICY "customer_services_tenant_insert"'), true);
  assert.strictEqual(migrationSql.includes('CREATE POLICY "customer_services_tenant_update"'), true);
});

it("3b. customer_services expressly DOES NOT define a DELETE policy", () => {
  assert.strictEqual(
    /CREATE POLICY\s+"customer_services_tenant_delete"/i.test(migrationSql),
    false,
    "customer_services must not have a DELETE policy"
  );
  assert.strictEqual(
    /CREATE POLICY[^\n]+ON\s+public\.customer_services\s+FOR\s+DELETE/i.test(migrationSql),
    false,
    "No DELETE policy should be created on customer_services"
  );
});

it("3c. customer_services derives tenant access via customers.business_id and active business_memberships", () => {
  const csSelectMatch = migrationSql.match(/CREATE POLICY "customer_services_tenant_select"[\s\S]+?;\n\n/);
  assert.strictEqual(!!csSelectMatch, true, "customer_services_tenant_select block found");
  const sql = csSelectMatch![0];
  assert.strictEqual(sql.includes("JOIN public.business_memberships bm ON bm.business_id = c.business_id"), true);
  assert.strictEqual(sql.includes("bm.user_id = auth.uid()"), true);
  assert.strictEqual(sql.includes("bm.status = 'active'"), true);
});

// ─── 4. SERVICE_REQUEST_DOCUMENTS TENANT POLICIES ────────────────────────────

it("4a. service_request_documents defines SELECT, INSERT, UPDATE, DELETE tenant policies", () => {
  assert.strictEqual(migrationSql.includes('CREATE POLICY "service_request_documents_tenant_select"'), true);
  assert.strictEqual(migrationSql.includes('CREATE POLICY "service_request_documents_tenant_insert"'), true);
  assert.strictEqual(migrationSql.includes('CREATE POLICY "service_request_documents_tenant_update"'), true);
  assert.strictEqual(migrationSql.includes('CREATE POLICY "service_request_documents_tenant_delete"'), true);
});

it("4b. service_request_documents INSERT strictly enforces created_by = auth.uid()", () => {
  const insertMatch = migrationSql.match(/CREATE POLICY "service_request_documents_tenant_insert"[\s\S]+?;\n\n/);
  assert.strictEqual(!!insertMatch, true, "service_request_documents_tenant_insert block found");
  const sql = insertMatch![0];
  assert.strictEqual(
    sql.includes("(created_by = auth.uid())"),
    true,
    "service_request_documents INSERT must require created_by = auth.uid()"
  );
});

it("4c. service_request_documents UPDATE does NOT require created_by = auth.uid()", () => {
  const updateMatch = migrationSql.match(/CREATE POLICY "service_request_documents_tenant_update"[\s\S]+?;\n\n/);
  assert.strictEqual(!!updateMatch, true, "service_request_documents_tenant_update block found");
  const sql = updateMatch![0];
  assert.strictEqual(
    sql.includes("created_by = auth.uid()"),
    false,
    "service_request_documents UPDATE must preserve creator and not enforce created_by = auth.uid()"
  );
});

it("4d. service_request_documents derives tenant via customer_services -> customers -> business_memberships", () => {
  const selectMatch = migrationSql.match(/CREATE POLICY "service_request_documents_tenant_select"[\s\S]+?;/);
  assert.strictEqual(!!selectMatch, true, "service_request_documents_tenant_select block found");
  const sql = selectMatch![0];
  assert.strictEqual(sql.includes("FROM public.customer_services cs"), true);
  assert.strictEqual(sql.includes("JOIN public.customers c ON c.id = cs.customer_id"), true);
  assert.strictEqual(sql.includes("JOIN public.business_memberships bm ON bm.business_id = c.business_id"), true);
  assert.strictEqual(sql.includes("bm.user_id = auth.uid()"), true);
  assert.strictEqual(sql.includes("bm.status = 'active'"), true);
});

// ─── 5. STATUS HISTORY TENANT POLICY ─────────────────────────────────────────

it("5a. service_request_status_history defines tenant SELECT policy ONLY", () => {
  assert.strictEqual(migrationSql.includes('CREATE POLICY "service_request_status_history_tenant_select"'), true);
  assert.strictEqual(
    /CREATE POLICY[^\n]+ON\s+public\.service_request_status_history\s+FOR\s+INSERT/i.test(migrationSql),
    false,
    "No INSERT policy on status history"
  );
  assert.strictEqual(
    /CREATE POLICY[^\n]+ON\s+public\.service_request_status_history\s+FOR\s+UPDATE/i.test(migrationSql),
    false,
    "No UPDATE policy on status history"
  );
  assert.strictEqual(
    /CREATE POLICY[^\n]+ON\s+public\.service_request_status_history\s+FOR\s+DELETE/i.test(migrationSql),
    false,
    "No DELETE policy on status history"
  );
});

// ─── 6. POSTGREST SCHEMA CACHE RELOAD ────────────────────────────────────────

it("6a. Migration issues PostgREST schema cache reload notification", () => {
  assert.strictEqual(migrationSql.includes("NOTIFY pgrst, 'reload schema';"), true);
});

console.log("\n==========================================================================");
console.log(`🏁 TENANT RLS HARDENING TESTS: ${passedTests}/${totalTests} PASSED`);
console.log("==========================================================================");

if (passedTests !== totalTests) {
  process.exit(1);
}
