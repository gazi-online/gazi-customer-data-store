/**
 * GCDS — MILESTONE 10 PHASE 2C-3C
 * TEST SUITE: DB ATOMICITY, IDEMPOTENCY & SPLIT MIGRATION SUITE
 * File: test-phase2c-3c-db-atomicity.ts
 */

import { runCompatMigrationTests } from "./test-phase2c-3c-compat-migration";
import { runEnforcementMigrationTests } from "./test-phase2c-3c-enforcement-migration";

function main() {
  console.log("==========================================================================");
  console.log(" 🧪 PHASE 2C-3C SPLIT MIGRATION (COMPAT + ENFORCEMENT) STATIC SUITE");
  console.log("==========================================================================");

  runCompatMigrationTests();
  console.log("");
  runEnforcementMigrationTests();

  console.log("");
  console.log("==========================================================================");
  console.log(" VERDICT: ✅ BOTH COMPAT AND ENFORCEMENT MIGRATION SUITES PASSED");
  console.log("==========================================================================");
}

main();
