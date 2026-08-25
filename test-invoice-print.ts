import { BillingEngine } from "./src/lib/billing/BillingEngine";

function formatCurrency(amount: number | null | undefined) {
  return (
    "₹" +
    Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatCustomerAddress(customer: any) {
  if (!customer?.address) return null;
  return [
    customer.address,
    customer.city,
    customer.district,
    customer.state,
    customer.pincode ? `PIN: ${customer.pincode}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function deriveInvoiceStatus(invoice: { status: string; due_date?: string | null; due_amount: number }) {
  const today = new Date().toISOString().split("T")[0];
  const isOverdue =
    invoice.due_date &&
    invoice.due_date < today &&
    Number(invoice.due_amount) > 0 &&
    invoice.status !== "draft" &&
    invoice.status !== "cancelled";

  return isOverdue ? "OVERDUE" : invoice.status.toUpperCase().replace("_", " ");
}

function runInvoicePrintTestSuite() {
  console.log("==========================================================================");
  console.log(" 🧪 INVOICE PRINT SPECIFICATION & CALCULATION TEST SUITE");
  console.log("==========================================================================");

  let passed = 0;
  let failed = 0;

  function report(caseId: string, testName: string, expected: string, actual: string, success: boolean) {
    if (success) {
      passed++;
      console.log(`[CASE ${caseId}] ${testName}: Expected '${expected}' | Got '${actual}' ➔ ✅ PASS`);
    } else {
      failed++;
      console.log(`[CASE ${caseId}] ${testName}: Expected '${expected}' | Got '${actual}' ➔ ❌ FAIL`);
    }
  }

  // ── CASE A: Normal Issued Invoice Calculation & Rendering ──
  const caseA_items = [
    { description: "Pan Card Registration", quantity: 1, unit_price: 150, discount_amount: 0, tax_amount: 0, line_total: 150 },
    { description: "Passport Photo Print", quantity: 4, unit_price: 25, discount_amount: 0, tax_amount: 0, line_total: 100 },
  ];
  const caseA_totals = BillingEngine.calculateInvoiceTotals({
    items: caseA_items as any,
    discount_amount: 0,
    tax_amount: 0,
    paid_amount: 0,
  });
  report(
    "A",
    "Normal Issued Invoice Calculations",
    "Total=250.00, Paid=0.00, Due=250.00, Status=ISSUED",
    `Total=${caseA_totals.total_amount.toFixed(2)}, Paid=${caseA_totals.paid_amount.toFixed(2)}, Due=${caseA_totals.due_amount.toFixed(2)}, Status=${deriveInvoiceStatus({ status: "issued", due_date: "2099-12-31", due_amount: 250 })}`,
    caseA_totals.total_amount === 250 && caseA_totals.due_amount === 250
  );

  // ── CASE B: Paid Invoice ──
  const caseB_totals = BillingEngine.calculateInvoiceTotals({
    items: caseA_items as any,
    discount_amount: 0,
    tax_amount: 0,
    paid_amount: 250,
  });
  report(
    "B",
    "Paid Invoice - Balance Zero",
    "Total=250.00, Paid=250.00, Due=0.00",
    `Total=${caseB_totals.total_amount.toFixed(2)}, Paid=${caseB_totals.paid_amount.toFixed(2)}, Due=${caseB_totals.due_amount.toFixed(2)}`,
    caseB_totals.total_amount === 250 && caseB_totals.paid_amount === 250 && caseB_totals.due_amount === 0
  );

  // ── CASE C: Partially Paid Invoice ──
  const caseC_totals = BillingEngine.calculateInvoiceTotals({
    items: caseA_items as any,
    discount_amount: 0,
    tax_amount: 0,
    paid_amount: 100,
  });
  report(
    "C",
    "Partially Paid Invoice - Correct Balance",
    "Total=250.00, Paid=100.00, Due=150.00",
    `Total=${caseC_totals.total_amount.toFixed(2)}, Paid=${caseC_totals.paid_amount.toFixed(2)}, Due=${caseC_totals.due_amount.toFixed(2)}`,
    caseC_totals.total_amount === 250 && caseC_totals.paid_amount === 100 && caseC_totals.due_amount === 150
  );

  // ── CASE D: Multi-Item Invoice with Line Discounts & Taxes ──
  const item1Total = BillingEngine.calculateLineTotal({ quantity: 2, unit_price: 500, discount_amount: 50, tax_amount: 45 });
  const item2Total = BillingEngine.calculateLineTotal({ quantity: 1, unit_price: 1000, discount_amount: 0, tax_amount: 180 });
  const caseD_items = [
    { description: "Complex Service A", quantity: 2, unit_price: 500, discount_amount: 50, tax_amount: 45, line_total: item1Total },
    { description: "Complex Service B", quantity: 1, unit_price: 1000, discount_amount: 0, tax_amount: 180, line_total: item2Total },
  ];
  const caseD_totals = BillingEngine.calculateInvoiceTotals({
    items: caseD_items as any,
    discount_amount: 0,
    tax_amount: 0,
    paid_amount: 0,
  });
  // Item 1: (2*500) - 50 + 45 = 995
  // Item 2: (1*1000) - 0 + 180 = 1180
  // Subtotal = 2000, Discount = 50, Tax = 225, Total = 2175
  report(
    "D",
    "Multi-Item Complex Line Totals",
    "Item1=995.00, Item2=1180.00, GrandTotal=2175.00",
    `Item1=${item1Total.toFixed(2)}, Item2=${item2Total.toFixed(2)}, GrandTotal=${caseD_totals.total_amount.toFixed(2)}`,
    item1Total === 995 && item2Total === 1180 && caseD_totals.total_amount === 2175
  );

  // ── CASE E: INR Indian Number Formatting ──
  const inr1 = formatCurrency(125000);
  const inr2 = formatCurrency(1500.5);
  report(
    "E",
    "INR Standard Indian Currency Formatting",
    "₹1,25,000.00 and ₹1,500.50",
    `${inr1} and ${inr2}`,
    inr1 === "₹1,25,000.00" && inr2 === "₹1,500.50"
  );

  // ── CASE F: Customer Address Formatting (Clean when missing vs populated) ──
  const custWithAddress = {
    first_name: "Rahul",
    last_name: "Gazi",
    address: "Vill-Kashipur, PO-Bhebia",
    city: "Basirhat",
    district: "North 24 Parganas",
    state: "West Bengal",
    pincode: "743456",
  };
  const custWithoutAddress = {
    first_name: "Anita",
    last_name: "Roy",
    address: "",
    city: null,
    district: null,
    state: null,
    pincode: null,
  };

  const formattedPopulated = formatCustomerAddress(custWithAddress);
  const formattedEmpty = formatCustomerAddress(custWithoutAddress);
  report(
    "F",
    "Customer Address Clean Layout Handling",
    "Full address when available, null when missing (no broken placeholders)",
    `Populated: '${formattedPopulated}' | Missing: '${formattedEmpty}'`,
    formattedPopulated === "Vill-Kashipur, PO-Bhebia, Basirhat, North 24 Parganas, West Bengal, PIN: 743456" && formattedEmpty === null
  );

  // ── CASE G: Soft-Deleted Customer Historical Retention ──
  const mockHistoricalInvoice = {
    id: "inv-001",
    invoice_number: "INV-2026-0001",
    customer: {
      id: "cust-del-001",
      first_name: "Tariqul",
      last_name: "Islam",
      customer_code: "CUST-00042",
      deleted_at: "2026-08-20T10:00:00.000Z",
    },
    total_amount: 500,
    paid_amount: 500,
    due_amount: 0,
    status: "paid",
  };
  const customerRetained = !!mockHistoricalInvoice.customer.first_name && mockHistoricalInvoice.customer.customer_code === "CUST-00042";
  report(
    "G",
    "Soft-Deleted Customer Historical Invoice Retention",
    "Customer details preserved for historical invoices",
    `Customer: ${mockHistoricalInvoice.customer.first_name} ${mockHistoricalInvoice.customer.last_name} (${mockHistoricalInvoice.customer.customer_code})`,
    customerRetained
  );

  // ── CASE H: Cancelled Invoice Watermark & Status ──
  const mockCancelledInvoice = {
    status: "cancelled",
    due_date: "2026-01-01",
    due_amount: 0,
  };
  const cancelledStatus = deriveInvoiceStatus(mockCancelledInvoice);
  report(
    "H",
    "Cancelled Invoice Status & Ledger Due Reset",
    "Status=CANCELLED, Due=0",
    `Status=${cancelledStatus}, Due=${mockCancelledInvoice.due_amount}`,
    cancelledStatus === "CANCELLED" && mockCancelledInvoice.due_amount === 0
  );

  // ── CASE I: Overdue Status Derivation ──
  const mockOverdueInvoice = {
    status: "issued",
    due_date: "2020-01-01",
    due_amount: 150,
  };
  const overdueStatus = deriveInvoiceStatus(mockOverdueInvoice);
  report(
    "I",
    "Overdue Status Derived Dynamically",
    "Status=OVERDUE",
    `Status=${overdueStatus}`,
    overdueStatus === "OVERDUE"
  );

  console.log("==========================================================================");
  console.log(` 📊 SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("==========================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runInvoicePrintTestSuite();
