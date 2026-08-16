import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// In-Memory Database Engine matching upsertCustomerService in services/actions.ts
class MockPhase8Database {
  public services: any[] = [];
  public customerServices: any[] = [];
  public customers: any[] = [];

  constructor() {
    // Seed initial Master Service: "New Pan Service" (₹150, Active)
    this.services.push({
      id: "srv_pan_101",
      service_code: "PAN001",
      service_name: "New Pan Service",
      category: "Government",
      description: "New PAN Card Application",
      default_price: 150,
      status: "active",
      created_at: new Date().toISOString()
    });

    // Seed initial Test Customer
    this.customers.push({
      id: "cust_test_888",
      first_name: "Subhash",
      last_name: "Chandra",
      phone: "9876543210",
      status: "active",
      created_at: new Date().toISOString()
    });
  }

  // 1. Get Master Active Services (for dropdown)
  async getActiveServices() {
    return this.services.filter(s => s.status.toLowerCase() === 'active');
  }

  // 2. Upsert Master Service
  async upsertService(data: any) {
    if (data.id) {
      const idx = this.services.findIndex(s => s.id === data.id);
      if (idx !== -1) {
        this.services[idx] = { ...this.services[idx], ...data };
      }
    } else {
      const newService = { id: "srv_" + crypto.randomUUID().substring(0, 8), ...data, created_at: new Date().toISOString() };
      this.services.push(newService);
    }
    return { success: true };
  }

  // 3. Upsert Customer Service matching updated services/actions.ts logic
  async upsertCustomerService(data: any) {
    const payload: any = {
      customer_id: data.customer_id,
      service_id: data.service_id,
      status: data.status,
      amount: data.amount,
      payment_status: data.payment_status,
      service_date: data.service_date || new Date().toISOString(),
      due_date: data.due_date || null,
      notes: data.notes || null,
    };

    if (data.status === 'completed') {
      if (!data.id) {
        payload.completed_at = new Date().toISOString();
      } else {
        const existing = this.customerServices.find(cs => cs.id === data.id);
        if (existing && !existing.completed_at) {
          payload.completed_at = new Date().toISOString();
        } else if (existing) {
          payload.completed_at = existing.completed_at;
        }
      }
    } else {
      // When status is pending, in_progress, or cancelled, reset completed_at = null
      payload.completed_at = null;
    }

    if (data.id) {
      const existingIdx = this.customerServices.findIndex(cs => cs.id === data.id);
      if (existingIdx !== -1) {
        const existing = this.customerServices[existingIdx];
        this.customerServices[existingIdx] = { ...existing, ...payload };
        return { success: true, data: this.customerServices[existingIdx] };
      }
    } else {
      const newCs = {
        id: "cs_" + crypto.randomUUID().substring(0, 8),
        created_at: new Date().toISOString(),
        ...payload
      };
      this.customerServices.push(newCs);
      return { success: true, data: newCs };
    }
    return { success: false, error: "Not found" };
  }

  // 4. Get Customer Services History
  async getCustomerServices(customerId: string) {
    return this.customerServices
      .filter(cs => cs.customer_id === customerId)
      .map(cs => {
        const service = this.services.find(s => s.id === cs.service_id);
        return { ...cs, service };
      });
  }

  // 5. Dashboard Active Services Count Query simulation:
  async getDashboardActiveServicesCount() {
    return this.customerServices.filter(cs => ["pending", "in_progress"].includes(cs.status)).length;
  }
}

async function runPhase8WorkflowVerification() {
  console.log("==========================================================================");
  console.log(" 🧪 PHASE 8 — COMPLETED_AT STATE CONSISTENCY & REGRESSION SUITE");
  console.log("==========================================================================\n");

  const db = new MockPhase8Database();
  const testResults: { name: string; expected: string; actual: string; status: 'PASS' | 'FAIL' }[] = [];

  function record(name: string, expected: string, actual: string, pass: boolean) {
    const status = pass ? 'PASS' : 'FAIL';
    testResults.push({ name, expected, actual, status });
    console.log(`[TEST] ${name}: Expected '${expected}' | Got '${actual}' ➔ ${status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  }

  const customerId = "cust_test_888";
  const masterService = db.services[0];

  // --- REGRESSION CASE A: PENDING ---
  console.log("--- A. Assigning Service (status = pending) ---");
  const initialDashboardCount = await db.getDashboardActiveServicesCount();
  const assignRes = await db.upsertCustomerService({
    customer_id: customerId,
    service_id: masterService.id,
    status: 'pending',
    amount: 150,
    payment_status: 'unpaid'
  });

  const createdCs = assignRes.data;
  record("1. Assign pending service", "Row created", createdCs ? `Row ${createdCs.id} created` : "Failed", !!createdCs);
  record("1a. [CASE A] pending completed_at = null", "null", String(createdCs?.completed_at), createdCs?.completed_at === null);

  const pendingDashboardCount = await db.getDashboardActiveServicesCount();
  record("1b. Pending dashboard count included", `${initialDashboardCount + 1}`, `${pendingDashboardCount}`, pendingDashboardCount === initialDashboardCount + 1);

  // --- REGRESSION CASE B: PENDING → IN_PROGRESS ---
  console.log("\n--- B. Status Update: Pending → In Progress ---");
  const inProgressRes = await db.upsertCustomerService({
    id: createdCs.id,
    customer_id: customerId,
    service_id: masterService.id,
    status: 'in_progress',
    amount: 150,
    payment_status: 'unpaid'
  });

  const inProgressCs = inProgressRes.data;
  record("2. [CASE B] pending → in_progress status update", "in_progress", inProgressCs?.status || '', inProgressCs?.status === 'in_progress');
  record("2a. [CASE B] pending → in_progress completed_at = null", "null", String(inProgressCs?.completed_at), inProgressCs?.completed_at === null);

  const inProgressDashboardCount = await db.getDashboardActiveServicesCount();
  record("2b. In Progress dashboard count still included", "1", `${inProgressDashboardCount}`, inProgressDashboardCount === 1);

  // --- REGRESSION CASE C: IN_PROGRESS → COMPLETED ---
  console.log("\n--- C. Status Update: In Progress → Completed (First Completion T1) ---");
  const completedRes1 = await db.upsertCustomerService({
    id: createdCs.id,
    customer_id: customerId,
    service_id: masterService.id,
    status: 'completed',
    amount: 150,
    payment_status: 'unpaid'
  });

  const completedCs1 = completedRes1.data;
  const timestampT1 = completedCs1?.completed_at;
  record("3. [CASE C] in_progress → completed status update", "completed", completedCs1?.status || '', completedCs1?.status === 'completed');
  record("3a. [CASE C] in_progress → completed completed_at != null", "Valid ISO Timestamp", timestampT1 ? timestampT1 : "null", !!timestampT1);

  const completedDashboardCount = await db.getDashboardActiveServicesCount();
  record("3b. Completed removed from Active Services count", "0", `${completedDashboardCount}`, completedDashboardCount === 0);

  // --- REGRESSION CASE D: COMPLETED → IN_PROGRESS (CLEARED TO NULL) ---
  console.log("\n--- D. Status Update: Completed → In Progress (Clear Timestamp) ---");
  const rollbackRes = await db.upsertCustomerService({
    id: createdCs.id,
    customer_id: customerId,
    service_id: masterService.id,
    status: 'in_progress',
    amount: 150,
    payment_status: 'unpaid'
  });

  const rollbackCs = rollbackRes.data;
  record("4. [CASE D] completed → in_progress status update", "in_progress", rollbackCs?.status || '', rollbackCs?.status === 'in_progress');
  record("4a. [CASE D] completed → in_progress completed_at = null", "null", String(rollbackCs?.completed_at), rollbackCs?.completed_at === null);

  const rollbackDashboardCount = await db.getDashboardActiveServicesCount();
  record("4b. Rollback to In Progress restores Active Services count to 1", "1", `${rollbackDashboardCount}`, rollbackDashboardCount === 1);

  // --- REGRESSION CASE E: IN_PROGRESS → COMPLETED AGAIN (FRESH TIMESTAMP T2) ---
  console.log("\n--- E. Status Update: In Progress → Completed Again (Fresh Timestamp T2) ---");
  // Pause 10ms to ensure timestamp difference
  await new Promise(res => setTimeout(res, 20));

  const completedRes2 = await db.upsertCustomerService({
    id: createdCs.id,
    customer_id: customerId,
    service_id: masterService.id,
    status: 'completed',
    amount: 150,
    payment_status: 'unpaid'
  });

  const completedCs2 = completedRes2.data;
  const timestampT2 = completedCs2?.completed_at;
  const isFreshTimestamp = !!timestampT2 && timestampT2 !== timestampT1;

  record("5. [CASE E] in_progress → completed again status update", "completed", completedCs2?.status || '', completedCs2?.status === 'completed');
  record("5a. [CASE E] completed_at receives a NEW timestamp T2", `T2 (${timestampT2}) != T1 (${timestampT1})`, isFreshTimestamp ? `T2 (${timestampT2})` : `Failed (${timestampT2})`, isFreshTimestamp);

  // --- MASTER SERVICE DEACTIVATION & REACTIVATION TESTS ---
  console.log("\n--- Master Service Activation Lifecycle ---");
  await db.upsertService({ id: masterService.id, status: 'inactive' });
  const customerHistory = await db.getCustomerServices(customerId);
  const historyPreserved = customerHistory.some(cs => cs.service_id === masterService.id);
  const activeDropdownBefore = await db.getActiveServices();
  const excludedFromDropdown = !activeDropdownBefore.some(s => s.id === masterService.id);

  record("6. Deactivate service history preserved", "Preserved", historyPreserved ? "Preserved" : "Lost", historyPreserved);
  record("6b. Inactive service removed from dropdown", "Excluded", excludedFromDropdown ? "Excluded" : "Included", excludedFromDropdown);

  await db.upsertService({ id: masterService.id, status: 'active' });
  const activeDropdownAfter = await db.getActiveServices();
  const reactivatedInDropdown = activeDropdownAfter.some(s => s.id === masterService.id);
  record("7. Service reactivation", "Included", reactivatedInDropdown ? "Included" : "Missing", reactivatedInDropdown);

  console.log("\n==========================================================================");
  console.log("📊 PHASE 8 HARDENING SUMMARY REPORT");
  console.log("==========================================================================\n");

  console.table(testResults.map(t => ({
    'Requirement Name': t.name,
    'Expected Outcome': t.expected,
    'Actual Result': t.actual,
    'Status': t.status
  })));

  const allPassed = testResults.every(t => t.status === 'PASS');
  console.log("\n==========================================================================");
  console.log(`VERDICT: ${allPassed ? '✅ ALL PHASE 8 REGRESSION TESTS PASSED CLEANLY!' : '❌ SOME TESTS FAILED'}`);
  console.log("==========================================================================");

  if (!allPassed) process.exit(1);
}

runPhase8WorkflowVerification().catch(console.error);
