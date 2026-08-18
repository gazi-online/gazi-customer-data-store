import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load .env.local manually
const envConfig = fs.readFileSync('.env.local', 'utf-8');
envConfig.split('\n').forEach(line => {
  const [key, val] = line.split('=');
  if (key && val) {
    process.env[key.trim()] = val.trim();
  }
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY);

interface TestResult {
  code: string;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
}

const testResults: TestResult[] = [];

function record(code: string, name: string, expected: string, actual: string, pass: boolean) {
  const status = pass ? 'PASS' : 'FAIL';
  testResults.push({ code, name, expected, actual, status });
  console.log(`[TEST ${code}] ${name}: Expected '${expected}' | Got '${actual}' ➔ ${status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
}

async function getOrCreateTestUser(email: string, pass: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY);
  let authRes = await client.auth.signInWithPassword({ email, password: pass });
  if (authRes.error) {
    const signUpRes = await client.auth.signUp({ email, password: pass });
    if (signUpRes.error) {
      throw new Error(`Failed to create test user ${email}: ${signUpRes.error.message}`);
    }
    authRes = await client.auth.signInWithPassword({ email, password: pass });
    if (authRes.error) {
      throw new Error(`Failed to sign in test user ${email}: ${authRes.error.message}`);
    }
  }
  return client;
}

async function runLiveSupabaseTests() {
  console.log("==========================================================================");
  console.log(" 🌐 PHASE 9 — LIVE SUPABASE DATABASE INTEGRITY VERIFICATION TEST SUITE");
  console.log("==========================================================================\n");

  // 0. Initialize Authenticated Clients for User A & User B
  console.log("🔑 Authenticating Test User A & Test User B against Supabase Auth...");
  const clientA = await getOrCreateTestUser("phase9.usera.live@gmail.com", "TestPassword123!");
  const clientB = await getOrCreateTestUser("phase9.userb.live@gmail.com", "TestPassword123!");

  const { data: userAData } = await clientA.auth.getUser();
  const { data: userBData } = await clientB.auth.getUser();
  const userAId = userAData.user!.id;
  const userBId = userBData.user!.id;

  console.log(`User A ID: ${userAId}`);
  console.log(`User B ID: ${userBId}\n`);

  // Ensure Customer A & Customer B exist
  const custACode = "CUST-LIVE-P9-A-" + Math.floor(Math.random() * 10000);
  const custBCode = "CUST-LIVE-P9-B-" + Math.floor(Math.random() * 10000);

  const { data: custA, error: custAErr } = await clientA.from('customers').insert({
    customer_code: custACode,
    first_name: "Alice",
    last_name: "Phase9Live",
    phone: "9" + Math.floor(100000000 + Math.random() * 900000000),
    created_by: userAId
  }).select().single();

  const { data: custB, error: custBErr } = await clientB.from('customers').insert({
    customer_code: custBCode,
    first_name: "Bob",
    last_name: "Phase9Live",
    phone: "9" + Math.floor(100000000 + Math.random() * 900000000),
    created_by: userBId
  }).select().single();

  if (custAErr || custBErr || !custA || !custB) {
    throw new Error(`Failed to create test customers: CustA=${custAErr?.message}, CustB=${custBErr?.message}`);
  }

  // Create Service Master Record
  const serviceCode = "SRV-P9-" + Math.floor(Math.random() * 10000);
  const { data: serviceMaster } = await clientA.from('services').insert({
    service_code: serviceCode,
    service_name: "Live PAN Card Service",
    default_price: 150,
    status: "active"
  }).select().single();

  // --- 1. SCHEMA OBJECTS CHECK ---
  console.log("--- 1. Testing Schema Objects ---");
  const checkInvoices = await clientA.from('invoices').select('id').limit(1);
  const checkItems = await clientA.from('invoice_items').select('id').limit(1);
  const checkPayments = await clientA.from('payments').select('id').limit(1);
  const checkAllocations = await clientA.from('payment_allocations').select('id').limit(1);

  const schemaOk = !checkInvoices.error && !checkItems.error && !checkPayments.error && !checkAllocations.error;
  record("1", "Schema objects exist on Supabase", "All tables selectable",
    schemaOk ? "invoices, items, payments, allocations exist" : `Error: ${checkInvoices.error?.message}`, schemaOk);

  // --- 2. AUTO NUMBERING CONCURRENCY CHECK ---
  console.log("\n--- 2. Testing Auto Numbering Concurrency ---");
  const [invConcRes1, invConcRes2] = await Promise.all([
    clientA.from('invoices').insert({ customer_id: custA.id, subtotal: 100, total_amount: 100, due_amount: 100, created_by: userAId }).select().single(),
    clientA.from('invoices').insert({ customer_id: custA.id, subtotal: 100, total_amount: 100, due_amount: 100, created_by: userAId }).select().single()
  ]);

  const invNum1 = invConcRes1.data?.invoice_number;
  const invNum2 = invConcRes2.data?.invoice_number;
  const invNumOk = !!invNum1 && !!invNum2 && invNum1 !== invNum2 && invNum1.startsWith('INV-');

  record("2a", "Invoice Numbering Concurrency", "Unique auto-generated INV numbers",
    `${invNum1} vs ${invNum2}`, invNumOk);

  const [payConcRes1, payConcRes2] = await Promise.all([
    clientA.from('payments').insert({ customer_id: custA.id, amount: 50, payment_method: 'cash', created_by: userAId }).select().single(),
    clientA.from('payments').insert({ customer_id: custA.id, amount: 50, payment_method: 'cash', created_by: userAId }).select().single()
  ]);

  const payNum1 = payConcRes1.data?.payment_number;
  const payNum2 = payConcRes2.data?.payment_number;
  const payNumOk = !!payNum1 && !!payNum2 && payNum1 !== payNum2 && payNum1.startsWith('PAY-');

  record("2b", "Payment Numbering Concurrency", "Unique auto-generated PAY numbers",
    `${payNum1} vs ${payNum2}`, payNumOk);

  // --- 3. RLS VERIFICATION ---
  console.log("\n--- 3. Testing Row Level Security (RLS) ---");
  const anonRead = await anonClient.from('invoices').select('*');
  const anonOk = !anonRead.error && (anonRead.data === null || anonRead.data.length === 0);
  record("3a", "Anonymous RLS Denied", "0 rows accessible to anon", `Rows returned: ${anonRead.data?.length || 0}`, anonOk);

  const crossUserReadInv = await clientB.from('invoices').select('*').eq('id', invConcRes1.data?.id || '');
  const crossUserInvOk = !crossUserReadInv.error && (crossUserReadInv.data?.length === 0 || crossUserReadInv.data === null);
  record("3b", "User B cannot SELECT User A Invoice", "0 rows returned", `Rows returned: ${crossUserReadInv.data?.length || 0}`, crossUserInvOk);

  const crossUserReadPay = await clientB.from('payments').select('*').eq('id', payConcRes1.data?.id || '');
  const crossUserPayOk = !crossUserReadPay.error && (crossUserReadPay.data?.length === 0 || crossUserReadPay.data === null);
  record("3c", "User B cannot SELECT User A Payment", "0 rows returned", `Rows returned: ${crossUserReadPay.data?.length || 0}`, crossUserPayOk);

  const crossUserMutate = await clientB.from('invoices').update({ notes: 'Hacked Notes' }).eq('id', invConcRes1.data?.id || '').select();
  const crossUserMutateOk = !crossUserMutate.error && (crossUserMutate.data?.length === 0 || crossUserMutate.data === null);
  record("3d", "User B cannot mutate User A Invoice", "0 rows updated", `Rows updated: ${crossUserMutate.data?.length || 0}`, crossUserMutateOk);

  const allocReadUserB = await clientB.from('payment_allocations').select('*');
  const allocReadOk = !allocReadUserB.error && (allocReadUserB.data?.length === 0 || allocReadUserB.data === null);
  record("3e", "payment_allocations SELECT requires ownership of BOTH records", "0 rows returned to User B", `Rows returned: ${allocReadUserB.data?.length || 0}`, allocReadOk);

  // --- 4. DIRECT DERIVED FINANCIAL FIELD TAMPERING ---
  console.log("\n--- 4. Testing Direct Financial Field Tampering Protection ---");
  const directPaidTamper = await clientA.from('invoices').update({ paid_amount: 999 }).eq('id', invConcRes1.data.id);
  record("4a", "Direct paid_amount modification BLOCKED", "PostgreSQL exception raised",
    directPaidTamper.error?.message || "Allowed (FAIL)", !!directPaidTamper.error?.message.includes("blocked"));

  const directDueTamper = await clientA.from('invoices').update({ due_amount: 0 }).eq('id', invConcRes1.data.id);
  record("4b", "Direct due_amount modification BLOCKED", "PostgreSQL exception raised",
    directDueTamper.error?.message || "Allowed (FAIL)", !!directDueTamper.error?.message.includes("blocked"));

  const directStatusToPaidTamper = await clientA.from('invoices').update({ status: 'paid' }).eq('id', invConcRes1.data.id);
  record("4c", "Direct transition TO payment-derived status (paid) BLOCKED", "PostgreSQL exception raised",
    directStatusToPaidTamper.error?.message || "Allowed (FAIL)", !!directStatusToPaidTamper.error?.message.includes("blocked"));

  // --- 5. INVOICE CREATION CHECK (₹150) ---
  console.log("\n--- 5. Testing ₹150 Invoice Creation ---");
  const { data: inv150, error: inv150Err } = await clientA.from('invoices').insert({
    customer_id: custA.id,
    subtotal: 150,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: 150,
    paid_amount: 0,
    due_amount: 150,
    status: 'issued',
    created_by: userAId
  }).select().single();

  if (inv150Err || !inv150) throw new Error(`Failed to insert invoice: ${inv150Err?.message}`);

  const { error: item150Err } = await clientA.from('invoice_items').insert({
    invoice_id: inv150.id,
    service_id: serviceMaster?.id || null,
    description: serviceMaster?.service_name || "Live PAN Service",
    quantity: 1,
    unit_price: 150,
    discount_amount: 0,
    tax_amount: 0,
    line_total: 150
  });

  if (item150Err) throw new Error(`Failed to insert invoice item: ${item150Err?.message}`);

  record("5", "₹150 Invoice Creation Baseline", "subtotal=150, total=150, paid=0, due=150, status=issued",
    `total=${inv150.total_amount}, paid=${inv150.paid_amount}, due=${inv150.due_amount}, status=${inv150.status}`,
    inv150.total_amount === 150 && inv150.paid_amount === 0 && inv150.due_amount === 150 && inv150.status === 'issued');

  // --- 6. PARTIAL PAYMENT (₹50) ---
  console.log("\n--- 6. Testing Partial Payment (₹50) ---");
  const { data: pay50 } = await clientA.from('payments').insert({
    customer_id: custA.id,
    amount: 50,
    payment_method: 'upi',
    created_by: userAId
  }).select().single();

  const alloc50Rpc = await clientA.rpc('allocate_payment_atomic', {
    p_payment_id: pay50.id,
    p_invoice_id: inv150.id,
    p_amount: 50
  });

  const { data: invAfter50 } = await clientA.from('invoices').select('*').eq('id', inv150.id).single();

  record("6", "₹50 Partial Payment Allocation", "paid=50, due=100, status=partially_paid",
    `paid=${invAfter50.paid_amount}, due=${invAfter50.due_amount}, status=${invAfter50.status}`,
    alloc50Rpc.data?.success === true && invAfter50.paid_amount === 50 && invAfter50.due_amount === 100 && invAfter50.status === 'partially_paid');

  // Test Direct Status Tampering paid/partially_paid -> issued BLOCKED
  const directPaidToIssuedTamper = await clientA.from('invoices').update({ status: 'issued' }).eq('id', inv150.id);
  record("4d", "Direct status transition FROM partially_paid to issued BLOCKED", "PostgreSQL exception raised",
    directPaidToIssuedTamper.error?.message || "Allowed (FAIL)", !!directPaidToIssuedTamper.error?.message.includes("blocked"));

  // --- 7. FULL PAYMENT (₹100) ---
  console.log("\n--- 7. Testing Final Payment (₹100) ---");
  const { data: pay100 } = await clientA.from('payments').insert({
    customer_id: custA.id,
    amount: 100,
    payment_method: 'bank_transfer',
    created_by: userAId
  }).select().single();

  const alloc100Rpc = await clientA.rpc('allocate_payment_atomic', {
    p_payment_id: pay100.id,
    p_invoice_id: inv150.id,
    p_amount: 100
  });

  const { data: invAfter100 } = await clientA.from('invoices').select('*').eq('id', inv150.id).single();

  record("7", "₹100 Final Payment Allocation", "paid=150, due=0, status=paid",
    `paid=${invAfter100.paid_amount}, due=${invAfter100.due_amount}, status=${invAfter100.status}`,
    alloc100Rpc.data?.success === true && invAfter100.paid_amount === 150 && invAfter100.due_amount === 0 && invAfter100.status === 'paid');

  // --- 8. OVERPAYMENT BLOCKED ---
  console.log("\n--- 8. Testing Overpayment Protection ---");
  const { data: payExtra } = await clientA.from('payments').insert({
    customer_id: custA.id,
    amount: 50,
    payment_method: 'cash',
    created_by: userAId
  }).select().single();

  const overpayRpc = await clientA.rpc('allocate_payment_atomic', {
    p_payment_id: payExtra.id,
    p_invoice_id: inv150.id,
    p_amount: 50
  });

  record("8", "Invoice Overpay Blocked at DB/RPC Level", "Rejected with due error",
    overpayRpc.data?.error || "Allowed (FAIL)",
    overpayRpc.data?.success === false && !!overpayRpc.data?.error?.includes("exceeds remaining invoice due"));

  // --- 9. PAYMENT OVERUSE BLOCKED ---
  console.log("\n--- 9. Testing Payment Overuse Protection ---");
  const { data: inv2 } = await clientA.from('invoices').insert({
    customer_id: custA.id,
    subtotal: 100,
    total_amount: 100,
    due_amount: 100,
    status: 'issued',
    created_by: userAId
  }).select().single();

  const overuseRpc = await clientA.rpc('allocate_payment_atomic', {
    p_payment_id: pay100.id, // pay100 has 0 remaining balance
    p_invoice_id: inv2.id,
    p_amount: 50
  });

  record("9", "Payment Overuse Blocked at DB/RPC Level", "Rejected with payment balance error",
    overuseRpc.data?.error || "Allowed (FAIL)",
    overuseRpc.data?.success === false && !!overuseRpc.data?.error?.includes("exceeds remaining payment balance"));

  // --- 10. CONCURRENT ALLOCATIONS PROTECTION ---
  console.log("\n--- 10. Testing Concurrent Allocations Protection ---");
  const { data: invConc } = await clientA.from('invoices').insert({
    customer_id: custA.id,
    subtotal: 100,
    total_amount: 100,
    due_amount: 100,
    status: 'issued',
    created_by: userAId
  }).select().single();

  const { data: payC1 } = await clientA.from('payments').insert({ customer_id: custA.id, amount: 100, payment_method: 'cash', created_by: userAId }).select().single();
  const { data: payC2 } = await clientA.from('payments').insert({ customer_id: custA.id, amount: 100, payment_method: 'cash', created_by: userAId }).select().single();

  const [concAllocRes1, concAllocRes2] = await Promise.all([
    clientA.rpc('allocate_payment_atomic', { p_payment_id: payC1.id, p_invoice_id: invConc.id, p_amount: 100 }),
    clientA.rpc('allocate_payment_atomic', { p_payment_id: payC2.id, p_invoice_id: invConc.id, p_amount: 100 })
  ]);

  const { data: invConcFinal } = await clientA.from('invoices').select('*').eq('id', invConc.id).single();

  const concOverpayOk = (concAllocRes1.data?.success !== concAllocRes2.data?.success) && invConcFinal.paid_amount === 100;
  record("10a", "Concurrent Invoice Overpay Protection", "Exactly 1 succeeds, paid_amount=100",
    `Alloc 1: ${concAllocRes1.data?.success}, Alloc 2: ${concAllocRes2.data?.success}, Final Paid: ${invConcFinal.paid_amount}`, concOverpayOk);

  // --- 11. CROSS-CUSTOMER ALLOCATION BLOCKED ---
  console.log("\n--- 11. Testing Cross-Customer Payment Allocation Protection ---");
  const crossCustRpc = await clientA.rpc('allocate_payment_atomic', {
    p_payment_id: payC2.id, // Customer A payment
    p_invoice_id: custB.id, // Customer B invoice (or customer B invoice id)
    p_amount: 50
  });

  record("11", "Cross-customer allocation blocked at DB level", "Blocked by DB rules",
    crossCustRpc.data?.error || "Allowed (FAIL)",
    crossCustRpc.data?.success === false && !!crossCustRpc.data?.error?.includes("Cross-customer"));

  // --- 12. VOID PAYMENT RECALCULATION ---
  console.log("\n--- 12. Testing Void Payment Recalculation ---");
  const voidRpc = await clientA.rpc('void_payment_atomic', { p_payment_id: payC1.id });
  const { data: invAfterVoid } = await clientA.from('invoices').select('*').eq('id', invConc.id).single();

  record("12", "Void payment recalculates invoice due balance", "due=100, status=issued",
    `due=${invAfterVoid.due_amount}, status=${invAfterVoid.status}`,
    voidRpc.data?.success === true && invAfterVoid.due_amount === 100 && invAfterVoid.status === 'issued');

  // --- 13. REFUND PAYMENT RECALCULATION ---
  console.log("\n--- 13. Testing Refund Payment Recalculation ---");
  const { data: payRefund } = await clientA.from('payments').insert({ customer_id: custA.id, amount: 100, payment_method: 'upi', created_by: userAId }).select().single();
  await clientA.rpc('allocate_payment_atomic', { p_payment_id: payRefund.id, p_invoice_id: invConc.id, p_amount: 100 });

  const refundRpc = await clientA.rpc('refund_payment_atomic', { p_payment_id: payRefund.id });
  const { data: invAfterRefund } = await clientA.from('invoices').select('*').eq('id', invConc.id).single();

  record("13", "Refund payment recalculates invoice due balance", "due=100, status=issued",
    `due=${invAfterRefund.due_amount}, status=${invAfterRefund.status}`,
    refundRpc.data?.success === true && invAfterRefund.due_amount === 100 && invAfterRefund.status === 'issued');

  // --- 14. CANCELLED INVOICE PRESERVATION ---
  console.log("\n--- 14. Testing Cancelled Invoice Preservation ---");
  const { data: invCancel } = await clientA.from('invoices').insert({
    customer_id: custA.id, subtotal: 100, total_amount: 100, due_amount: 100, status: 'issued', created_by: userAId
  }).select().single();

  const cancelRes = await clientA.from('invoices').update({ status: 'cancelled' }).eq('id', invCancel.id).select().single();
  
  // Re-trigger recalculation
  await clientA.rpc('allocate_payment_atomic', { p_payment_id: payExtra.id, p_invoice_id: invCancel.id, p_amount: 10 });
  const { data: invCancelAfterRecalc } = await clientA.from('invoices').select('*').eq('id', invCancel.id).single();

  record("14", "Cancelled invoice preserved on recalculation", "status=cancelled, due=0, cancelled_at set",
    `status=${invCancelAfterRecalc.status}, due=${invCancelAfterRecalc.due_amount}, cancelled_at=${!!invCancelAfterRecalc.cancelled_at}`,
    invCancelAfterRecalc.status === 'cancelled' && invCancelAfterRecalc.due_amount === 0 && !!invCancelAfterRecalc.cancelled_at);

  // --- 15. ALLOCATION PRIVILEGES ---
  console.log("\n--- 15. Testing Allocation Direct Write Revocation ---");
  const directAllocWrite = await clientA.from('payment_allocations').insert({
    payment_id: payExtra.id,
    invoice_id: inv2.id,
    amount: 10
  });

  record("15a", "Direct INSERT on payment_allocations DENIED", "Permission denied error",
    directAllocWrite.error?.message || "Allowed (FAIL)", !!directAllocWrite.error?.message.includes("permission denied"));

  const allocRpcWorks = await clientA.rpc('allocate_payment_atomic', {
    p_payment_id: payExtra.id,
    p_invoice_id: inv2.id,
    p_amount: 10
  });

  record("15b", "Allocation via allocate_payment_atomic RPC SUCCEEDS", "Success=true",
    `success=${allocRpcWorks.data?.success}`, allocRpcWorks.data?.success === true);

  // --- 16. SECURITY DEFINER PRIVILEGES ---
  console.log("\n--- 16. Testing SECURITY DEFINER Execution Privileges ---");
  const anonRpcCall = await anonClient.rpc('allocate_payment_atomic', { p_payment_id: payExtra.id, p_invoice_id: inv2.id, p_amount: 10 });
  record("16a", "Anon execution of public RPC DENIED", "Permission denied",
    anonRpcCall.error?.message || "Allowed (FAIL)", !!anonRpcCall.error?.message);

  const directRecalcCall = await clientA.rpc('recalculate_invoice_financials', { target_invoice_id: inv2.id });
  record("16b", "Client execution of internal recalculate function DENIED", "Permission denied",
    directRecalcCall.error?.message || "Allowed (FAIL)", !!directRecalcCall.error?.message);

  // --- 17. HISTORICAL ITEM SNAPSHOT ---
  console.log("\n--- 17. Testing Historical Service Snapshotting ---");
  if (serviceMaster) {
    await clientA.from('services').update({ default_price: 9999, service_name: "Modified Service Name" }).eq('id', serviceMaster.id);
  }

  const { data: itemSnapshotChecked } = await clientA.from('invoice_items').select('*').eq('invoice_id', inv150.id).single();

  record("17", "Historical invoice item snapshot unchanged", "unit_price=150, description=Live PAN Service",
    `unit_price=${itemSnapshotChecked?.unit_price}, desc=${itemSnapshotChecked?.description}`,
    itemSnapshotChecked?.unit_price === 150 && itemSnapshotChecked?.description === "Live PAN Card Service");

  // Summary
  console.log("\n==========================================================================");
  console.log("📊 LIVE SUPABASE DATABASE INTEGRITY VERIFICATION SUMMARY");
  console.log("==========================================================================\n");

  console.table(testResults.map(t => ({
    'Code': t.code,
    'Requirement Name': t.name,
    'Expected Outcome': t.expected,
    'Actual Result': t.actual,
    'Status': t.status
  })));

  const allPassed = testResults.every(t => t.status === 'PASS');
  console.log("\n==========================================================================");
  console.log(`VERDICT: ${allPassed ? '✅ ALL LIVE SUPABASE DATABASE INTEGRITY TESTS PASSED CLEANLY!' : '❌ SOME TESTS FAILED'}`);
  console.log("==========================================================================");

  if (!allPassed) process.exit(1);
}

runLiveSupabaseTests().catch(err => {
  console.error("FATAL ERROR IN LIVE TEST SUITE:", err);
  process.exit(1);
});
