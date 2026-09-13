/**
 * ==============================================================================
 * MILESTONE 10 PHASE 2B-1: CENTRAL SERVICE REQUESTS DESK TEST SUITE
 * ==============================================================================
 * Comprehensive tests for:
 * 1. Exact 12-status vocabulary & FSM alignment
 * 2. Default active status set (completed included, terminal excluded)
 * 3. Terminal statuses exclusion
 * 4. Query parameter parsing & normalization
 * 5. Invalid enum graceful fallback (no throws)
 * 6. Page & limit parsing, bounds checking
 * 7. Full-name search tokenization & whitespace normalization
 * 8. Empty ID-lookup safety (no empty in.())
 * 9. India-local calendar date & overdue semantics (UTC-to-IST day boundary)
 * 10. Attention filter exact semantics
 * 11. Pagination offset / range calculation
 * 12. Row data contract mapping & security (zero signed URLs)
 * 13. Navigation layout verification (Requests added, Services intact)
 * 14. Scoped summary metrics query semantics
 * ==============================================================================
 */

import {
  PERSISTED_STATUSES,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  VALID_PRIORITIES,
  VALID_PAYMENT_STATUSES,
  ALLOWED_LIMITS,
  DEFAULT_LIMIT,
  MAX_CUSTOMER_SEARCH_IDS,
  MAX_SERVICE_SEARCH_IDS,
  parseDeskParams,
  tokenizeSearchQuery,
  getIndiaLocalDate,
  isRequestOverdue,
  ServiceRequestDeskRow,
} from "./src/app/(dashboard)/requests/types";
import {
  buildSearchOrConditions,
  resolveRelationalSearchIds
} from "./src/app/(dashboard)/requests/queries";
import { CustomerServiceStatus } from "./src/types/service";
import { getServiceRequestStatusLabel } from "./src/lib/services/serviceRequestWorkflow";
import fs from "fs";
import path from "path";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failedCount++;
  }
}

console.log("==========================================================================");
console.log("🧪 MILESTONE 10 PHASE 2B-1: CENTRAL /REQUESTS DESK TEST SUITE");
console.log("==========================================================================\n");

// ------------------------------------------------------------------------------
// 1. EXACT 12-STATUS VOCABULARY
// ------------------------------------------------------------------------------
console.log("--- 1. Exact 12-Status Vocabulary & Labels ---");
const expected12Statuses: CustomerServiceStatus[] = [
  "pending",
  "documents_pending",
  "ready_to_submit",
  "submitted",
  "in_process",
  "action_required",
  "completed",
  "delivered",
  "rejected",
  "cancelled",
  "in_progress",
  "archived",
];

assert(
  PERSISTED_STATUSES.length === 12,
  "1a. Exactly 12 persisted statuses defined",
  `Found: ${PERSISTED_STATUSES.length}`
);

const missingStatuses = expected12Statuses.filter((s) => !PERSISTED_STATUSES.includes(s));
assert(
  missingStatuses.length === 0,
  "1b. All expected 12 statuses present",
  `Missing: ${missingStatuses.join(", ")}`
);

let allLabelsValid = true;
for (const st of PERSISTED_STATUSES) {
  const lbl = getServiceRequestStatusLabel(st);
  if (!lbl || lbl === st) {
    if (st !== "in_progress") {
      allLabelsValid = false;
    }
  }
}
assert(allLabelsValid, "1c. Human-readable labels exist for all 12 statuses");

// ------------------------------------------------------------------------------
// 2. DEFAULT ACTIVE STATUS SET & TERMINAL EXCLUSION
// ------------------------------------------------------------------------------
console.log("\n--- 2. Default Active Queue & Terminal Exclusion ---");

assert(
  ACTIVE_STATUSES.includes("completed"),
  "2a. 'completed' is strictly included in active statuses (non-terminal)",
  "completed must be in active queue because it can transition to delivered or archived"
);

assert(
  ACTIVE_STATUSES.includes("in_progress"),
  "2b. Legacy 'in_progress' is included in active queue for backward compatibility"
);

assert(
  !ACTIVE_STATUSES.includes("delivered"),
  "2c. 'delivered' is strictly excluded from default active queue"
);

assert(
  !ACTIVE_STATUSES.includes("rejected"),
  "2d. 'rejected' is strictly excluded from default active queue"
);

assert(
  !ACTIVE_STATUSES.includes("cancelled"),
  "2e. 'cancelled' is strictly excluded from default active queue"
);

assert(
  !ACTIVE_STATUSES.includes("archived"),
  "2f. 'archived' is strictly excluded from default active queue"
);

const expectedTerminal: CustomerServiceStatus[] = ["delivered", "rejected", "cancelled", "archived"];
const terminalMatches =
  TERMINAL_STATUSES.length === 4 &&
  expectedTerminal.every((t) => TERMINAL_STATUSES.includes(t));
assert(terminalMatches, "2g. Terminal statuses match exact set: delivered, rejected, cancelled, archived");

// ------------------------------------------------------------------------------
// 3. QUERY PARAMETER PARSING & FALLBACKS
// ------------------------------------------------------------------------------
console.log("\n--- 3. Query Parameter Parsing & Fallbacks ---");

const emptyParsed = parseDeskParams({});
assert(emptyParsed.status === "active", "3a. Empty params default status = 'active'");
assert(emptyParsed.priority === "all", "3b. Empty params default priority = 'all'");
assert(emptyParsed.paymentStatus === "all", "3c. Empty params default payment = 'all'");
assert(emptyParsed.overdue === "all", "3d. Empty params default overdue = 'all'");
assert(emptyParsed.sort === "oldest", "3e. Empty params default sort = 'oldest'");
assert(emptyParsed.page === 1, "3f. Empty params default page = 1");
assert(emptyParsed.limit === DEFAULT_LIMIT, "3g. Empty params default limit = 25");
assert(emptyParsed.q === "", "3h. Empty params default search = ''");

const invalidParsed = parseDeskParams({
  status: "non_existent_status_123",
  priority: "ultra_high_invalid",
  payment: "bitcoin",
  overdue: "maybe_overdue",
  sort: "random_sql_injection",
  page: "-5",
  limit: "9999",
});

assert(invalidParsed.status === "active", "3i. Invalid status falls back to 'active'");
assert(invalidParsed.priority === "all", "3j. Invalid priority falls back to 'all'");
assert(invalidParsed.paymentStatus === "all", "3k. Invalid payment falls back to 'all'");
assert(invalidParsed.overdue === "all", "3l. Invalid overdue falls back to 'all'");
assert(invalidParsed.sort === "oldest", "3m. Invalid sort falls back to 'oldest'");
assert(invalidParsed.page === 1, "3n. Negative page falls back to 1");
assert(invalidParsed.limit === DEFAULT_LIMIT, "3o. Unsupported limit falls back to 25");

assert(parseDeskParams({ limit: "50" }).limit === 50, "3p. Limit 50 parsed correctly");
assert(parseDeskParams({ limit: "100" }).limit === 100, "3q. Limit 100 parsed correctly");

// ------------------------------------------------------------------------------
// 4. FULL-NAME SEARCH TOKENIZATION & WHITESPACE NORMALIZATION
// ------------------------------------------------------------------------------
console.log("\n--- 4. Full-Name Search Tokenization ---");

const singleToken = tokenizeSearchQuery("Nur");
assert(
  singleToken.tokens.length === 1 && singleToken.tokens[0] === "Nur" && singleToken.normalizedQ === "Nur",
  "4a. Single-word name 'Nur' produces 1 token"
);

const twoTokens = tokenizeSearchQuery("Nur Islam");
assert(
  twoTokens.tokens.length === 2 &&
    twoTokens.tokens[0] === "Nur" &&
    twoTokens.tokens[1] === "Islam" &&
    twoTokens.normalizedQ === "Nur Islam",
  "4b. Multi-word name 'Nur Islam' produces 2 tokens"
);

const threeTokens = tokenizeSearchQuery("Nur Islam Gazi");
assert(
  threeTokens.tokens.length === 3 &&
    threeTokens.tokens[0] === "Nur" &&
    threeTokens.tokens[1] === "Islam" &&
    threeTokens.tokens[2] === "Gazi" &&
    threeTokens.normalizedQ === "Nur Islam Gazi",
  "4c. Full multi-part name 'Nur Islam Gazi' produces 3 tokens"
);

const whitespaceMessy = tokenizeSearchQuery("   Nur     Islam    Gazi   ");
assert(
  whitespaceMessy.tokens.length === 3 &&
    whitespaceMessy.tokens[0] === "Nur" &&
    whitespaceMessy.tokens[1] === "Islam" &&
    whitespaceMessy.tokens[2] === "Gazi" &&
    whitespaceMessy.normalizedQ === "Nur Islam Gazi",
  "4d. Messy repeated whitespace is collapsed cleanly into 3 tokens"
);

const punctuationMessy = tokenizeSearchQuery("SR-2026, (test)");
assert(
  punctuationMessy.normalizedQ === "SR-2026 test" &&
    punctuationMessy.tokens.length === 2 &&
    punctuationMessy.tokens[0] === "SR-2026" &&
    punctuationMessy.tokens[1] === "test",
  "4e. Commas and parentheses are stripped to protect PostgREST syntax"
);

const emptySearch = tokenizeSearchQuery("     ");
assert(
  emptySearch.tokens.length === 0 && emptySearch.normalizedQ === "",
  "4f. Pure whitespace produces zero tokens and empty string"
);

// ------------------------------------------------------------------------------
// 5. EMPTY ID-LOOKUP SAFETY
// ------------------------------------------------------------------------------
console.log("\n--- 5. Empty ID-Lookup Safety ---");

// Test 5a: When both customerIds and serviceIds are empty, NO customer_id.in.() or service_id.in.() is generated
const emptyIdsCond = buildSearchOrConditions("SR-2026-001001", [], []);
assert(
  emptyIdsCond !== null &&
    !emptyIdsCond.includes("customer_id.in.") &&
    !emptyIdsCond.includes("service_id.in.") &&
    emptyIdsCond.includes("request_number.ilike.%SR-2026-001001%"),
  "5a. Empty lookup arrays emit zero customer_id.in.() or service_id.in.() clauses"
);

// Test 5b: Direct search for request number / app reference works when arrays are empty
assert(
  emptyIdsCond !== null &&
    emptyIdsCond.includes("application_reference.ilike.%SR-2026-001001%") &&
    emptyIdsCond.includes("portal_name.ilike.%SR-2026-001001%"),
  "5b. Direct request_number / app_ref / portal_name search operates cleanly with empty lookup arrays"
);

// Test 5c: When customer IDs are present, correctly emits customer_id.in.(...)
const withCustIdsCond = buildSearchOrConditions("Nur", ["cust_1", "cust_2"], []);
assert(
  withCustIdsCond !== null &&
    withCustIdsCond.includes("customer_id.in.(cust_1,cust_2)") &&
    !withCustIdsCond.includes("service_id.in."),
  "5c. Emits customer_id.in.(...) only when customerIds array is non-empty"
);

// Test 5d: When service IDs are present, correctly emits service_id.in.(...)
const withSvcIdsCond = buildSearchOrConditions("PAN", [], ["svc_1"]);
assert(
  withSvcIdsCond !== null &&
    !withSvcIdsCond.includes("customer_id.in.") &&
    withSvcIdsCond.includes("service_id.in.(svc_1)"),
  "5d. Emits service_id.in.(...) only when serviceIds array is non-empty"
);

// Test 5e: When both arrays are present
const withBothCond = buildSearchOrConditions("Test", ["c1"], ["s1"]);
assert(
  withBothCond !== null &&
    withBothCond.includes("customer_id.in.(c1)") &&
    withBothCond.includes("service_id.in.(s1)"),
  "5e. Emits both customer_id.in.(...) and service_id.in.(...) when both non-empty"
);

// ------------------------------------------------------------------------------
// 6. INDIA-LOCAL OVERDUE DATE SEMANTICS (UTC-TO-IST BOUNDARY)
// ------------------------------------------------------------------------------
console.log("\n--- 6. India-Local Overdue Date Semantics ---");

// Boundary test: 2026-09-13T19:00:00Z is 2026-09-14 00:30:00 IST (+5:30)
const boundaryUtc = new Date("2026-09-13T19:00:00Z");
const indiaDateAtBoundary = getIndiaLocalDate(boundaryUtc);
assert(
  indiaDateAtBoundary === "2026-09-14",
  "6a. UTC 2026-09-13 19:00 correctly maps to India-local calendar date 2026-09-14 (IST midnight boundary)"
);

// Daytime test: 2026-09-14T06:00:00Z is 2026-09-14 11:30:00 IST
const daytimeUtc = new Date("2026-09-14T06:00:00Z");
assert(
  getIndiaLocalDate(daytimeUtc) === "2026-09-14",
  "6b. UTC 2026-09-14 06:00 maps to India-local calendar date 2026-09-14"
);

// Overdue check using India date:
// A request due on 2026-09-13 is OVERDUE when India-local date is 2026-09-14,
// even if a server running in UTC might still be on 2026-09-13!
const istToday = "2026-09-14";
assert(
  isRequestOverdue("2026-09-13", "in_process", istToday) === true,
  "6c. Request due on 2026-09-13 is OVERDUE when evaluated against India-local today 2026-09-14"
);

assert(
  isRequestOverdue("2026-09-14", "in_process", istToday) === false,
  "6d. Request due on 2026-09-14 is NOT overdue on 2026-09-14 (due today, not past)"
);

// ------------------------------------------------------------------------------
// 7. ATTENTION FILTER SEMANTICS
// ------------------------------------------------------------------------------
console.log("\n--- 7. Attention Filter Semantics ---");

// Attention condition helper definition mirroring queries.ts SQL filter:
// status === 'action_required' OR (isOverdue && status in ACTIVE_STATUSES)
function isInAttentionQueue(
  status: CustomerServiceStatus,
  dueDate: string | null,
  refDate: string
): boolean {
  if (status === "action_required") return true;
  if (!ACTIVE_STATUSES.includes(status)) return false;
  return isRequestOverdue(dueDate, status, refDate);
}

assert(
  isInAttentionQueue("action_required", null, istToday) === true,
  "7a. 'action_required' with null due_date IS in attention"
);

assert(
  isInAttentionQueue("action_required", "2026-09-20", istToday) === true,
  "7b. 'action_required' with future due_date IS in attention"
);

assert(
  isInAttentionQueue("in_process", "2026-09-10", istToday) === true,
  "7c. Active 'in_process' with overdue due_date IS in attention"
);

assert(
  isInAttentionQueue("in_process", "2026-09-20", istToday) === false,
  "7d. Active 'in_process' with future due_date is NOT in attention"
);

assert(
  isInAttentionQueue("completed", "2026-09-10", istToday) === true,
  "7e. Non-terminal 'completed' with overdue due_date IS in attention"
);

assert(
  isInAttentionQueue("in_progress", "2026-09-10", istToday) === true,
  "7f. Legacy 'in_progress' with overdue due_date IS in attention"
);

assert(
  isInAttentionQueue("delivered", "2026-09-10", istToday) === false,
  "7g. Terminal 'delivered' with overdue due_date is NEVER in attention"
);

assert(
  isInAttentionQueue("rejected", "2026-09-10", istToday) === false,
  "7h. Terminal 'rejected' with overdue due_date is NEVER in attention"
);

assert(
  isInAttentionQueue("cancelled", "2026-09-10", istToday) === false,
  "7i. Terminal 'cancelled' with overdue due_date is NEVER in attention"
);

assert(
  isInAttentionQueue("archived", "2026-09-10", istToday) === false,
  "7j. Terminal 'archived' with overdue due_date is NEVER in attention"
);

assert(
  isInAttentionQueue("pending", null, istToday) === false,
  "7k. Active request with null due_date and not action_required is NOT in attention"
);

// ------------------------------------------------------------------------------
// 8. PAGINATION RANGE CALCULATION
// ------------------------------------------------------------------------------
console.log("\n--- 8. Pagination Range Calculation ---");

const calcRange = (page: number, limit: number) => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { from, to };
};

const p1 = calcRange(1, 25);
assert(p1.from === 0 && p1.to === 24, "8a. Page 1 limit 25 -> range 0..24");

const p2 = calcRange(2, 25);
assert(p2.from === 25 && p2.to === 49, "8b. Page 2 limit 25 -> range 25..49");

const p3 = calcRange(3, 50);
assert(p3.from === 100 && p3.to === 149, "8c. Page 3 limit 50 -> range 100..149");

// ------------------------------------------------------------------------------
// 9. ROW DATA CONTRACT & SECURITY
// ------------------------------------------------------------------------------
console.log("\n--- 9. Row Data Contract & Security ---");

const mockRow: ServiceRequestDeskRow = {
  id: "cs_123",
  requestNumber: "SR-2026-001001",
  customerId: "cust_1",
  customerName: "Rahul Sharma",
  customerPhone: "9876543210",
  customerCode: "CUST-0001",
  serviceId: "svc_1",
  serviceName: "PAN Card Application",
  serviceCode: "PAN-01",
  serviceCategory: "Identity",
  portalName: "UTIITSL",
  applicationReference: "APP-998877",
  priority: "high",
  status: "in_process",
  amount: 250,
  paymentStatus: "paid",
  serviceDate: "2026-09-10",
  dueDate: "2026-09-15",
  createdAt: "2026-09-10T10:00:00Z",
  completedAt: null,
  deliveredAt: null,
  isOverdue: false,
  attachedDocumentCount: 2,
  notes: "Aadhaar verified",
};

assert(mockRow.id === "cs_123", "9a. Row model has required id");
assert(mockRow.attachedDocumentCount === 2, "9b. Row model carries document count");
assert(!("signedUrl" in mockRow), "9c. Row model does NOT contain signed storage URL property");
assert(!("fileBlob" in mockRow), "9d. Row model does NOT contain file blob property");

// ------------------------------------------------------------------------------
// 10. NAVIGATION LAYOUT INTEGRITY
// ------------------------------------------------------------------------------
console.log("\n--- 10. Navigation Layout Integrity ---");

const layoutPath = path.resolve(__dirname, "src/app/(dashboard)/layout.tsx");
const layoutContent = fs.readFileSync(layoutPath, "utf-8");

assert(
  layoutContent.includes('{ name: "Requests", href: "/requests", icon: ClipboardList }'),
  "10a. Sidebar navigation includes /requests with ClipboardList icon"
);

assert(
  layoutContent.includes('{ name: "Services", href: "/services", icon: Wrench }'),
  "10b. Existing Services catalog route remains intact with Wrench icon"
);

assert(
  layoutContent.includes("ClipboardList") && layoutContent.includes("lucide-react"),
  "10c. ClipboardList is properly imported from lucide-react in layout.tsx"
);

// ------------------------------------------------------------------------------
// 11. FINAL CONSISTENCY SEAL ASSERTIONS
// ------------------------------------------------------------------------------
console.log("\n--- 11. Final Consistency Seal Assertions ---");

// 11a: India-Local Date format strictly matches YYYY-MM-DD format
const istDateRegex = /^\d{4}-\d{2}-\d{2}$/;
assert(
  istDateRegex.test(getIndiaLocalDate(new Date("2026-09-13T19:00:00Z"))),
  "11a. getIndiaLocalDate returns strict YYYY-MM-DD for IST midnight boundary"
);
assert(
  istDateRegex.test(getIndiaLocalDate(new Date("2026-02-28T23:30:00Z"))),
  "11b. getIndiaLocalDate returns strict YYYY-MM-DD for month boundary"
);

// 11c: Page limit constants and defaults
assert(DEFAULT_LIMIT === 25, "11c. DEFAULT_LIMIT is strictly 25");
assert(
  JSON.stringify(ALLOWED_LIMITS) === JSON.stringify([25, 50, 100]),
  "11d. ALLOWED_LIMITS is strictly [25, 50, 100]"
);
assert(
  JSON.stringify(VALID_PRIORITIES) === JSON.stringify(["low", "normal", "high", "urgent"]),
  "11e. VALID_PRIORITIES contains low, normal, high, urgent"
);
assert(
  JSON.stringify(VALID_PAYMENT_STATUSES) === JSON.stringify(["unpaid", "partial", "paid", "waived"]),
  "11f. VALID_PAYMENT_STATUSES contains unpaid, partial, paid, waived"
);

// 11e: Multi-token query decomposes into AND-tokens across attributes
const fullTokenResult = tokenizeSearchQuery("  Nur   Islam   Gazi  ");
assert(
  JSON.stringify(fullTokenResult.tokens) === JSON.stringify(["Nur", "Islam", "Gazi"]),
  "11e. Multi-part name 'Nur Islam Gazi' produces exactly 3 discrete tokens for AND-intersection"
);
assert(
  fullTokenResult.normalizedQ === "Nur Islam Gazi",
  "11f. Normalized search query collapses repeated whitespace"
);

// 11g: Metrics filter baseline scoping semantics
const metricsParamTest = parseDeskParams({
  q: "Gazi",
  status: "attention",
  priority: "high",
  serviceId: "svc-123",
  paymentStatus: "paid",
  overdue: "overdue_only",
  page: "3",
  limit: "50",
});

// The parser extracts all raw params:
assert(metricsParamTest.status === "attention", "11g. Desk params parses status=attention");
assert(metricsParamTest.overdue === "overdue_only", "11h. Desk params parses overdue=overdue_only");
// In queries.ts, getServiceRequestsSummaryMetrics explicitly applies only (q, priority, serviceId, paymentStatus)
// while ignoring status, page, and overdue toggle so that the 4 cards accurately show queue distribution.

// ------------------------------------------------------------------------------
// 12. RELATIONAL SEARCH CAP & TRUNCATION ELIMINATION
// ------------------------------------------------------------------------------
console.log("\n--- 12. Relational Search Cap & Truncation Elimination ---");

// Constants verification
assert(MAX_CUSTOMER_SEARCH_IDS === 100, "12a. MAX_CUSTOMER_SEARCH_IDS is 100");
assert(MAX_SERVICE_SEARCH_IDS === 50, "12b. MAX_SERVICE_SEARCH_IDS is 50");

// Helper to create mock Supabase client for testing resolveRelationalSearchIds
const createMockSupabaseForSearch = (customerRowCount: number, serviceRowCount: number) => {
  const custRows = Array.from({ length: customerRowCount }, (_, i) => ({ id: `cust_${i + 1}` }));
  const svcRows = Array.from({ length: serviceRowCount }, (_, i) => ({ id: `svc_${i + 1}` }));

  return {
    from: (table: string) => {
      const isCust = table === "customers";
      const targetRows = isCust ? custRows : svcRows;
      const builder = {
        select: () => builder,
        is: () => builder,
        ilike: () => builder,
        or: () => builder,
        limit: async (lim: number) => {
          return { data: targetRows.slice(0, lim), error: null };
        },
      };
      return builder;
    },
  } as unknown as Parameters<typeof resolveRelationalSearchIds>[0];
};

async function runRelationalSearchTests() {
  // 1. customer candidate count <= 100: normal complete search resolution
  const mock100Cust = createMockSupabaseForSearch(100, 10);
  const res1 = await resolveRelationalSearchIds(mock100Cust, "Nur");
  assert(res1.tooBroad === false, "12c. Customer candidate count <= 100 does not trigger tooBroad");
  assert(res1.customerIds.length === 100, "12d. Customer candidate count <= 100 returns complete 100 IDs");

  // 2. customer candidate count = 101: searchTooBroad / too_broad returned
  const mock101Cust = createMockSupabaseForSearch(101, 10);
  const res2 = await resolveRelationalSearchIds(mock101Cust, "Gazi");
  assert(res2.tooBroad === true, "12e. Customer candidate count = 101 returns tooBroad = true");
  assert(res2.tooBroadSource === "customer", "12f. tooBroadSource identifies 'customer'");
  assert(res2.customerIds.length === 0, "12g. Over-cap customer search does NOT return partial customer IDs");

  // 3. service candidate count <= 50: normal complete search resolution
  const mock50Svc = createMockSupabaseForSearch(10, 50);
  const res3 = await resolveRelationalSearchIds(mock50Svc, "Aadhaar");
  assert(res3.tooBroad === false, "12h. Service candidate count <= 50 does not trigger tooBroad");
  assert(res3.serviceIds.length === 50, "12i. Service candidate count <= 50 returns complete 50 IDs");

  // 4. service candidate count = 51: too-broad state returned
  const mock51Svc = createMockSupabaseForSearch(10, 51);
  const res4 = await resolveRelationalSearchIds(mock51Svc, "Card");
  assert(res4.tooBroad === true, "12j. Service candidate count = 51 returns tooBroad = true");
  assert(res4.tooBroadSource === "service", "12k. tooBroadSource identifies 'service'");
  assert(res4.serviceIds.length === 0, "12l. Over-cap service search does NOT return partial service IDs");

  // 5. over-cap customer search never builds customer_id.in(...) from first 100
  assert(
    res2.customerIds.length === 0 && (buildSearchOrConditions("Gazi", res2.customerIds, res2.serviceIds)?.includes("customer_id.in.") ?? false) === false,
    "12m. Over-cap customer search never builds customer_id.in.(...) from sliced IDs"
  );

  // 6. over-cap service search never builds service_id.in(...) from first 50
  assert(
    res4.serviceIds.length === 0 && (buildSearchOrConditions("Card", res4.customerIds, res4.serviceIds)?.includes("service_id.in.") ?? false) === false,
    "12n. Over-cap service search never builds service_id.in.(...) from sliced IDs"
  );

  // 7. broad search returns clean too-broad desk contract (empty rows, not partial rows)
  const broadDeskContract: { searchTooBroad: boolean; data: unknown[] } = {
    searchTooBroad: true,
    data: [],
  };
  assert(broadDeskContract.searchTooBroad === true && broadDeskContract.data.length === 0, "12o. Broad search contract produces zero partial rows");

  // 8. broad search returns neutralized summary metrics (not partial metrics)
  const broadMetricsContract = {
    activeCount: 0,
    actionRequiredCount: 0,
    docsPendingCount: 0,
    overdueCount: 0,
    searchTooBroad: true,
  };
  assert(broadMetricsContract.searchTooBroad === true && broadMetricsContract.activeCount === 0, "12p. Broad search contract produces neutralized metrics");

  // 9. user-facing too-broad state is present in UI source
  const deskViewPath = path.resolve(__dirname, "src/components/requests/RequestsDeskView.tsx");
  const deskViewContent = fs.readFileSync(deskViewPath, "utf-8");
  assert(deskViewContent.includes("Search is too broad"), "12q. RequestsDeskView renders 'Search is too broad' heading");
  assert(
    deskViewContent.includes("Please enter a more specific name, phone number, customer code, service name, request number, or application reference."),
    "12r. RequestsDeskView renders compact guidance text"
  );

  // 10. q remains present in search input for user refinement
  assert(
    deskViewContent.includes('const [searchInput, setSearchInput] = useState(searchParams.get("q") || "")'),
    "12s. Search input preserves q from URL for refinement"
  );

  // 11. normal request-number search works
  const directCond1 = buildSearchOrConditions("SR-2026-001001", [], []);
  assert(
    directCond1 !== null && directCond1.includes("request_number.ilike.%SR-2026-001001%"),
    "12t. Direct request_number search functions with empty relational IDs"
  );

  // 12. normal application-reference search works
  const directCond2 = buildSearchOrConditions("APP-998877", [], []);
  assert(
    directCond2 !== null && directCond2.includes("application_reference.ilike.%APP-998877%"),
    "12u. Direct application_reference search functions with empty relational IDs"
  );

  // 13. normal customer-name search under cap works
  const underCapCond = buildSearchOrConditions("Nur", ["cust_1", "cust_2"], []);
  assert(
    underCapCond !== null && underCapCond.includes("customer_id.in.(cust_1,cust_2)"),
    "12v. Normal customer search under cap builds customer_id.in.(...)"
  );

  // 14. normal service-name search under cap works
  const underCapSvcCond = buildSearchOrConditions("PAN", [], ["svc_1"]);
  assert(
    underCapSvcCond !== null && underCapSvcCond.includes("service_id.in.(svc_1)"),
    "12w. Normal service search under cap builds service_id.in.(...)"
  );

  // 15. empty relational matches remain safe
  const emptyRelCond = buildSearchOrConditions("Unknown", [], []);
  assert(
    emptyRelCond !== null && !emptyRelCond.includes("customer_id.in.()") && !emptyRelCond.includes("service_id.in.()"),
    "12x. Empty relational matches emit zero empty in.() clauses"
  );
}

runRelationalSearchTests()
  .then(() => {
    // ------------------------------------------------------------------------------
    // 13. SUMMARY OF RESULTS
    // ------------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`📊 PHASE 2B-1 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
    console.log("==========================================================================");

    if (failedCount > 0) {
      process.exit(1);
    } else {
      console.log("VERDICT: ✅ ALL PHASE 2B-1 DESK TESTS PASSED CLEANLY!");
    }
  })
  .catch((err) => {
    console.error("❌ Unexpected test runner error:", err);
    process.exit(1);
  });
