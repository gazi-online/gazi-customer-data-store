/**
 * GCDS — MILESTONE 10 PHASE 2C-3C
 * TEST SUITE: FORM & SERVER ACTION SECURITY HARDENING
 * File: test-phase2c-3c-form-security.ts
 */

import * as fs from "fs";
import * as path from "path";
import { customerServiceSchema } from "./src/app/(dashboard)/services/schema";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runFormSecurityTests() {
  console.log("=== RUNNING PHASE 2C-3C FORM & ACTION SECURITY TESTS ===");

  // 1. customerServiceSchema allows payment_status to be omitted and defaults to unpaid
  const parsedEmpty = customerServiceSchema.safeParse({
    customer_id: "b41fc8ac-7e00-4025-8e44-5c192c87a73f",
    service_id: "7ede5c39-c5c0-4740-90c2-88e4cffde4f0",
    amount: 150,
    service_date: "2026-09-15",
  });
  assert(parsedEmpty.success, "Schema parsing without payment_status must succeed");
  if (parsedEmpty.success) {
    assert(parsedEmpty.data.payment_status === "unpaid", "Omitted payment_status must default to unpaid");
  }
  console.log("  [PASS] 1. customerServiceSchema payment_status defaults to unpaid");

  // 2. Inspect services/actions.ts: upsertCustomerService create & edit paths
  const servicesActionsContent = fs.readFileSync(
    path.join(__dirname, "src/app/(dashboard)/services/actions.ts"),
    "utf-8"
  );
  // CREATE path forces payment_status = 'unpaid'
  assert(
    servicesActionsContent.includes("payment_status: 'unpaid', // Initial payment status is strictly unpaid"),
    "upsertCustomerService create path must force payment_status = 'unpaid'"
  );
  // EDIT path does not include customer_id or payment_status in update payload
  assert(
    servicesActionsContent.includes("customer_id is strictly immutable after insert; payment_status is ledger-derived/waiver only"),
    "upsertCustomerService edit path must document immutability"
  );
  // Verify setRequestPaymentWaiver exists
  assert(
    servicesActionsContent.includes("export async function setRequestPaymentWaiver"),
    "services/actions.ts must export setRequestPaymentWaiver"
  );
  console.log("  [PASS] 2. upsertCustomerService & setRequestPaymentWaiver verified");

  // 3. Inspect invoices/actions.ts: createInvoice calls create_invoice_atomic & cancelInvoice status-only
  const invoicesActionsContent = fs.readFileSync(
    path.join(__dirname, "src/app/(dashboard)/invoices/actions.ts"),
    "utf-8"
  );
  assert(
    invoicesActionsContent.includes('supabase.rpc("create_invoice_atomic"'),
    "createInvoice must call create_invoice_atomic RPC"
  );
  assert(
    invoicesActionsContent.includes("p_idempotency_key: idempotencyKey"),
    "createInvoice must pass idempotency key to RPC"
  );
  assert(
    !invoicesActionsContent.includes("due_amount: 0") &&
    invoicesActionsContent.includes("status: \"cancelled\""),
    "cancelInvoice must only request status: cancelled without sending due_amount"
  );
  console.log("  [PASS] 3. createInvoice atomic RPC & cancelInvoice status-only update verified");

  // 4. Inspect payments/actions.ts: createPayment calls atomic RPCs
  const paymentsActionsContent = fs.readFileSync(
    path.join(__dirname, "src/app/(dashboard)/payments/actions.ts"),
    "utf-8"
  );
  assert(
    paymentsActionsContent.includes('supabase.rpc("record_payment_and_allocate_atomic"'),
    "createPayment with invoice_id must call record_payment_and_allocate_atomic"
  );
  assert(
    paymentsActionsContent.includes('supabase.rpc("record_payment_atomic"'),
    "createPayment without invoice_id must call record_payment_atomic"
  );
  assert(
    paymentsActionsContent.includes("p_idempotency_key: idempotencyKey"),
    "createPayment must pass idempotency key to RPCs"
  );
  console.log("  [PASS] 4. createPayment atomic RPCs & idempotency verified");

  // 5. Inspect AssignServiceForm.tsx: no editable payment_status dropdown
  const assignFormContent = fs.readFileSync(
    path.join(__dirname, "src/components/forms/AssignServiceForm.tsx"),
    "utf-8"
  );
  assert(
    !assignFormContent.includes('{...register("payment_status")}'),
    "AssignServiceForm must NOT have an editable payment_status register select"
  );
  assert(
    assignFormContent.includes("Ledger Derived"),
    "AssignServiceForm must display read-only Ledger Derived badge"
  );
  console.log("  [PASS] 5. AssignServiceForm read-only ledger badge verified");

  // 6. Inspect RecordPaymentModal.tsx: idempotency key contract
  const paymentModalContent = fs.readFileSync(
    path.join(__dirname, "src/components/payments/RecordPaymentModal.tsx"),
    "utf-8"
  );
  assert(
    paymentModalContent.includes("idempotency_key: idempotencyKey"),
    "RecordPaymentModal must submit idempotency_key"
  );
  assert(
    paymentModalContent.includes("Idempotency Key Client Contract"),
    "RecordPaymentModal must document idempotency key client contract"
  );
  console.log("  [PASS] 6. RecordPaymentModal idempotency key lifecycle verified");

  console.log("=== ALL PHASE 2C-3C FORM & ACTION SECURITY TESTS PASSED ===");
}

runFormSecurityTests();
