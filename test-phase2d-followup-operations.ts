/**
 * ==============================================================================
 * PHASE 2D: FOLLOW-UP, DUE-DATE & RENEWAL OPERATIONS — PRE-MIGRATION TEST SUITE
 * File: test-phase2d-followup-operations.ts
 * ==============================================================================
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  getKolkataDateString,
  getKolkataTodayHalfOpenRange,
  classifyFollowupState,
  formatKolkataDateTime,
  getKolkataFutureDateString,
} from "./src/lib/operations/dateUtils";

async function runTests() {
  console.log("=== PHASE 2D PRE-MIGRATION TEST SUITE ===");

  // --------------------------------------------------------------------------
  // TEST 1: Asia/Kolkata (IST = UTC+05:30) half-open range calculation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Verifying Asia/Kolkata half-open intervals...");
  const refDate = new Date("2026-09-16T12:00:00.000Z"); // 5:30 PM IST on Sep 16
  const range = getKolkataTodayHalfOpenRange(refDate);

  assert.strictEqual(range.todayDateStr, "2026-09-16", "Today date string in IST must be 2026-09-16");
  assert.strictEqual(range.tomorrowDateStr, "2026-09-17", "Tomorrow date string in IST must be 2026-09-17");

  const startTodayMs = new Date(range.startOfTodayIST).getTime();
  const startTomorrowMs = new Date(range.startOfTomorrowIST).getTime();
  const startDayAfterMs = new Date(range.startOfDayAfterTomorrowIST).getTime();

  // Exactly 24 hours between day boundaries
  assert.strictEqual(
    startTomorrowMs - startTodayMs,
    24 * 60 * 60 * 1000,
    "Exactly 24 hours (86,400,000 ms) between startOfToday and startOfTomorrow"
  );
  assert.strictEqual(
    startDayAfterMs - startTomorrowMs,
    24 * 60 * 60 * 1000,
    "Exactly 24 hours between startOfTomorrow and startOfDayAfterTomorrow"
  );

  // UTC time for 00:00:00 IST on 2026-09-16 is 2026-09-15T18:30:00.000Z
  assert.strictEqual(
    range.startOfTodayIST,
    "2026-09-15T18:30:00.000Z",
    "00:00:00 IST corresponds exactly to previous day 18:30:00 UTC"
  );
  assert.strictEqual(
    range.startOfTomorrowIST,
    "2026-09-16T18:30:00.000Z",
    "00:00:00 IST tomorrow corresponds to 18:30:00 UTC"
  );
  console.log("  ✓ Half-open interval calculations are mathematically exact (no 23:59:59.999 hacks).");

  // --------------------------------------------------------------------------
  // TEST 2: Follow-up State Classification & Boundary Precision
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Verifying Follow-up State Classification...");

  // 1 ms before startOfToday -> overdue
  const oneMsBeforeToday = new Date(startTodayMs - 1).toISOString();
  assert.strictEqual(
    classifyFollowupState(oneMsBeforeToday, "open", refDate),
    "overdue",
    "1ms before startOfToday must be overdue"
  );

  // Exactly startOfToday -> today
  assert.strictEqual(
    classifyFollowupState(range.startOfTodayIST, "open", refDate),
    "today",
    "Exact startOfToday must be today"
  );

  // Noon IST -> today
  const noonIST = new Date(startTodayMs + 12 * 3600 * 1000).toISOString();
  assert.strictEqual(
    classifyFollowupState(noonIST, "open", refDate),
    "today",
    "Noon IST must be today"
  );

  // 1 ms before startOfTomorrow -> today (half-open upper bound test)
  const oneMsBeforeTomorrow = new Date(startTomorrowMs - 1).toISOString();
  assert.strictEqual(
    classifyFollowupState(oneMsBeforeTomorrow, "open", refDate),
    "today",
    "1ms before startOfTomorrow must still be today"
  );

  // Exactly startOfTomorrow -> tomorrow
  assert.strictEqual(
    classifyFollowupState(range.startOfTomorrowIST, "open", refDate),
    "tomorrow",
    "Exact startOfTomorrow must be tomorrow"
  );

  // Exactly startOfDayAfterTomorrow -> upcoming
  assert.strictEqual(
    classifyFollowupState(range.startOfDayAfterTomorrowIST, "open", refDate),
    "upcoming",
    "Exact startOfDayAfterTomorrow must be upcoming"
  );

  // Terminal statuses override date math
  assert.strictEqual(classifyFollowupState(oneMsBeforeToday, "completed", refDate), "completed");
  assert.strictEqual(classifyFollowupState(oneMsBeforeToday, "cancelled", refDate), "cancelled");
  assert.strictEqual(classifyFollowupState(oneMsBeforeToday, "rescheduled", refDate), "rescheduled");
  console.log("  ✓ Half-open boundary precision and terminal state overrides verified.");

  // --------------------------------------------------------------------------
  // TEST 3: Future Offset Calculations & Formatting
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Verifying Future Date String Calculation...");
  const plus7 = getKolkataFutureDateString(7, refDate);
  const plus30 = getKolkataFutureDateString(30, refDate);
  assert.strictEqual(plus7, "2026-09-23", "+7 days from 2026-09-16 must be 2026-09-23");
  assert.strictEqual(plus30, "2026-10-16", "+30 days from 2026-09-16 must be 2026-10-16");

  const formatted = formatKolkataDateTime("2026-09-16T18:30:00.000Z");
  assert.ok(formatted.includes("17") && formatted.includes("Sep"), "18:30 UTC = 00:00 on 17 Sep in IST");
  console.log("  ✓ Future offset calculation and IST date formatting verified.");

  // --------------------------------------------------------------------------
  // TEST 4: SQL Migration Architecture & Safety Patches Verification
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Verifying Phase 2D SQL Migration script contents...");
  const sqlPath = path.join(process.cwd(), "phase2d_followup_operations_migration.sql");
  assert.ok(fs.existsSync(sqlPath), "phase2d_followup_operations_migration.sql must exist");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  // 1. Single open partial unique index
  assert.ok(
    sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_service_request_followups_single_open") &&
    sql.includes("WHERE status = 'open'"),
    "Must enforce UNIQUE(customer_service_id) WHERE status = 'open'"
  );

  // 2. Deferred FK with ON DELETE RESTRICT
  assert.ok(
    sql.includes("superseded_by UUID NULL REFERENCES public.service_request_followups(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"),
    "Must configure superseded_by with ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
  );

  // 3. Insert Guard trigger
  assert.ok(
    sql.includes("check_service_request_followup_insert_guard") &&
    sql.includes("NEW.status <> 'open'") &&
    sql.includes("NEW.completed_at IS NOT NULL") &&
    sql.includes("NEW.resolution_note IS NOT NULL") &&
    sql.includes("NEW.superseded_by IS NOT NULL"),
    "Insert guard must strictly prohibit inserting terminal rows or premature resolution values"
  );

  // 4. Update Guard trigger & Immutability
  assert.ok(
    sql.includes("check_service_request_followup_update_guard") &&
    sql.includes("NEW.customer_service_id <> OLD.customer_service_id") &&
    sql.includes("NEW.created_by <> OLD.created_by") &&
    sql.includes("NEW.follow_up_at <> OLD.follow_up_at") &&
    sql.includes("NEW.note IS DISTINCT FROM OLD.note") &&
    sql.includes("OLD.status IN ('completed', 'cancelled', 'rescheduled')") &&
    sql.includes("app.canonical_reschedule"),
    "Update guard must enforce schedule immutability and require GUC app.canonical_reschedule for rescheduling"
  );

  // 5. Hardened Canonical Reschedule RPC
  assert.ok(
    sql.includes("CREATE OR REPLACE FUNCTION public.reschedule_service_request_followup") &&
    sql.includes("SECURITY DEFINER") &&
    sql.includes("SET search_path = public, pg_temp") &&
    sql.includes("auth.uid()") &&
    sql.includes("REVOKE ALL ON FUNCTION public.reschedule_service_request_followup(UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;") &&
    sql.includes("GRANT EXECUTE ON FUNCTION public.reschedule_service_request_followup(UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;"),
    "Canonical RPC must have SECURITY DEFINER, search_path, explicit auth, REVOKE from PUBLIC/anon, and GRANT to authenticated"
  );

  // 6. RLS Policies
  assert.ok(
    sql.includes("CREATE POLICY \"service_request_followups_tenant_select\"") &&
    sql.includes("CREATE POLICY \"service_request_followups_tenant_insert\"") &&
    sql.includes("CREATE POLICY \"service_request_followups_tenant_update\"") &&
    sql.includes("DROP POLICY IF EXISTS \"service_request_followups_tenant_delete\""),
    "RLS policies must enforce tenant scoping on select/insert/update and prohibit hard delete"
  );
  console.log("  ✓ SQL migration script passes all Phase 2D safety & architecture invariants.");

  console.log("\n>>> ALL PHASE 2D PRE-MIGRATION TESTS PASSED SUCCESSFULLY! <<<\n");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
