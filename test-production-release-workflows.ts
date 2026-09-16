/**
 * ==============================================================================
 * GCDS PRODUCTION RELEASE VERIFICATION SUITE
 * File: test-production-release-workflows.ts
 * ==============================================================================
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeWhatsAppPhone,
  renderTemplate,
  generateWhatsAppLink,
} from "./src/lib/communications/communicationEngine";
import {
  generateCustomersCsv,
  generateDocumentsCatalogCsv,
} from "./src/lib/export/dataExportEngine";

async function runProductionReleaseTests() {
  console.log("==========================================================================");
  console.log(" 🚀 GCDS PRODUCTION-READY RELEASE SUITE VERIFICATION");
  console.log("==========================================================================");

  // --------------------------------------------------------------------------
  // TEST 1: Phone Normalization for WhatsApp
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Verifying WhatsApp phone normalization...");
  assert.strictEqual(normalizeWhatsAppPhone("9876543210"), "919876543210", "10-digit Indian mobile must be prefixed with 91");
  assert.strictEqual(normalizeWhatsAppPhone("+91 98765 43210"), "919876543210", "Formatted +91 must normalize to 919876543210");
  assert.strictEqual(normalizeWhatsAppPhone("09876543210"), "919876543210", "Leading 0 must be replaced by 91");
  assert.strictEqual(normalizeWhatsAppPhone("6295051584"), "916295051584", "Gazi Online shop mobile must normalize cleanly");
  assert.strictEqual(normalizeWhatsAppPhone("12345"), null, "Short invalid numbers must return null");
  assert.strictEqual(normalizeWhatsAppPhone(null), null, "Null phone must return null");
  console.log("  ✓ Phone normalization handles all Indian mobile formats cleanly.");

  // --------------------------------------------------------------------------
  // TEST 2: Communication Templates & Safe Variable Interpolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Verifying template interpolation and WhatsApp link generation...");
  const rendered = renderTemplate("followup_reminder", {
    customer_name: "Amina Bibi",
    service_name: "Ration Card Correction",
    request_number: "REQ-2026-0042",
    follow_up_date: "16 Sep 2026",
    shop_name: "Gazi Online",
  });

  assert.ok(rendered.includes("Amina Bibi"), "Template must interpolate customer_name");
  assert.ok(rendered.includes("Ration Card Correction"), "Template must interpolate service_name");
  assert.ok(rendered.includes("REQ-2026-0042"), "Template must interpolate request_number");
  assert.ok(rendered.includes("Gazi Online"), "Template must interpolate shop_name");
  assert.ok(!rendered.includes("{{"), "All variables must be resolved without raw brackets remaining");

  const waLink = generateWhatsAppLink("9876543210", rendered);
  assert.ok(waLink?.startsWith("https://wa.me/919876543210?text="), "WhatsApp link must start with https://wa.me/919876543210?text=");
  assert.ok(waLink?.includes(encodeURIComponent("Amina Bibi")), "Message in URL must be safely encoded");
  console.log("  ✓ Communication template interpolation & deep link generator verified.");

  // --------------------------------------------------------------------------
  // TEST 3: Safe Operator CSV Export Engine
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Verifying CSV Export formatting and data minimization...");
  const mockCustomers = [
    {
      customer_code: "CUST-001",
      first_name: "Nur",
      middle_name: "Islam",
      last_name: "Gazi",
      phone: "9876543210",
      email: "nur@example.com",
      address: "Basirhat, North 24 Parganas",
      district: "North 24 Parganas",
      state: "West Bengal",
      pincode: "743422",
      created_at: "2026-09-01T10:00:00Z",
    },
  ];

  const custCsv = generateCustomersCsv(mockCustomers);
  assert.ok(custCsv.includes('"Customer Code","Full Name","Phone / WhatsApp"'), "CSV header must be present");
  assert.ok(custCsv.includes('"Nur Islam Gazi"'), "Full name must be cleanly quoted and combined");
  assert.ok(custCsv.includes('"743422"'), "Pincode must be present");

  const mockDocs = [
    {
      customer: { first_name: "Nur", last_name: "Gazi" },
      document_name: "Aadhaar Card Front",
      category: "identity",
      document_number: "XXXX XXXX 1234",
      issue_date: "2020-01-01",
      expiry_date: null,
      status: "active",
      created_at: "2026-09-01T10:00:00Z",
      storage_path: "secret/private/path/should/not/leak.jpg", // Must not appear
    },
  ];

  const docCsv = generateDocumentsCatalogCsv(mockDocs);
  assert.ok(!docCsv.includes("secret/private/path"), "Export must NEVER leak storage paths");
  assert.ok(docCsv.includes('"Aadhaar Card Front"'), "Document name must be present");
  assert.ok(docCsv.includes('"XXXX XXXX 1234"'), "Masked document number must be present");
  console.log("  ✓ Data export formatting and security boundaries verified.");

  // --------------------------------------------------------------------------
  // TEST 4: Supabase Migrations Ledger Artifact Parity
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Verifying canonical migrations existence...");
  const migDir = path.join(__dirname, "supabase", "migrations");
  const files = fs.readdirSync(migDir);

  const phase2dFile = files.find((f) => f.includes("phase2d_followup_operations_and_hardening"));
  const phase2eFile = files.find((f) => f.includes("phase2e_customer_communications"));
  const phase2gFile = files.find((f) => f.includes("phase2g_team_and_settings_hardening"));

  assert.ok(phase2dFile, "Phase 2D migration must exist under supabase/migrations/");
  assert.ok(phase2eFile, "Phase 2E migration must exist under supabase/migrations/");
  assert.ok(phase2gFile, "Phase 2G migration must exist under supabase/migrations/");

  // Verify phase 2e SQL contents
  const phase2eSql = fs.readFileSync(path.join(migDir, phase2eFile), "utf-8");
  assert.ok(phase2eSql.includes("CREATE TABLE IF NOT EXISTS public.customer_communications"), "Phase 2E must define customer_communications");
  assert.ok(phase2eSql.includes("ENABLE ROW LEVEL SECURITY"), "Phase 2E must enable RLS");
  assert.ok(phase2eSql.includes("REVOKE ALL ON public.customer_communications FROM anon"), "Phase 2E must revoke all from anon");
  assert.ok(phase2eSql.includes("SET search_path = public, pg_temp"), "Phase 2E trigger must set fixed search_path");
  console.log("  ✓ Canonical migrations ledger and SQL security definitions verified.");

  console.log("\n==========================================================================");
  console.log(" VERDICT: ✅ ALL PRODUCTION RELEASE CHECKS PASSED WITH 100% SUCCESS!");
  console.log("==========================================================================\n");
}

runProductionReleaseTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
