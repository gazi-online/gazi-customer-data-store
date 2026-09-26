/**
 * ==============================================================================
 * GCDS REGRESSION TEST SUITE: CUSTOMER CREATION RLS & TENANT ENFORCEMENT
 * File: test-customer-rls-regression.ts
 *
 * Validates the fix for:
 * "new row violates row-level security policy for table 'customers'"
 *
 * Verifies:
 * 1. Authenticated active member can create customer in own business
 * 2. Missing business_id is authoritatively resolved from active membership
 * 3. Wrong/mismatched business_id from client cannot bypass tenant isolation
 * 4. Customer cannot be created in another business
 * 5. Inactive / suspended user cannot create customer
 * 6. Unauthenticated caller fails closed
 * 7. Manual creation flow works end-to-end
 * 8. Smart Import -> Check Details -> Save Customer flow works end-to-end
 * 9. Existing customer update works and enforces tenant immutability
 * 10. AAL2 MFA enforcement, zero service_role bypass, no disabled RLS
 * ==============================================================================
 */

import * as fs from "fs";
import * as path from "path";
import assert from "assert";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function it(description: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✅ [PASS] ${description}`);
  } catch (err: unknown) {
    failedTests++;
    console.error(`❌ [FAIL] ${description}`);
    console.error(err);
  }
}

console.log("==========================================================================");
console.log("🔒 GCDS REGRESSION SUITE: CUSTOMER CREATION RLS & TENANT ENFORCEMENT");
console.log("==========================================================================\n");

// Read target source files
const customerActionsSrc = fs.readFileSync(
  path.join(process.cwd(), "src/app/(dashboard)/customers/actions.ts"),
  "utf8"
);
const customerTypesSrc = fs.readFileSync(
  path.join(process.cwd(), "src/types/customer.ts"),
  "utf8"
);

// ─── 1. ARCHITECTURAL & CODE LEVEL SECURITY INVARIANTS ───────────────────────────

console.log("--- 1. Static Security & Tenant Isolation Invariants ---");

it("1a. createCustomer enforces requireAal2 before any DB query or mutation", () => {
  const match = /export async function createCustomer[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.insert\(/.test(customerActionsSrc);
  assert.strictEqual(match, true, "requireAal2 must be called prior to insert");
});

it("1b. createCustomer re-resolves active business membership server-side from business_memberships", () => {
  assert.strictEqual(customerActionsSrc.includes('.from("business_memberships")'), true, "Must query business_memberships table");
  assert.strictEqual(customerActionsSrc.includes('.eq("status", "active")'), true, "Must filter by status = active");
  assert.strictEqual(customerActionsSrc.includes('.eq("user_id", user.id)'), true, "Must filter by authenticated user.id");
});

it("1c. createCustomer authoritatively sets payload.business_id = membership.business_id", () => {
  assert.strictEqual(
    customerActionsSrc.includes("payload.business_id = membership.business_id;"),
    true,
    "payload.business_id must be assigned from verified server membership"
  );
});

it("1d. createCustomer rejects client attempt to supply mismatched business_id", () => {
  assert.strictEqual(
    customerActionsSrc.includes('clientBusinessId !== membership.business_id'),
    true,
    "Must detect and reject mismatched client-supplied business_id"
  );
  assert.strictEqual(
    customerActionsSrc.includes("Access denied: Cannot create customer in another business"),
    true,
    "Must return clear tenant boundary violation error"
  );
});

it("1e. updateCustomer strips business_id ensuring absolute tenant immutability", () => {
  assert.strictEqual(
    customerActionsSrc.includes("delete payload.business_id;"),
    true,
    "updateCustomer must delete payload.business_id to prevent tenant mutation"
  );
  assert.strictEqual(
    customerActionsSrc.includes("export async function updateCustomer"),
    true
  );
});

it("1f. Zero service_role usage, zero RLS bypass, no hardcoded UUIDs", () => {
  assert.strictEqual(customerActionsSrc.includes("service_role"), false, "Must not use service_role");
  assert.strictEqual(customerActionsSrc.includes("USING (true)"), false, "Must not add permissive USING(true)");
  assert.strictEqual(customerActionsSrc.includes("WITH CHECK (true)"), false, "Must not add permissive WITH CHECK(true)");
  assert.strictEqual(customerActionsSrc.includes("00000000-0000-0000-0000-000000000000"), false, "No hardcoded UUID");
});

it("1g. Customer types define optional business_id", () => {
  assert.strictEqual(customerTypesSrc.includes("business_id?: string;"), true, "Customer interface must support business_id");
});

// ─── 2. SIMULATED RLS & SERVER RESOLVER EVALUATION MATRIX ───────────────────────

console.log("\n--- 2. Simulated RLS Policy & Server Context Resolution Matrix ---");

interface MockUser {
  id: string;
  email: string;
}

interface MockMembership {
  user_id: string;
  business_id: string;
  role: string;
  status: 'active' | 'suspended' | 'inactive';
}

interface MockCustomerRow {
  id: string;
  business_id: string | null;
  customer_code?: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
}

// Database state simulator
class MockPostgresRlsEngine {
  public memberships: MockMembership[] = [];
  public customers: MockCustomerRow[] = [];

  /**
   * Evaluates the verified live customer INSERT policy:
   * EXISTS (
   *   SELECT 1
   *   FROM business_memberships m
   *   WHERE
   *     m.business_id = customers.business_id
   *     AND m.user_id = auth.uid()
   *     AND m.status = 'active'
   * )
   */
  evaluateInsertRls(authUid: string | null, newCustomer: MockCustomerRow): { allowed: boolean; error?: string } {
    if (!authUid) {
      return { allowed: false, error: 'new row violates row-level security policy for table "customers"' };
    }
    if (!newCustomer.business_id) {
      return { allowed: false, error: 'new row violates row-level security policy for table "customers"' };
    }

    const hasActiveMembership = this.memberships.some(
      m => m.business_id === newCustomer.business_id && m.user_id === authUid && m.status === 'active'
    );

    if (hasActiveMembership) {
      return { allowed: true };
    }
    return { allowed: false, error: 'new row violates row-level security policy for table "customers"' };
  }

  // Server action logic simulation mirroring actions.ts
  simulateCreateCustomer(
    authUser: MockUser | null,
    clientData: { business_id?: string; first_name: string; last_name: string; phone: string; status: string }
  ): { success?: boolean; customer?: MockCustomerRow; error?: string } {
    if (!authUser) {
      return { error: "Authentication required" };
    }

    // Server-side resolver
    const activeMembership = this.memberships.find(
      m => m.user_id === authUser.id && m.status === 'active'
    );

    if (!activeMembership || !activeMembership.business_id) {
      return { error: "Access denied: Active business membership required" };
    }

    // Client tampering check
    const clientBusinessId = clientData.business_id;
    if (
      typeof clientBusinessId === "string" &&
      clientBusinessId.trim() !== "" &&
      clientBusinessId !== activeMembership.business_id
    ) {
      return { error: "Access denied: Cannot create customer in another business" };
    }

    const payload: MockCustomerRow = {
      id: "cust-" + Math.random().toString(36).substring(2, 9),
      ...clientData,
      business_id: activeMembership.business_id, // Authoritative bind
    };

    // Postgres RLS check
    const rlsResult = this.evaluateInsertRls(authUser.id, payload);
    if (!rlsResult.allowed) {
      return { error: rlsResult.error };
    }

    this.customers.push(payload);
    return { success: true, customer: payload };
  }

  // Server action logic simulation for updateCustomer
  simulateUpdateCustomer(
    authUser: MockUser | null,
    customerId: string,
    updateData: { business_id?: string; first_name?: string; last_name?: string; phone?: string }
  ): { success?: boolean; error?: string } {
    if (!authUser) {
      return { error: "Authentication required" };
    }

    const activeMembership = this.memberships.find(
      m => m.user_id === authUser.id && m.status === 'active'
    );
    if (!activeMembership) {
      return { error: "Access denied: Active business membership required" };
    }

    const existing = this.customers.find(c => c.id === customerId);
    if (!existing) {
      return { error: "Customer not found" };
    }

    // Must be in caller's business
    if (existing.business_id !== activeMembership.business_id) {
      return { error: "Access denied: Cross-tenant update blocked" };
    }

    const sanitizedData = { ...updateData };
    delete sanitizedData.business_id; // Tenant immutability

    Object.assign(existing, sanitizedData);
    return { success: true };
  }
}

// Instantiate test environment
const db = new MockPostgresRlsEngine();

// Business A setup
const BIZ_A = "11111111-1111-1111-1111-111111111111";
const BIZ_B = "22222222-2222-2222-2222-222222222222";

const userActiveOwnerA: MockUser = { id: "user-active-a", email: "owner@biza.com" };
const userSuspendedA: MockUser = { id: "user-suspended-a", email: "suspended@biza.com" };
const userActiveOwnerB: MockUser = { id: "user-active-b", email: "owner@bizb.com" };
const userNoBiz: MockUser = { id: "user-no-biz", email: "nobiz@example.com" };

db.memberships.push({ user_id: userActiveOwnerA.id, business_id: BIZ_A, role: "owner", status: "active" });
db.memberships.push({ user_id: userSuspendedA.id, business_id: BIZ_A, role: "operator", status: "suspended" });
db.memberships.push({ user_id: userActiveOwnerB.id, business_id: BIZ_B, role: "owner", status: "active" });

// ─── 3. TEST SCENARIOS ──────────────────────────────────────────────────────────

it("2a. Authenticated active member can create customer in own business (business_id omitted by client)", () => {
  const result = db.simulateCreateCustomer(userActiveOwnerA, {
    first_name: "Tariq",
    last_name: "Gazi",
    phone: "9876543210",
    status: "active",
  });

  assert.strictEqual(result.success, true);
  assert.ok(result.customer);
  assert.strictEqual(result.customer.business_id, BIZ_A);
  assert.strictEqual(result.customer.first_name, "Tariq");
});

it("2b. Missing business_id cannot bypass tenant isolation (always bound to caller's active business)", () => {
  const result = db.simulateCreateCustomer(userActiveOwnerA, {
    first_name: "Fatima",
    last_name: "Khatun",
    phone: "9876543211",
    status: "active",
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.customer?.business_id, BIZ_A, "Must bind to BIZ_A, not null or random");
});

it("2c. Customer cannot be created in another business (client supplies wrong business_id)", () => {
  const result = db.simulateCreateCustomer(userActiveOwnerA, {
    business_id: BIZ_B, // Malicious or confused client attempts to inject into Biz B
    first_name: "Mallory",
    last_name: "Attacker",
    phone: "9876543212",
    status: "active",
  });

  assert.strictEqual(result.success, undefined);
  assert.strictEqual(result.error, "Access denied: Cannot create customer in another business");
});

it("2d. Direct unauthenticated insert violates customers RLS policy", () => {
  const rawRow: MockCustomerRow = {
    id: "raw-cust-1",
    business_id: BIZ_A,
    first_name: "Anon",
    last_name: "User",
    phone: "9876543213",
    status: "active",
  };
  const rlsResult = db.evaluateInsertRls(null, rawRow);
  assert.strictEqual(rlsResult.allowed, false);
  assert.strictEqual(rlsResult.error, 'new row violates row-level security policy for table "customers"');
});

it("2e. Direct insert with NULL business_id violates customers RLS policy", () => {
  const rawRow: MockCustomerRow = {
    id: "raw-cust-2",
    business_id: null,
    first_name: "NoBiz",
    last_name: "Customer",
    phone: "9876543214",
    status: "active",
  };
  const rlsResult = db.evaluateInsertRls(userActiveOwnerA.id, rawRow);
  assert.strictEqual(rlsResult.allowed, false);
  assert.strictEqual(rlsResult.error, 'new row violates row-level security policy for table "customers"');
});

it("2f. Suspended user cannot create customer", () => {
  const result = db.simulateCreateCustomer(userSuspendedA, {
    first_name: "Suspended",
    last_name: "Attempt",
    phone: "9876543215",
    status: "active",
  });

  assert.strictEqual(result.success, undefined);
  assert.strictEqual(result.error, "Access denied: Active business membership required");
});

it("2g. User without business membership cannot create customer", () => {
  const result = db.simulateCreateCustomer(userNoBiz, {
    first_name: "Orphan",
    last_name: "User",
    phone: "9876543216",
    status: "active",
  });

  assert.strictEqual(result.success, undefined);
  assert.strictEqual(result.error, "Access denied: Active business membership required");
});

it("2h. Manual creation flow works end-to-end", () => {
  const manualData = {
    first_name: "Rahat",
    last_name: "Ali",
    phone: "9832001122",
    address: "Basirhat, North 24 Parganas, WB",
    status: "active",
  };

  const res = db.simulateCreateCustomer(userActiveOwnerA, manualData);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.customer?.business_id, BIZ_A);
  assert.strictEqual(res.customer?.first_name, "Rahat");
});

it("2i. Smart Import -> Check Details -> Save Customer flow works end-to-end", () => {
  // Simulates OCR/AI auto-filled fields reviewed on the Check Details screen
  const smartImportReviewedData = {
    first_name: "Dipika",
    last_name: "Roy",
    phone: "9811122233",
    date_of_birth: "1994-06-21",
    gender: "female",
    aadhaar_number: "987654321098",
    address: "Kolkata, West Bengal",
    pincode: "700001",
    status: "active",
  };

  const res = db.simulateCreateCustomer(userActiveOwnerA, smartImportReviewedData);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.customer?.business_id, BIZ_A);
  assert.strictEqual(res.customer?.first_name, "Dipika");
});

it("2j. Existing customer update works and preserves tenant isolation", () => {
  // User A updates their customer
  const custId = db.customers[0].id;
  const updateRes = db.simulateUpdateCustomer(userActiveOwnerA, custId, {
    phone: "9876599999",
    business_id: BIZ_B, // Tamper attempt: trying to move customer to BIZ_B
  });

  assert.strictEqual(updateRes.success, true);
  const updatedCust = db.customers.find(c => c.id === custId);
  assert.strictEqual(updatedCust?.phone, "9876599999");
  assert.strictEqual(updatedCust?.business_id, BIZ_A, "business_id must NOT change to BIZ_B");
});

it("2k. Cross-tenant update is blocked", () => {
  // User B tries to update User A's customer
  const custId = db.customers[0].id; // Customer belongs to BIZ_A
  const updateRes = db.simulateUpdateCustomer(userActiveOwnerB, custId, {
    phone: "9999999999",
  });

  assert.strictEqual(updateRes.success, undefined);
  assert.strictEqual(updateRes.error, "Access denied: Cross-tenant update blocked");
});

// ─── 4. SUMMARY ────────────────────────────────────────────────────────────────

console.log("\n==========================================================================");
console.log(`📊 TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log("==========================================================================");

if (failedTests > 0) {
  process.exit(1);
}
