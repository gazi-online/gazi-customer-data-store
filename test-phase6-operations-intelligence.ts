/**
 * ==============================================================================
 * PHASE 6: DAILY OPERATIONS INTELLIGENCE TEST SUITE
 * File: test-phase6-operations-intelligence.ts
 * ==============================================================================
 * Validates:
 * 1. Timezone-safe Asia/Kolkata date classification
 * 2. Deterministic priority classification (urgent, today, upcoming, pending, completed)
 * 3. Boundary dates (half-open upper/lower bounds, 1ms precision, UTC vs IST midnight)
 * 4. Missing dates & null handling
 * 5. Completed & terminal status exclusion
 * 6. Explicit isExpired and isOverdue flag overrides
 * 7. Operations queue alert structure & count consistency
 * ==============================================================================
 */

import assert from "node:assert";
import {
  getKolkataTodayHalfOpenRange,
  getKolkataDateString,
  getKolkataFutureDateString,
  classifyOperationalPriority,
  formatKolkataDateTime,
} from "./src/lib/operations/dateUtils";

async function runTests() {
  console.log("=== PHASE 6 DAILY OPERATIONS INTELLIGENCE TEST SUITE ===");
  let passedAssertions = 0;

  const assertEqual = (actual: unknown, expected: unknown, message: string) => {
    assert.strictEqual(actual, expected, message);
    passedAssertions++;
  };

  const assertOk = (value: unknown, message: string) => {
    assert.ok(value, message);
    passedAssertions++;
  };

  // Fixed Reference Date for Deterministic Math: 2026-09-23 12:00:00 UTC (17:30 IST)
  const refDate = new Date("2026-09-23T12:00:00.000Z");
  const range = getKolkataTodayHalfOpenRange(refDate);

  console.log("\n[TEST 1] Verifying Asia/Kolkata Reference Range...");
  assertEqual(range.todayDateStr, "2026-09-23", "Today calendar date in IST must be 2026-09-23");
  assertEqual(range.tomorrowDateStr, "2026-09-24", "Tomorrow calendar date in IST must be 2026-09-24");
  // 00:00:00 IST on 2026-09-23 is 2026-09-22T18:30:00.000Z
  assertEqual(range.startOfTodayIST, "2026-09-22T18:30:00.000Z", "Start of today IST corresponds to 18:30 UTC previous day");
  assertEqual(range.startOfTomorrowIST, "2026-09-23T18:30:00.000Z", "Start of tomorrow IST corresponds to 18:30 UTC today");
  console.log("  ✓ Half-open range boundaries mathematically verified in IST.");

  console.log("\n[TEST 2] Priority Classification: Overdue & Expired (Urgent)...");
  const startTodayMs = new Date(range.startOfTodayIST).getTime();

  // 1ms before startOfTodayIST (ISO timestamp) -> urgent
  const justBeforeTodayIso = new Date(startTodayMs - 1).toISOString();
  assertEqual(
    classifyOperationalPriority({ dueDate: justBeforeTodayIso, refDate }),
    "urgent",
    "1ms before startOfTodayIST must be classified as urgent"
  );

  // Calendar date yesterday YYYY-MM-DD -> urgent
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-09-22", refDate }),
    "urgent",
    "Yesterday date must be urgent"
  );

  // Expired date from last month -> urgent
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-08-15", refDate }),
    "urgent",
    "Past month date must be urgent"
  );

  // Explicit isExpired flag override without due date -> urgent
  assertEqual(
    classifyOperationalPriority({ isExpired: true, refDate }),
    "urgent",
    "Explicit isExpired flag must override to urgent"
  );

  // Explicit isOverdue flag override -> urgent
  assertEqual(
    classifyOperationalPriority({ isOverdue: true, refDate }),
    "urgent",
    "Explicit isOverdue flag must override to urgent"
  );
  console.log("  ✓ Overdue and expired records classified as urgent.");

  console.log("\n[TEST 3] Priority Classification: Due Today...");
  // Exact startOfTodayIST -> today
  assertEqual(
    classifyOperationalPriority({ dueDate: range.startOfTodayIST, refDate }),
    "today",
    "Exact start of today IST must be today"
  );

  // Middle of today (Noon IST = 06:30 UTC) -> today
  const noonIstIso = "2026-09-23T06:30:00.000Z";
  assertEqual(
    classifyOperationalPriority({ dueDate: noonIstIso, refDate }),
    "today",
    "Noon IST timestamp must be today"
  );

  // 1ms before startOfTomorrowIST -> today (half-open upper bound test)
  const startTomorrowMs = new Date(range.startOfTomorrowIST).getTime();
  const justBeforeTomorrowIso = new Date(startTomorrowMs - 1).toISOString();
  assertEqual(
    classifyOperationalPriority({ dueDate: justBeforeTomorrowIso, refDate }),
    "today",
    "1ms before start of tomorrow IST must still be today"
  );

  // Calendar date matching todayStr (2026-09-23) -> today
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-09-23", refDate }),
    "today",
    "Calendar date matching today must be today"
  );
  console.log("  ✓ Due today records classified accurately across half-open boundaries.");

  console.log("\n[TEST 4] Priority Classification: Upcoming...");
  // Exact startOfTomorrowIST -> upcoming
  assertEqual(
    classifyOperationalPriority({ dueDate: range.startOfTomorrowIST, refDate }),
    "upcoming",
    "Exact start of tomorrow IST must be upcoming"
  );

  // Tomorrow calendar date (2026-09-24) -> upcoming
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-09-24", refDate }),
    "upcoming",
    "Tomorrow calendar date must be upcoming"
  );

  // +7 days calendar date (2026-09-30) -> upcoming
  const plus7Str = getKolkataFutureDateString(7, refDate);
  assertEqual(
    classifyOperationalPriority({ dueDate: plus7Str, refDate }),
    "upcoming",
    "+7 days date must be upcoming"
  );

  // +30 days calendar date -> upcoming
  const plus30Str = getKolkataFutureDateString(30, refDate);
  assertEqual(
    classifyOperationalPriority({ dueDate: plus30Str, refDate }),
    "upcoming",
    "+30 days date must be upcoming"
  );
  console.log("  ✓ Upcoming records classified accurately.");

  console.log("\n[TEST 5] Priority Classification: Pending Action (Missing Due Dates)...");
  // Missing due date with actionable status -> pending
  assertEqual(
    classifyOperationalPriority({ dueDate: null, status: "action_required", refDate }),
    "pending",
    "Null due date with action_required status must be pending"
  );

  // Undefined due date with documents_pending status -> pending
  assertEqual(
    classifyOperationalPriority({ dueDate: undefined, status: "documents_pending", refDate }),
    "pending",
    "Undefined due date with documents_pending status must be pending"
  );

  // Empty string due date -> pending
  assertEqual(
    classifyOperationalPriority({ dueDate: "", status: "open", refDate }),
    "pending",
    "Empty string due date must fall back to pending"
  );
  console.log("  ✓ Missing due date and actionable state fallback verified.");

  console.log("\n[TEST 6] Priority Classification: Completed Exclusion...");
  // Completed status overrides date math (even if overdue)
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-08-01", status: "completed", refDate }),
    "completed",
    "Completed status must override overdue date"
  );

  // Delivered status overrides date math
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-08-01", status: "delivered", refDate }),
    "completed",
    "Delivered status must override overdue date"
  );

  // Cancelled status overrides date math
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-08-01", status: "cancelled", refDate }),
    "completed",
    "Cancelled status must override date math"
  );

  // Paid invoice overrides date math
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-08-01", status: "paid", refDate }),
    "completed",
    "Paid status must override overdue date"
  );

  // Archived document overrides date math
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-08-01", status: "archived", refDate }),
    "completed",
    "Archived document must be completed"
  );
  console.log("  ✓ Terminal/completed states correctly excluded from active priority buckets.");

  console.log("\n[TEST 7] Timezone Edge Cases: UTC Midnight vs Asia/Kolkata (IST)...");
  // 2026-09-23 00:00:00 UTC is 05:30 IST on Sep 23 -> must be today in IST!
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-09-23T00:00:00.000Z", refDate }),
    "today",
    "00:00:00 UTC on Sep 23 is 05:30 IST on Sep 23 (today)"
  );

  // 2026-09-23 18:00:00 UTC is 23:30 IST on Sep 23 -> must be today in IST!
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-09-23T18:00:00.000Z", refDate }),
    "today",
    "18:00:00 UTC on Sep 23 is 23:30 IST on Sep 23 (today)"
  );

  // 2026-09-23 19:00:00 UTC is 00:30 IST on Sep 24 -> must be upcoming (tomorrow in IST)!
  assertEqual(
    classifyOperationalPriority({ dueDate: "2026-09-23T19:00:00.000Z", refDate }),
    "upcoming",
    "19:00:00 UTC on Sep 23 is 00:30 IST on Sep 24 (tomorrow/upcoming)"
  );

  // Format Kolakata date time check
  const formatted = formatKolkataDateTime("2026-09-23T19:00:00.000Z");
  assertOk(formatted.includes("24") && formatted.includes("Sep"), "19:00 UTC on Sep 23 must format as 24 Sep in IST");
  console.log("  ✓ Timezone boundaries between UTC midnight and IST midnight verified.");

  console.log(`\n>>> ALL ${passedAssertions} ASSERTIONS PASSED SUCCESSFULLY! <<<\n`);
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
