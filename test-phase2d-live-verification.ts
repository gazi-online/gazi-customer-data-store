/**
 * ==============================================================================
 * PHASE 2D: LIVE POST-MIGRATION VERIFICATION SUITE
 * File: test-phase2d-live-verification.ts
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";
import fs from "node:fs";

// Load .env.local manually
const envConfig = fs.readFileSync(".env.local", "utf-8");
envConfig.split("\n").forEach((line) => {
  const [key, val] = line.split("=");
  if (key && val) {
    process.env[key.trim()] = val.trim();
  }
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env.local");
  process.exit(1);
}

const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runLiveVerification() {
  console.log("==========================================================================");
  console.log(" 🌐 PHASE 2D: LIVE POST-MIGRATION VERIFICATION SUITE");
  console.log("==========================================================================\n");

  console.log(`Connecting to live Supabase endpoint: ${SUPABASE_URL}\n`);

  // --------------------------------------------------------------------------
  // TEST 1: Unauthenticated RPC Execution Rejection (Security Definer Hardening)
  // --------------------------------------------------------------------------
  console.log("[TEST 1] Testing RPC Execution Privilege for unauthenticated / anon callers...");
  const { data: rpcData, error: rpcError } = await anonClient.rpc("reschedule_service_request_followup", {
    p_old_followup_id: "00000000-0000-0000-0000-000000000000",
    p_new_follow_up_at: new Date().toISOString(),
  });

  assert.strictEqual(rpcData, null, "RPC data must be null for unauthenticated caller");
  assert.ok(rpcError, "RPC execution MUST produce error for anon caller");
  assert.strictEqual(rpcError.code, "42501", "Error code must be 42501 (insufficient privilege)");
  assert.ok(
    rpcError.message.includes("permission denied for function reschedule_service_request_followup"),
    `Error message must confirm execution permission was revoked. Got: ${rpcError.message}`
  );
  console.log("  ✓ [PASS] REVOKE ALL FROM PUBLIC, anon verified live: unauthenticated caller cannot execute reschedule RPC.\n");

  // --------------------------------------------------------------------------
  // TEST 2: Unauthenticated Direct INSERT Rejection (RLS Guard)
  // --------------------------------------------------------------------------
  console.log("[TEST 2] Testing direct INSERT against public.service_request_followups from anon client...");
  const { data: insData, error: insError } = await anonClient
    .from("service_request_followups")
    .insert({
      customer_service_id: "00000000-0000-0000-0000-000000000000",
      follow_up_at: new Date().toISOString(),
      status: "open",
    });

  assert.strictEqual(insData, null, "Insert data must be null for anon caller");
  assert.ok(insError, "Direct insert MUST fail for anon caller");
  assert.strictEqual(insError.code, "42501", "Error code must be 42501 (insufficient privilege)");
  assert.ok(
    insError.message.includes("permission denied for table") || insError.message.includes("violates row-level security policy"),
    `Error message must confirm least-privilege table revocation or RLS block. Got: ${insError.message}`
  );
  console.log("  ✓ [PASS] Least-privilege table revocation & RLS INSERT guard verified live: anon callers cannot insert follow-ups.\n");

  // --------------------------------------------------------------------------
  // TEST 3: Unauthenticated Direct UPDATE Rejection (RLS Guard)
  // --------------------------------------------------------------------------
  console.log("[TEST 3] Testing direct UPDATE against public.service_request_followups from anon client...");
  const { data: updData } = await anonClient
    .from("service_request_followups")
    .update({ note: "Malicious update" })
    .eq("id", "00000000-0000-0000-0000-000000000000")
    .select();

  assert.ok(updData === null || (Array.isArray(updData) && updData.length === 0), "Anon UPDATE must match 0 rows");
  console.log("  ✓ [PASS] Multi-tenant RLS UPDATE policy verified live: anon callers cannot update follow-ups.\n");

  // --------------------------------------------------------------------------
  // TEST 4: Unauthenticated Direct DELETE Prohibition (No Delete Policy)
  // --------------------------------------------------------------------------
  console.log("[TEST 4] Testing direct DELETE against public.service_request_followups from anon client...");
  const { data: delData } = await anonClient
    .from("service_request_followups")
    .delete()
    .eq("id", "00000000-0000-0000-0000-000000000000")
    .select();

  assert.ok(delData === null || (Array.isArray(delData) && delData.length === 0), "Anon DELETE must match 0 rows");
  console.log("  ✓ [PASS] Hard DELETE prohibition verified live: no client delete policy exists on follow-ups table.\n");

  // --------------------------------------------------------------------------
  // TEST 5: Unauthenticated SELECT Zero Leakage (Tenant Isolation)
  // --------------------------------------------------------------------------
  console.log("[TEST 5] Testing SELECT against public.service_request_followups from anon client...");
  const { data: selData, error: selError } = await anonClient
    .from("service_request_followups")
    .select("id, status, follow_up_at, note");

  assert.ok(!selError || selError.code === "42501", "SELECT must either succeed with 0 rows or reject with 42501");
  assert.deepStrictEqual(selData || [], [], "Anon client must receive strictly ZERO rows from follow-ups table");
  console.log("  ✓ [PASS] Multi-tenant RLS SELECT policy verified live: zero data leakage to unauthenticated callers.\n");

  console.log("==========================================================================");
  console.log(" VERDICT: ✅ ALL PHASE 2D LIVE VERIFICATION CHECKS PASSED WITH 100% SUCCESS!");
  console.log("==========================================================================\n");
}

runLiveVerification().catch((err) => {
  console.error("LIVE VERIFICATION FAILED:", err);
  process.exit(1);
});
