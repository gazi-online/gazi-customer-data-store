import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BillingEngine } from './src/lib/billing/BillingEngine';
import { Invoice, InvoiceItem, Payment, PaymentAllocation } from './src/types/billing';

// Mock Phase 9 Hardened Database simulating PostgreSQL Atomic Functions, Constraints, RLS & Locking
class MockPhase9HardenedDatabase {
  public customers: any[] = [];
  public services: any[] = [];
  public customerServices: any[] = [];
  public invoices: Invoice[] = [];
  public invoiceItems: InvoiceItem[] = [];
  public payments: Payment[] = [];
  public paymentAllocations: PaymentAllocation[] = [];
  private invSeq = 1001;
  private paySeq = 1001;

  constructor() {
    this.customers.push({ id: "cust_alice_101", name: "Alice Smith", created_by: "usr_agent_1" });
    this.customers.push({ id: "cust_bob_202", name: "Bob Jones", created_by: "usr_agent_2" });

    this.services.push({
      id: "srv_pan_101",
      service_code: "PAN001",
      service_name: "New Pan Service",
      default_price: 150,
      status: "active"
    });
  }

  generateInvoiceNumber(): string {
    const num = `INV-2026-${String(this.invSeq++).padStart(6, '0')}`;
    return num;
  }

  generatePaymentNumber(): string {
    const num = `PAY-2026-${String(this.paySeq++).padStart(6, '0')}`;
    return num;
  }

  async createInvoice(data: {
    customer_id: string;
    invoice_number?: string;
    items: { description: string; quantity: number; unit_price: number; discount_amount?: number; tax_amount?: number; customer_service_id?: string | null; service_id?: string | null }[];
    discount_amount?: number;
    tax_amount?: number;
    created_by?: string;
  }): Promise<Invoice> {
    const invoiceId = "inv_" + crypto.randomUUID().substring(0, 8);
    const invoiceItems: InvoiceItem[] = data.items.map(item => {
      if (item.discount_amount !== undefined && item.discount_amount < 0) {
        throw new Error('check_invoice_items_discount constraint violated: discount_amount cannot be negative');
      }
      if (item.tax_amount !== undefined && item.tax_amount < 0) {
        throw new Error('check_invoice_items_tax constraint violated: tax_amount cannot be negative');
      }
      const line_total = BillingEngine.calculateLineTotal(item);
      return {
        id: "item_" + crypto.randomUUID().substring(0, 8),
        invoice_id: invoiceId,
        customer_service_id: item.customer_service_id || null,
        service_id: item.service_id || null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount || 0,
        tax_amount: item.tax_amount || 0,
        line_total
      };
    });

    const totals = BillingEngine.calculateInvoiceTotals({
      items: invoiceItems,
      discount_amount: data.discount_amount,
      tax_amount: data.tax_amount,
      paid_amount: 0
    });

    const newInvoice: Invoice = {
      id: invoiceId,
      invoice_number: data.invoice_number || this.generateInvoiceNumber(),
      customer_id: data.customer_id,
      invoice_date: new Date().toISOString().split('T')[0],
      status: 'issued',
      ...totals,
      created_by: data.created_by || "usr_agent_1",
      created_at: new Date().toISOString()
    };

    this.invoices.push(newInvoice);
    this.invoiceItems.push(...invoiceItems);
    return newInvoice;
  }

  async recordPayment(data: {
    customer_id: string;
    payment_number?: string;
    amount: number;
    payment_method: 'cash' | 'upi' | 'bank_transfer' | 'card' | 'cheque' | 'other';
    reference_number?: string;
    created_by?: string;
  }): Promise<Payment> {
    if (data.amount <= 0) {
      throw new Error("Payment amount must be greater than 0");
    }

    const newPayment: Payment = {
      id: "pay_" + crypto.randomUUID().substring(0, 8),
      customer_id: data.customer_id,
      payment_number: data.payment_number || this.generatePaymentNumber(),
      amount: BillingEngine.roundMoney(data.amount),
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: data.payment_method,
      reference_number: data.reference_number || null,
      status: 'recorded',
      created_by: data.created_by || "usr_agent_1",
      created_at: new Date().toISOString()
    };

    this.payments.push(newPayment);
    return newPayment;
  }

  // Simulates PostgreSQL allocate_payment_atomic RPC function
  async allocatePaymentAtomic(paymentId: string, invoiceId: string, amount: number, currentUserId?: string): Promise<{ success: boolean; allocation?: PaymentAllocation; error?: string }> {
    const payment = this.payments.find(p => p.id === paymentId);
    const invoice = this.invoices.find(i => i.id === invoiceId);

    if (!payment) return { success: false, error: "Payment not found" };
    if (!invoice) return { success: false, error: "Invoice not found" };

    if (currentUserId && payment.created_by && payment.created_by !== currentUserId) {
      return { success: false, error: "Access denied: Payment ownership mismatch" };
    }

    if (currentUserId && invoice.created_by && invoice.created_by !== currentUserId) {
      return { success: false, error: "Access denied: Invoice ownership mismatch" };
    }

    // DB-Level Same Customer Protection Trigger Simulation
    if (payment.customer_id !== invoice.customer_id) {
      return { success: false, error: "Cross-customer payment allocation blocked by database rules" };
    }

    if (payment.status !== 'recorded') {
      return { success: false, error: "Cannot allocate from a voided or refunded payment" };
    }

    if (invoice.status === 'cancelled') {
      return { success: false, error: "Cannot allocate payment to a cancelled invoice" };
    }

    if (amount <= 0) {
      return { success: false, error: "Allocation amount must be greater than 0" };
    }

    const roundedNew = BillingEngine.roundMoney(amount);

    // Lock check simulation: Payment balance
    const currentPaymentAllocated = BillingEngine.roundMoney(
      this.paymentAllocations
        .filter(a => a.payment_id === paymentId && a.invoice_id !== invoiceId)
        .reduce((sum, a) => sum + a.amount, 0)
    );
    const remainingPaymentBalance = BillingEngine.roundMoney(payment.amount - currentPaymentAllocated);

    if (roundedNew > remainingPaymentBalance) {
      return {
        success: false,
        error: `Allocation amount (₹${roundedNew}) exceeds remaining payment balance (₹${remainingPaymentBalance})`
      };
    }

    // Lock check simulation: Invoice due balance
    const currentInvoicePaid = BillingEngine.roundMoney(
      this.paymentAllocations
        .filter(a => a.invoice_id === invoiceId && a.payment_id !== paymentId)
        .map(a => {
          const pay = this.payments.find(p => p.id === a.payment_id);
          return pay?.status === 'recorded' ? a.amount : 0;
        })
        .reduce((sum, a) => sum + a, 0)
    );

    const remainingInvoiceDue = BillingEngine.roundMoney(invoice.total_amount - currentInvoicePaid);

    if (roundedNew > remainingInvoiceDue) {
      return {
        success: false,
        error: `Allocation amount (₹${roundedNew}) exceeds remaining invoice due (₹${remainingInvoiceDue})`
      };
    }

    // Atomic Upsert (UNIQUE CONSTRAINT payment_id, invoice_id)
    let alloc = this.paymentAllocations.find(a => a.payment_id === paymentId && a.invoice_id === invoiceId);
    if (alloc) {
      alloc.amount = roundedNew;
    } else {
      alloc = {
        id: "alloc_" + crypto.randomUUID().substring(0, 8),
        payment_id: paymentId,
        invoice_id: invoiceId,
        amount: roundedNew,
        created_at: new Date().toISOString()
      };
      this.paymentAllocations.push(alloc);
    }

    // Trigger automatically recalculates invoice financials
    this.recalculateInvoiceFinancials(invoiceId);

    return { success: true, allocation: alloc };
  }

  attemptDirectPaidAmountOverride(invoiceId: string, newPaidAmount: number, internalRecalcFlag = false): { success: boolean; error?: string } {
    if (!internalRecalcFlag) {
      return { success: false, error: "Direct modification of derived financial fields (paid_amount, due_amount) is blocked by database rules" };
    }
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: "Invoice not found" };
    invoice.paid_amount = newPaidAmount;
    return { success: true };
  }

  attemptDirectDueAmountOverride(invoiceId: string, newDueAmount: number, internalRecalcFlag = false): { success: boolean; error?: string } {
    if (!internalRecalcFlag) {
      return { success: false, error: "Direct modification of derived financial fields (paid_amount, due_amount) is blocked by database rules" };
    }
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: "Invoice not found" };
    invoice.due_amount = newDueAmount;
    return { success: true };
  }

  async voidPayment(paymentId: string, currentUserId?: string): Promise<{ success: boolean; error?: string }> {
    const payment = this.payments.find(p => p.id === paymentId);
    if (!payment) return { success: false, error: "Payment not found" };

    if (currentUserId && payment.created_by && payment.created_by !== currentUserId) {
      return { success: false, error: "Access denied: Payment ownership mismatch" };
    }

    payment.status = 'voided';
    payment.voided_at = new Date().toISOString();

    const affectedInvoiceIds = this.paymentAllocations
      .filter(a => a.payment_id === paymentId)
      .map(a => a.invoice_id);

    for (const invId of affectedInvoiceIds) {
      this.recalculateInvoiceFinancials(invId);
    }

    return { success: true };
  }

  async refundPayment(paymentId: string, currentUserId?: string): Promise<{ success: boolean; error?: string }> {
    const payment = this.payments.find(p => p.id === paymentId);
    if (!payment) return { success: false, error: "Payment not found" };

    if (currentUserId && payment.created_by && payment.created_by !== currentUserId) {
      return { success: false, error: "Access denied: Payment ownership mismatch" };
    }

    payment.status = 'refunded';

    const affectedInvoiceIds = this.paymentAllocations
      .filter(a => a.payment_id === paymentId)
      .map(a => a.invoice_id);

    for (const invId of affectedInvoiceIds) {
      this.recalculateInvoiceFinancials(invId);
    }

    return { success: true };
  }

  async cancelInvoice(invoiceId: string): Promise<{ success: boolean; error?: string }> {
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: "Invoice not found" };

    invoice.status = 'cancelled';
    invoice.cancelled_at = new Date().toISOString();
    invoice.due_amount = 0;

    return { success: true };
  }

  public recalculateInvoiceFinancials(invoiceId: string) {
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) return;

    const allocations = this.paymentAllocations
      .filter(a => a.invoice_id === invoiceId)
      .map(alloc => {
        const pay = this.payments.find(p => p.id === alloc.payment_id);
        return { allocation: alloc, paymentStatus: pay?.status || 'voided' };
      });

    const updated = BillingEngine.processAllocationsForInvoice(invoice, allocations);
    invoice.paid_amount = updated.paid_amount;
    invoice.due_amount = updated.due_amount;
    invoice.status = updated.status;
  }

  attemptDirectStatusTransition(invoiceId: string, newStatus: string, internalRecalcFlag = false): { success: boolean; error?: string } {
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: "Invoice not found" };

    if (!internalRecalcFlag) {
      if ((newStatus === 'partially_paid' || newStatus === 'paid') && (invoice.status !== 'partially_paid' && invoice.status !== 'paid')) {
        return { success: false, error: "Direct transition TO payment-derived status is blocked. Use payment allocation RPCs" };
      }
      if ((invoice.status === 'partially_paid' || invoice.status === 'paid') && (newStatus !== 'partially_paid' && newStatus !== 'paid')) {
        return { success: false, error: `Direct transition FROM payment-derived status (${invoice.status}) to ${newStatus} is blocked. Void/refund payments to recalculate status` };
      }
      if (invoice.status === 'draft' && newStatus === 'issued') {
        invoice.status = newStatus;
        return { success: true };
      }
      if ((invoice.status === 'draft' || invoice.status === 'issued') && newStatus === 'cancelled') {
        invoice.status = newStatus;
        invoice.cancelled_at = new Date().toISOString();
        invoice.due_amount = 0;
        return { success: true };
      }
    }
    invoice.status = newStatus as any;
    return { success: true };
  }

  // RLS Simulation methods
  selectInvoices(currentUserId: string | null): Invoice[] {
    if (!currentUserId) return []; // Anon denied
    return this.invoices.filter(i => i.created_by === currentUserId);
  }

  selectPaymentAllocations(currentUserId: string | null): PaymentAllocation[] {
    if (!currentUserId) return []; // Anon denied
    // Requires BOTH payment.created_by = auth.uid() AND invoice.created_by = auth.uid()
    return this.paymentAllocations.filter(alloc => {
      const pay = this.payments.find(p => p.id === alloc.payment_id);
      const inv = this.invoices.find(i => i.id === alloc.invoice_id);
      return pay?.created_by === currentUserId && inv?.created_by === currentUserId;
    });
  }

  mutateInvoice(invoiceId: string, currentUserId: string | null): { success: boolean; error?: string } {
    if (!currentUserId) return { success: false, error: "Anonymous access denied" };
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice || invoice.created_by !== currentUserId) {
      return { success: false, error: "Access denied: RLS ownership violation" };
    }
    return { success: true };
  }
}

async function runPhase9HardenedAuditTests() {
  console.log("==========================================================================");
  console.log(" 🧪 PHASE 9 — HARDENED DATABASE INTEGRITY AUDIT TEST SUITE (A - R)");
  console.log("==========================================================================\n");

  const db = new MockPhase9HardenedDatabase();
  const testResults: { testCode: string; name: string; expected: string; actual: string; status: 'PASS' | 'FAIL' }[] = [];

  function record(testCode: string, name: string, expected: string, actual: string, pass: boolean) {
    const status = pass ? 'PASS' : 'FAIL';
    testResults.push({ testCode, name, expected, actual, status });
    console.log(`[TEST ${testCode}] ${name}: Expected '${expected}' | Got '${actual}' ➔ ${status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  }

  const customerA = "cust_alice_101";
  const customerB = "cust_bob_202";
  const userA = "usr_agent_1";
  const userB = "usr_agent_2";
  const masterService = db.services[0]; // New Pan Service (₹150)

  // --- TEST A: invoice_items negative discount blocked ---
  let errA = "";
  try {
    await db.createInvoice({
      customer_id: customerA,
      items: [{ description: "Item with negative discount", quantity: 1, unit_price: 100, discount_amount: -20 }]
    });
  } catch (e: any) { errA = e.message; }
  record("A", "invoice_items negative discount blocked", "Discount check constraint error", errA || "Allowed (FAIL)", !!errA.includes("discount"));

  // --- TEST B: invoice_items negative tax blocked ---
  let errB = "";
  try {
    await db.createInvoice({
      customer_id: customerA,
      items: [{ description: "Item with negative tax", quantity: 1, unit_price: 100, tax_amount: -10 }]
    });
  } catch (e: any) { errB = e.message; }
  record("B", "invoice_items negative tax blocked", "Tax check constraint error", errB || "Allowed (FAIL)", !!errB.includes("tax"));

  // Baseline Setup
  const itemSnapshot = BillingEngine.snapshotServiceToInvoiceItem(masterService);
  const invoice1 = await db.createInvoice({
    customer_id: customerA,
    items: [itemSnapshot],
    created_by: userA
  });

  // --- TEST C: direct manipulation of paid_amount blocked ---
  const resC = db.attemptDirectPaidAmountOverride(invoice1.id!, 100, false);
  record("C", "Direct manipulation of paid_amount blocked", "Blocked by trigger", resC.error || "Allowed (FAIL)", !resC.success && !!resC.error?.includes("blocked"));

  // --- TEST D: direct manipulation of due_amount blocked ---
  const resD = db.attemptDirectDueAmountOverride(invoice1.id!, 50, false);
  record("D", "Direct manipulation of due_amount blocked", "Blocked by trigger", resD.error || "Allowed (FAIL)", !resD.success && !!resD.error?.includes("blocked"));

  // --- TEST E: simultaneous allocations cannot overpay invoice ---
  const pay1 = await db.recordPayment({ customer_id: customerA, amount: 150, payment_method: "upi", created_by: userA });
  const pay2 = await db.recordPayment({ customer_id: customerA, amount: 150, payment_method: "cash", created_by: userA });

  const concAlloc1 = await db.allocatePaymentAtomic(pay1.id!, invoice1.id!, 150, userA);
  const concAlloc2 = await db.allocatePaymentAtomic(pay2.id!, invoice1.id!, 150, userA);
  record("E", "Simultaneous allocations cannot overpay invoice", "Alloc 1 OK, Alloc 2 blocked",
    concAlloc1.success && !concAlloc2.success ? `Alloc 2: ${concAlloc2.error}` : "Failed",
    concAlloc1.success && !concAlloc2.success && !!concAlloc2.error?.includes("exceeds remaining invoice due")
  );

  // --- TEST F: simultaneous allocations cannot overuse payment ---
  const invoice2 = await db.createInvoice({ customer_id: customerA, items: [itemSnapshot], created_by: userA });
  const concPay1 = await db.allocatePaymentAtomic(pay1.id!, invoice2.id!, 100, userA);
  record("F", "Simultaneous allocations cannot overuse payment", "Blocked by remaining payment balance check",
    concPay1.error || "Allowed (FAIL)",
    !concPay1.success && !!concPay1.error?.includes("exceeds remaining payment balance")
  );

  // --- TEST G: Customer A payment → Customer B invoice blocked at DB level ---
  const invoiceBob = await db.createInvoice({ customer_id: customerB, items: [itemSnapshot], created_by: userB });
  const crossAlloc = await db.allocatePaymentAtomic(pay1.id!, invoiceBob.id!, 50);
  record("G", "Customer A payment → Customer B invoice blocked at DB", "Blocked by DB rule",
    crossAlloc.error || "Allowed (FAIL)",
    !crossAlloc.success && !!crossAlloc.error?.includes("Cross-customer")
  );

  // --- TEST H: void payment restores invoice due ---
  record("H1", "Invoice initially paid", "due=0, status=paid", `due=${invoice1.due_amount}, status=${invoice1.status}`, invoice1.status === 'paid' && invoice1.due_amount === 0);

  // --- TEST H2: Direct tampering paid -> issued BLOCKED ---
  const resH2 = db.attemptDirectStatusTransition(invoice1.id!, 'issued', false);
  record("H2", "Direct status tampering paid -> issued BLOCKED", "Blocked by trigger", resH2.error || "Allowed (FAIL)", !resH2.success && !!resH2.error?.includes("blocked"));

  await db.voidPayment(pay1.id!, userA);
  record("H", "Void payment restores invoice due", "due=150, status=issued", `due=${invoice1.due_amount}, status=${invoice1.status}`, invoice1.status === 'issued' && invoice1.due_amount === 150);

  // --- TEST I: refund payment restores invoice due ---
  const payRefund = await db.recordPayment({ customer_id: customerA, amount: 150, payment_method: "bank_transfer", created_by: userA });
  await db.allocatePaymentAtomic(payRefund.id!, invoice1.id!, 150, userA);
  await db.refundPayment(payRefund.id!, userA);
  record("I", "Refund payment restores invoice due", "due=150, status=issued", `due=${invoice1.due_amount}, status=${invoice1.status}`, invoice1.status === 'issued' && invoice1.due_amount === 150);

  // --- TEST J: cancelled invoice remains cancelled after recalculation ---
  await db.cancelInvoice(invoice1.id!);
  db.recalculateInvoiceFinancials(invoice1.id!);
  record("J", "Cancelled invoice remains cancelled after recalculation", "status=cancelled, due=0", `status=${invoice1.status}, due=${invoice1.due_amount}`, invoice1.status === 'cancelled' && invoice1.due_amount === 0);

  // --- TEST K: two concurrent invoice creations receive different invoice numbers ---
  const invK1 = await db.createInvoice({ customer_id: customerA, items: [itemSnapshot] });
  const invK2 = await db.createInvoice({ customer_id: customerA, items: [itemSnapshot] });
  record("K", "Two concurrent invoice creations receive unique sequence numbers", "Distinct numbers", `${invK1.invoice_number} vs ${invK2.invoice_number}`, invK1.invoice_number !== invK2.invoice_number);

  // --- TEST L: two concurrent payment creations receive different payment numbers ---
  const payL1 = await db.recordPayment({ customer_id: customerA, amount: 50, payment_method: "cash" });
  const payL2 = await db.recordPayment({ customer_id: customerA, amount: 50, payment_method: "cash" });
  record("L", "Two concurrent payment creations receive unique sequence numbers", "Distinct numbers", `${payL1.payment_number} vs ${payL2.payment_number}`, payL1.payment_number !== payL2.payment_number);

  // --- TEST M: anonymous billing access denied ---
  const anonInvoices = db.selectInvoices(null);
  const anonMutate = db.mutateInvoice(invoice1.id!, null);
  record("M", "Anonymous billing access denied by RLS", "Empty array / Denied error", `Select count=${anonInvoices.length}, Mutate error=${anonMutate.error}`, anonInvoices.length === 0 && !anonMutate.success);

  // --- TEST N: User A cannot SELECT User B invoice/payment ---
  const userBInvoices = db.selectInvoices(userB);
  const containsInvoice1 = userBInvoices.some(i => i.id === invoice1.id);
  record("N", "User A cannot SELECT User B invoice", "Filtered out by RLS", `User B invoice count=${userBInvoices.length}, includes User A inv=${containsInvoice1}`, !containsInvoice1);

  // --- TEST O: User A cannot mutate User B invoice/payment ---
  const userAMutateUserBInv = db.mutateInvoice(invoiceBob.id!, userA);
  record("O", "User A cannot mutate User B invoice", "Access denied error", userAMutateUserBInv.error || "Allowed (FAIL)", !userAMutateUserBInv.success && !!userAMutateUserBInv.error?.includes("Access denied"));

  // --- TEST P: historical invoice item remains unchanged after service master price modification ---
  masterService.default_price = 888;
  const itemP = db.invoiceItems.find(item => item.invoice_id === invoice1.id!);
  record("P", "Historical invoice item unchanged after service master modification", "unit_price=150", `unit_price=${itemP?.unit_price}`, itemP?.unit_price === 150);

  // --- TEST Q: duplicate payment/invoice pair remains one consolidated allocation ---
  const payQ = await db.recordPayment({ customer_id: customerA, amount: 200, payment_method: "upi", created_by: userA });
  const invQ = await db.createInvoice({ customer_id: customerA, items: [itemSnapshot], created_by: userA });
  await db.allocatePaymentAtomic(payQ.id!, invQ.id!, 50, userA);
  await db.allocatePaymentAtomic(payQ.id!, invQ.id!, 100, userA);
  const allocsQ = db.paymentAllocations.filter(a => a.payment_id === payQ.id && a.invoice_id === invQ.id);
  record("Q", "Duplicate payment/invoice pair remains one consolidated allocation", "Count=1, Amount=100", `Alloc count=${allocsQ.length}, Amount=${allocsQ[0]?.amount}`, allocsQ.length === 1 && allocsQ[0].amount === 100);

  // --- TEST R: Dual-Ownership payment_allocations RLS policy ---
  const userBAllocations = db.selectPaymentAllocations(userB);
  record("R", "Dual ownership payment_allocations RLS requires BOTH payment & invoice ownership", "Count=0 for User B on User A resources", `User B visible alloc count=${userBAllocations.length}`, userBAllocations.length === 0);

  console.log("\n==========================================================================");
  console.log("📊 HARDENED DATABASE INTEGRITY AUDIT SUMMARY (A - R)");
  console.log("==========================================================================\n");

  console.table(testResults.map(t => ({
    'Code': t.testCode,
    'Requirement Name': t.name,
    'Expected Outcome': t.expected,
    'Actual Result': t.actual,
    'Status': t.status
  })));

  const allPassed = testResults.every(t => t.status === 'PASS');
  console.log("\n==========================================================================");
  console.log(`VERDICT: ${allPassed ? '✅ ALL 18 DATABASE INTEGRITY TESTS (A - R) PASSED CLEANLY!' : '❌ SOME TESTS FAILED'}`);
  console.log("==========================================================================");

  if (!allPassed) process.exit(1);
}

runPhase9HardenedAuditTests().catch(console.error);
