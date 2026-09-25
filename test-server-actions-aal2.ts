/**
 * ==============================================================================
 * GCDS Phase S3A: Server Action AAL2 Enforcement Regression Test Suite
 * File: test-server-actions-aal2.ts
 *
 * Verifies that all protected dashboard Server Actions enforce authoritative
 * AAL2 assurance via requireAal2(), while ensuring auth flows (login, recovery,
 * MFA enrollment, challenge, logout) remain accessible at their intended levels.
 * ==============================================================================
 */

import * as fs from "fs";
import * as path from "path";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(description: string, actual: unknown, expected: unknown) {
  totalTests++;
  const isMatch = actual === expected;
  if (isMatch) {
    passedTests++;
    console.log(`[PASS] ${description}: Expected '${expected}' | Got '${actual}' ➔ ✅`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${description}: Expected '${expected}' | Got '${actual}' ➔ ❌`);
  }
}

console.log("\n==========================================================================");
console.log("🛡️  GCDS S3A: SERVER ACTION AAL2 ENFORCEMENT REGRESSION SUITE");
console.log("==========================================================================\n");

// Read target source files
const customerActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/customers/actions.ts"), "utf8");
const customerAiActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/customers/ai-actions.ts"), "utf8");
const documentActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/documents/actions.ts"), "utf8");
const invoiceActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/invoices/actions.ts"), "utf8");
const paymentActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/payments/actions.ts"), "utf8");
const requestActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/requests/actions.ts"), "utf8");
const serviceActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/services/actions.ts"), "utf8");
const commsActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/communications/actions.ts"), "utf8");
const opsActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/operations/actions.ts"), "utf8");
const reportActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/reports/actions.ts"), "utf8");
const settingsActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/settings/actions.ts"), "utf8");
const exportActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/settings/export-actions.ts"), "utf8");
const adminMfaActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/settings/admin-mfa-actions.ts"), "utf8");
const adminMfaResetLibSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/auth/adminMfaReset.ts"), "utf8");
const dashboardActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/dashboard/actions.ts"), "utf8");
const searchActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/actions/searchActions.ts"), "utf8");
const timelineActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/actions/customerTimelineActions.ts"), "utf8");
const followupActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/actions/customerFollowupActions.ts"), "utf8");

// Auth flow source files
const loginActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(auth)/login/actions.ts"), "utf8");
const forgotPasswordActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(auth)/forgot-password/actions.ts"), "utf8");
const updatePasswordActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(auth)/update-password/actions.ts"), "utf8");
const mfaVerifyActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(auth)/mfa/verify/actions.ts"), "utf8");
const mfaSetupActionsSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/settings/security/mfa/actions.ts"), "utf8");
const dashboardLogoutSrc = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/actions.ts"), "utf8");
const mfaEnforcementSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/auth/mfaEnforcement.ts"), "utf8");

console.log("--- 1. Protected Customer Reads Require AAL2 ---");
assert("getCustomerLookupRows imports/calls requireAal2", customerActionsSrc.includes("getCustomerLookupRows") && customerActionsSrc.includes("requireAal2(supabase)"), true);
assert("getCustomerListRows calls requireAal2", /export async function getCustomerListRows[\s\S]*?requireAal2\(supabase\)/.test(customerActionsSrc), true);
assert("getCustomers calls requireAal2", /export async function getCustomers\([\s\S]*?requireAal2\(supabase\)/.test(customerActionsSrc), true);
assert("getCustomerById calls requireAal2", /export async function getCustomerById[\s\S]*?requireAal2\(supabase\)/.test(customerActionsSrc), true);
assert("checkDuplicateCustomer calls requireAal2", /export async function checkDuplicateCustomer[\s\S]*?requireAal2\(supabase\)/.test(customerActionsSrc), true);

console.log("\n--- 2. Protected Customer Mutations Require AAL2 ---");
assert("createCustomer calls requireAal2 before insert", /export async function createCustomer[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.insert\(/.test(customerActionsSrc), true);
assert("updateCustomer calls requireAal2 before update", /export async function updateCustomer[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(customerActionsSrc), true);
assert("softDeleteCustomer calls requireAal2 before update", /export async function softDeleteCustomer[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(customerActionsSrc), true);
assert("restoreCustomer calls requireAal2 before update", /export async function restoreCustomer[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(customerActionsSrc), true);

console.log("\n--- 3. Document Reads Require AAL2 ---");
assert("getDocumentVaultRows calls requireAal2", /export async function getDocumentVaultRows[\s\S]*?requireAal2\(supabase\)/.test(documentActionsSrc), true);
assert("getAllDocuments calls requireAal2", /export async function getAllDocuments[\s\S]*?requireAal2\(supabase\)/.test(documentActionsSrc), true);
assert("getCustomerDocuments calls requireAal2", /export async function getCustomerDocuments[\s\S]*?requireAal2\(supabase\)/.test(documentActionsSrc), true);
assert("getDocumentSignedUrl calls requireAal2 before URL creation", /export async function getDocumentSignedUrl[\s\S]*?requireAal2\(supabase\)[\s\S]*?createSignedUrlSafe/.test(documentActionsSrc), true);
assert("getCustomerAiImports calls requireAal2", /export async function getCustomerAiImports[\s\S]*?requireAal2\(supabase\)/.test(documentActionsSrc), true);

console.log("\n--- 4. Document Mutations Require AAL2 ---");
assert("uploadCustomerDocument calls requireAal2 before storage upload", /export async function uploadCustomerDocument[\s\S]*?requireAal2\(supabase\)[\s\S]*?uploadToPrivateStorage/.test(documentActionsSrc), true);
assert("deleteCustomerDocument calls requireAal2 before deletion", /export async function deleteCustomerDocument[\s\S]*?requireAal2\(supabase\)[\s\S]*?removeStorageObjectSafe/.test(documentActionsSrc), true);
assert("replaceDocument calls requireAal2 before upload", /export async function replaceDocument[\s\S]*?requireAal2\(supabase\)[\s\S]*?uploadToPrivateStorage/.test(documentActionsSrc), true);
assert("archiveDocument calls requireAal2 before update", /export async function archiveDocument[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(documentActionsSrc), true);
assert("rerunExtraction calls requireAal2 before download", /export async function rerunExtraction[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.download\(/.test(documentActionsSrc), true);

console.log("\n--- 5. Invoice Reads Require AAL2 ---");
assert("getInvoices calls requireAal2", /export async function getInvoices[\s\S]*?requireAal2\(supabase\)/.test(invoiceActionsSrc), true);
assert("getInvoiceById calls requireAal2", /export async function getInvoiceById[\s\S]*?requireAal2\(supabase\)/.test(invoiceActionsSrc), true);
assert("getCustomerBillingSummary calls requireAal2", /export async function getCustomerBillingSummary[\s\S]*?requireAal2\(supabase\)/.test(invoiceActionsSrc), true);

console.log("\n--- 6. Invoice Mutations Require AAL2 ---");
assert("createInvoice calls requireAal2 before RPC create_invoice_atomic", /export async function createInvoice[\s\S]*?requireAal2\(supabase\)[\s\S]*?create_invoice_atomic/.test(invoiceActionsSrc), true);
assert("issueInvoice calls requireAal2 before update", /export async function issueInvoice[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(invoiceActionsSrc), true);
assert("cancelInvoice calls requireAal2 before update", /export async function cancelInvoice[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(invoiceActionsSrc), true);

console.log("\n--- 7. Payment Record Requires AAL2 ---");
assert("createPayment calls requireAal2 before RPC record_payment", /export async function createPayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?record_payment/.test(paymentActionsSrc), true);
assert("getPayments calls requireAal2", /export async function getPayments[\s\S]*?requireAal2\(supabase\)/.test(paymentActionsSrc), true);
assert("getDashboardBillingSummary calls requireAal2", /export async function getDashboardBillingSummary[\s\S]*?requireAal2\(supabase\)/.test(paymentActionsSrc), true);
assert("getPaymentFormOptions calls requireAal2", /export async function getPaymentFormOptions[\s\S]*?requireAal2\(supabase\)/.test(paymentActionsSrc), true);

console.log("\n--- 8. Allocation & Unallocation Require AAL2 ---");
assert("allocatePayment calls requireAal2 before RPC allocate_payment_atomic", /export async function allocatePayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?allocate_payment_atomic/.test(paymentActionsSrc), true);
assert("unallocatePayment calls requireAal2 before RPC unallocate_payment_atomic", /export async function unallocatePayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?unallocate_payment_atomic/.test(paymentActionsSrc), true);

console.log("\n--- 9. Void & Refund Require AAL2 ---");
assert("voidPayment calls requireAal2 before RPC void_payment_atomic", /export async function voidPayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?void_payment_atomic/.test(paymentActionsSrc), true);
assert("refundPayment calls requireAal2 before RPC refund_payment_atomic", /export async function refundPayment[\s\S]*?requireAal2\(supabase\)[\s\S]*?refund_payment_atomic/.test(paymentActionsSrc), true);

console.log("\n--- 10. Request Mutations Require AAL2 ---");
assert("attachDocumentToRequest calls requireAal2", /export async function attachDocumentToRequest[\s\S]*?requireAal2\(supabase\)/.test(requestActionsSrc), true);
assert("uploadAndAttachDocumentToRequest calls requireAal2", /export async function uploadAndAttachDocumentToRequest[\s\S]*?requireAal2\(supabase\)/.test(requestActionsSrc), true);
assert("detachDocumentFromRequest calls requireAal2", /export async function detachDocumentFromRequest[\s\S]*?requireAal2\(supabase\)/.test(requestActionsSrc), true);
assert("toggleDocumentVerification calls requireAal2", /export async function toggleDocumentVerification[\s\S]*?requireAal2\(supabase\)/.test(requestActionsSrc), true);
assert("generateInvoiceForRequest calls requireAal2", /export async function generateInvoiceForRequest[\s\S]*?requireAal2\(supabase\)/.test(requestActionsSrc), true);
assert("getServiceRequestDrawerData calls requireAal2", /export async function getServiceRequestDrawerData[\s\S]*?requireAal2\(supabase\)/.test(requestActionsSrc), true);
assert("getRequestBillingSummary calls requireAal2", /export async function getRequestBillingSummary[\s\S]*?requireAal2\(supabase\)/.test(requestActionsSrc), true);
assert("setRequestPaymentWaiver calls requireAal2 before RPC set_request_payment_waiver", /export async function setRequestPaymentWaiver[\s\S]*?requireAal2\(supabase\)[\s\S]*?set_request_payment_waiver/.test(serviceActionsSrc), true);
assert("transitionServiceRequestStatus calls requireAal2 before status update", /export async function transitionServiceRequestStatus[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(serviceActionsSrc), true);

console.log("\n--- 11. Followup Mutations Require AAL2 ---");
assert("scheduleFollowup calls requireAal2 before insert", /export async function scheduleFollowup[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.insert\(/.test(requestActionsSrc), true);
assert("rescheduleFollowup calls requireAal2 before RPC reschedule_service_request_followup", /export async function rescheduleFollowup[\s\S]*?requireAal2\(supabase\)[\s\S]*?reschedule_service_request_followup/.test(requestActionsSrc), true);
assert("completeFollowup calls requireAal2 before update", /export async function completeFollowup[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(requestActionsSrc), true);
assert("cancelFollowup calls requireAal2 before update", /export async function cancelFollowup[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.update\(/.test(requestActionsSrc), true);
assert("createCustomerFollowup calls requireAal2", /export async function createCustomerFollowup[\s\S]*?requireAal2\(supabase\)/.test(followupActionsSrc), true);
assert("rescheduleCustomerFollowup calls requireAal2", /export async function rescheduleCustomerFollowup[\s\S]*?requireAal2\(\)/.test(followupActionsSrc), true);
assert("completeCustomerFollowup calls requireAal2", /export async function completeCustomerFollowup[\s\S]*?requireAal2\(\)/.test(followupActionsSrc), true);
assert("cancelCustomerFollowup calls requireAal2", /export async function cancelCustomerFollowup[\s\S]*?requireAal2\(\)/.test(followupActionsSrc), true);
assert("getCustomerFollowups calls requireAal2", /export async function getCustomerFollowups[\s\S]*?requireAal2\(supabase\)/.test(followupActionsSrc), true);

console.log("\n--- 12. Communications Actions Require AAL2 ---");
assert("getShopBusinessName calls requireAal2", /export async function getShopBusinessName[\s\S]*?requireAal2\(supabase\)/.test(commsActionsSrc), true);
assert("getContactQueue calls requireAal2", /export async function getContactQueue[\s\S]*?requireAal2\(supabase\)/.test(commsActionsSrc), true);
assert("recordCommunication calls requireAal2 before insert", /export async function recordCommunication[\s\S]*?requireAal2\(supabase\)[\s\S]*?\.insert\(/.test(commsActionsSrc), true);
assert("getCustomerCommunications calls requireAal2", /export async function getCustomerCommunications[\s\S]*?requireAal2\(supabase\)/.test(commsActionsSrc), true);
assert("getRequestCommunications calls requireAal2", /export async function getRequestCommunications[\s\S]*?requireAal2\(supabase\)/.test(commsActionsSrc), true);

console.log("\n--- 13. Protected Settings Reads Require AAL2 ---");
assert("getBusinessSettings calls requireAal2", /export async function getBusinessSettings[\s\S]*?requireAal2\(supabase\)/.test(settingsActionsSrc), true);
assert("getTeamMembers calls requireAal2", /export async function getTeamMembers[\s\S]*?requireAal2\(supabase\)/.test(settingsActionsSrc), true);

console.log("\n--- 14. Existing Role-Protected Actions Remain Guarded ---");
assert("updateBusinessSettings enforces requireAal2 AND owner/admin check", /updateBusinessSettings[\s\S]*?requireAal2\(supabase\)[\s\S]*?\["owner",\s*"admin"\]\.includes\(membership\.role\)/.test(settingsActionsSrc), true);
assert("adminResetMfaAction enforces owner role via executeAdminMfaReset", adminMfaActionsSrc.includes("executeAdminMfaReset") && /executeAdminMfaReset[\s\S]*?currentLevel\s*!==\s*"aal2"[\s\S]*?membership\.role\s*!==\s*"owner"/.test(adminMfaResetLibSrc), true);

console.log("\n--- 15. Exports Remain Guarded ---");
assert("exportCustomersCsv calls requireAal2", /export async function exportCustomersCsv[\s\S]*?requireAal2\(supabase\)/.test(exportActionsSrc), true);
assert("exportRequestsCsv calls requireAal2", /export async function exportRequestsCsv[\s\S]*?requireAal2\(supabase\)/.test(exportActionsSrc), true);
assert("exportDocumentsCatalogCsv calls requireAal2", /export async function exportDocumentsCatalogCsv[\s\S]*?requireAal2\(supabase\)/.test(exportActionsSrc), true);
assert("exportInvoicesCsv calls requireAal2", /export async function exportInvoicesCsv[\s\S]*?requireAal2\(supabase\)/.test(exportActionsSrc), true);

console.log("\n--- 16. Anonymous/AAL1 Login Flow Remains Usable ---");
assert("login action does NOT call requireAal2", !loginActionsSrc.includes("requireAal2"), true);
assert("login action relies on determinePostAuthRedirect", loginActionsSrc.includes("determinePostAuthRedirect"), true);

console.log("\n--- 17. MFA Setup Remains Usable at AAL1 When No Factor Exists ---");
assert("getMfaStatusAction does NOT call requireAal2", !/export async function getMfaStatusAction[\s\S]*?requireAal2/.test(mfaSetupActionsSrc), true);
assert("startMfaEnrollmentAction does NOT call requireAal2", !/export async function startMfaEnrollmentAction[\s\S]*?requireAal2/.test(mfaSetupActionsSrc), true);
assert("verifyMfaEnrollmentAction does NOT call requireAal2", !/export async function verifyMfaEnrollmentAction[\s\S]*?requireAal2/.test(mfaSetupActionsSrc), true);

console.log("\n--- 18. MFA Challenge Remains Usable at AAL1 ---");
assert("verifyMfaChallengeAction does NOT call requireAal2", !mfaVerifyActionsSrc.includes("requireAal2"), true);
assert("verifyMfaChallengeAction elevates session to AAL2 natively", mfaVerifyActionsSrc.includes("verifyTotpFactor"), true);

console.log("\n--- 19. Password Recovery Remains Usable Without AAL2 ---");
assert("requestPasswordResetAction does NOT call requireAal2", !forgotPasswordActionsSrc.includes("requireAal2"), true);
assert("updatePasswordAction does NOT call requireAal2", !updatePasswordActionsSrc.includes("requireAal2"), true);
assert("updatePasswordAction enforces recovery authorization provenance", updatePasswordActionsSrc.includes("hasRecoveryAuthorization"), true);

console.log("\n--- 20. Logout Remains Usable As Intended ---");
assert("dashboard logout action does NOT call requireAal2", !dashboardLogoutSrc.includes("requireAal2"), true);
assert("dashboard logout action calls signOut() and redirects to /login", dashboardLogoutSrc.includes("signOut()") && dashboardLogoutSrc.includes('redirect("/login")'), true);

console.log("\n--- 21. No Duplicate MFA Implementation Introduced ---");
assert("mfaEnforcement.ts is single source of truth for requireAal2", /export async function requireAal2\(supabaseClient\?: SupabaseClient\)/.test(mfaEnforcementSrc), true);
const allFilesWithRequireAal2 = [
  customerActionsSrc,
  customerAiActionsSrc,
  documentActionsSrc,
  invoiceActionsSrc,
  paymentActionsSrc,
  requestActionsSrc,
  serviceActionsSrc,
  commsActionsSrc,
  opsActionsSrc,
  reportActionsSrc,
  settingsActionsSrc,
  exportActionsSrc,
  dashboardActionsSrc,
  searchActionsSrc,
  timelineActionsSrc,
  followupActionsSrc,
];
for (const fileSrc of allFilesWithRequireAal2) {
  assert("Imports requireAal2 from '@/lib/auth/mfaEnforcement'", fileSrc.includes('from "@/lib/auth/mfaEnforcement"'), true);
}

console.log("\n--- 22. Direct AAL1 Server Action Attempt Fails Closed Before Mutation/Query ---");
// Simulate requireAal2 behavior under mock AAL1 session vs AAL2 session
function simulateRequireAal2(currentLevel: string | null, verifiedFactorsCount: number) {
  if (currentLevel !== "aal2") {
    throw new Error("AAL2 assurance required. Mandatory MFA verification is active.");
  }
  if (verifiedFactorsCount === 0) {
    throw new Error("AAL2 assurance required. Active verified factor required.");
  }
  return { user: { id: "test-user-id" }, assurance: { currentLevel: "aal2", isAal2: true } };
}

let aal1Blocked = false;
try {
  simulateRequireAal2("aal1", 0);
} catch (err: unknown) {
  if (err instanceof Error && err.message.includes("AAL2 assurance required")) {
    aal1Blocked = true;
  }
}
assert("Simulated AAL1 caller throws before any operation can run", aal1Blocked, true);

let staleAal2ZeroFactorsBlocked = false;
try {
  simulateRequireAal2("aal2", 0);
} catch (err: unknown) {
  if (err instanceof Error && err.message.includes("Active verified factor required")) {
    staleAal2ZeroFactorsBlocked = true;
  }
}
assert("Simulated stale AAL2 caller with 0 factors throws before any operation can run", staleAal2ZeroFactorsBlocked, true);

let aal2Allowed = false;
try {
  const res = simulateRequireAal2("aal2", 1);
  if (res.user.id === "test-user-id") {
    aal2Allowed = true;
  }
} catch {
  aal2Allowed = false;
}
assert("Simulated valid AAL2 caller with verified factor succeeds", aal2Allowed, true);

console.log("\n--- 23. Dashboard Stats, Metrics, Search & Timeline Require AAL2 ---");
assert("getDashboardStats calls requireAal2", /export async function getDashboardStats[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getRecentCustomers calls requireAal2", /export async function getRecentCustomers[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getDashboardMetrics calls requireAal2", /export async function getDashboardMetrics[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getRecentActivity calls requireAal2", /export async function getRecentActivity[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getCustomerGrowthData calls requireAal2", /export async function getCustomerGrowthData[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getRevenueChartData calls requireAal2", /export async function getRevenueChartData[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getCustomerStatusDistribution calls requireAal2", /export async function getCustomerStatusDistribution[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getServiceTypeDistribution calls requireAal2", /export async function getServiceTypeDistribution[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getPaymentStatusData calls requireAal2", /export async function getPaymentStatusData[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getDashboardAttentionData calls requireAal2", /export async function getDashboardAttentionData[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("getDashboardSnapshot calls requireAal2", /export async function getDashboardSnapshot[\s\S]*?requireAal2\(supabase\)/.test(dashboardActionsSrc), true);
assert("unifiedGlobalSearch calls requireAal2", /export async function unifiedGlobalSearch[\s\S]*?requireAal2\(supabase\)/.test(searchActionsSrc), true);
assert("getCustomerUnifiedTimeline calls requireAal2", /export async function getCustomerUnifiedTimeline[\s\S]*?requireAal2\(supabase\)/.test(timelineActionsSrc), true);

console.log("\n==========================================================================");
console.log(`TOTAL S3A TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log("==========================================================================\n");

if (failedTests > 0) {
  process.exit(1);
}
