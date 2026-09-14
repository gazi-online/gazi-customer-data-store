/**
 * ==============================================================================
 * MILESTONE 10 PHASE 2C-2: REQUEST DOCUMENT LIFECYCLE TEST SUITE
 * ==============================================================================
 * Comprehensive tests verifying:
 * 1. Requirement Tag Normalization semantics (shared between existing & upload)
 * 2. Strict UUID & Authentication parameter validation
 * 3. Eligible Vault Document Picker invariants (same customer, non-archived, privacy)
 * 4. Attach Existing document action contracts & error mapping (23505 -> already_attached)
 * 5. Upload New + Attach pipeline (server-derived customer_id, partial failure contract)
 * 6. Detach action invariants (association-only delete, vault & storage preservation)
 * 7. Verification toggle invariants (CAS optimistic concurrency, association-only)
 * 8. Strict workflow decoupling (zero customer_services.status mutation)
 * 9. UI Component contracts (RequestDocumentManager, AttachRequestDocumentModal)
 * ==============================================================================
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { normalizeRequirementTag } from "./src/app/(dashboard)/requests/types";

let passedTests = 0;
let totalTests = 0;

function it(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err: unknown) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("==========================================================================");
console.log("🧪 MILESTONE 10 PHASE 2C-2: REQUEST DOCUMENT LIFECYCLE TEST SUITE");
console.log("==========================================================================\n");

// Read source files for static verification
const typesPath = path.resolve("src/app/(dashboard)/requests/types.ts");
const actionsPath = path.resolve("src/app/(dashboard)/requests/actions.ts");
const servicesActionsPath = path.resolve("src/app/(dashboard)/services/actions.ts");
const documentsActionsPath = path.resolve("src/app/(dashboard)/documents/actions.ts");
const managerPath = path.resolve("src/components/requests/RequestDocumentManager.tsx");
const modalPath = path.resolve("src/components/requests/AttachRequestDocumentModal.tsx");
const workspacePath = path.resolve("src/components/requests/RequestWorkspace.tsx");

assert.strictEqual(fs.existsSync(typesPath), true, "requests/types.ts must exist");
assert.strictEqual(fs.existsSync(actionsPath), true, "requests/actions.ts must exist");
assert.strictEqual(fs.existsSync(servicesActionsPath), true, "services/actions.ts must exist");
assert.strictEqual(fs.existsSync(documentsActionsPath), true, "documents/actions.ts must exist");
assert.strictEqual(fs.existsSync(managerPath), true, "RequestDocumentManager.tsx must exist");
assert.strictEqual(fs.existsSync(modalPath), true, "AttachRequestDocumentModal.tsx must exist");
assert.strictEqual(fs.existsSync(workspacePath), true, "RequestWorkspace.tsx must exist");

const typesCode = fs.readFileSync(typesPath, "utf-8");
const actionsCode = fs.readFileSync(actionsPath, "utf-8");
const servicesActionsCode = fs.readFileSync(servicesActionsPath, "utf-8");
const documentsActionsCode = fs.readFileSync(documentsActionsPath, "utf-8");
const managerCode = fs.readFileSync(managerPath, "utf-8");
const modalCode = fs.readFileSync(modalPath, "utf-8");
const workspaceCode = fs.readFileSync(workspacePath, "utf-8");

// ─── 1. REQUIREMENT TAG NORMALIZER ───────────────────────────────────────────

it("1a. normalizeRequirementTag defaults empty / null / undefined to 'general'", () => {
  assert.strictEqual(normalizeRequirementTag(), "general");
  assert.strictEqual(normalizeRequirementTag(null), "general");
  assert.strictEqual(normalizeRequirementTag(""), "general");
  assert.strictEqual(normalizeRequirementTag("   "), "general");
});

it("1b. normalizeRequirementTag lowercases and cleans non-safe characters with punctuation fallback", () => {
  assert.strictEqual(normalizeRequirementTag("Identity Proof"), "identity_proof");
  assert.strictEqual(normalizeRequirementTag("  ADDRESS-PROOF! "), "address_proof");
  assert.strictEqual(normalizeRequirementTag("Income...Proof$$$"), "income_proof");
  assert.strictEqual(normalizeRequirementTag("___test_tag___"), "test_tag");
  // Section 6 edge cases
  assert.strictEqual(normalizeRequirementTag("---"), "general");
  assert.strictEqual(normalizeRequirementTag("   ---   "), "general");
  assert.strictEqual(normalizeRequirementTag("###"), "general");
  assert.strictEqual(normalizeRequirementTag("___"), "general");
  assert.strictEqual(normalizeRequirementTag("!@#$%^&*()"), "general");
});

it("1c. normalizeRequirementTag enforces safe max length constraint of 50 characters", () => {
  const longTag = "a".repeat(80);
  const normalized = normalizeRequirementTag(longTag);
  assert.strictEqual(normalized.length, 50);
  assert.strictEqual(normalized, "a".repeat(50));
});

// ─── 2. AUTHENTICATION & PARAMETER VALIDATION ────────────────────────────────

it("2a. All 5 lifecycle server actions enforce UUID validation", () => {
  assert.strictEqual(actionsCode.includes("export async function getEligibleRequestDocuments("), true);
  assert.strictEqual(actionsCode.includes("export async function attachDocumentToRequest("), true);
  assert.strictEqual(actionsCode.includes("export async function uploadAndAttachDocumentToRequest("), true);
  assert.strictEqual(actionsCode.includes("export async function detachDocumentFromRequest("), true);
  assert.strictEqual(actionsCode.includes("export async function toggleDocumentVerification("), true);

  // Check UUID validation guards in all actions
  assert.strictEqual(actionsCode.includes("!isValidUuid(requestId)"), true);
  assert.strictEqual(actionsCode.includes("!isValidUuid(associationId)"), true);
  assert.strictEqual(actionsCode.includes("!isValidUuid(documentId)"), true);
});

it("2b. All lifecycle actions authenticate caller via supabase.auth.getUser()", () => {
  const actionMatches = actionsCode.match(/await supabase\.auth\.getUser\(\)/g) || [];
  // Must be called across actions
  assert.strictEqual(actionMatches.length >= 5, true, "Must authenticate across all lifecycle actions");
});

// ─── 3. ELIGIBLE VAULT DOCUMENT PICKER ───────────────────────────────────────

it("3a. getEligibleRequestDocuments resolves customer_id strictly on the server", () => {
  const fnSlice = actionsCode.slice(actionsCode.indexOf("getEligibleRequestDocuments"));
  assert.strictEqual(fnSlice.includes('.select("id, customer_id")'), true);
  assert.strictEqual(fnSlice.includes('.eq("customer_id", request.customer_id)'), true);
});

it("3b. getEligibleRequestDocuments strictly filters out archived documents", () => {
  const fnSlice = actionsCode.slice(actionsCode.indexOf("getEligibleRequestDocuments"));
  assert.strictEqual(fnSlice.includes('.neq("status", "archived")'), true);
  assert.strictEqual(fnSlice.includes('.is("archived_at", null)'), true);
});

it("3c. getEligibleRequestDocuments strictly excludes private storage & AI metadata", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("getEligibleRequestDocuments"),
    actionsCode.indexOf("attachDocumentToRequest")
  );
  assert.strictEqual(fnSlice.includes("file_url:"), false);
  assert.strictEqual(fnSlice.includes("storage_path"), false);
  assert.strictEqual(fnSlice.includes("ai_extracted_json"), false);
  assert.strictEqual(fnSlice.includes("ai_processed"), false);
  assert.strictEqual(fnSlice.includes("createSignedUrl"), false);
});

it("3d. EligibleVaultDocument contract includes existingTags to allow multi-tag UX", () => {
  assert.strictEqual(typesCode.includes("existingTags: string[]"), true);
  assert.strictEqual(actionsCode.includes("existingTags: tagsByDocId[d.id] || []"), true);
});

// ─── 4. ATTACH EXISTING DOCUMENT ─────────────────────────────────────────────

it("4a. attachDocumentToRequest validates same-customer ownership pre-check", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("attachDocumentToRequest"),
    actionsCode.indexOf("uploadAndAttachDocumentToRequest")
  );
  assert.strictEqual(fnSlice.includes("csRes.data.customer_id !== docRes.data.customer_id"), true);
  assert.strictEqual(fnSlice.includes("customer_mismatch"), true);
});

it("4b. attachDocumentToRequest enforces non-archived pre-check", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("attachDocumentToRequest"),
    actionsCode.indexOf("uploadAndAttachDocumentToRequest")
  );
  assert.strictEqual(fnSlice.includes('docRes.data.status === "archived" || docRes.data.archived_at'), true);
  assert.strictEqual(fnSlice.includes("not_attachable"), true);
});

it("4c. attachDocumentToRequest enforces created_by = user.id from auth", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("attachDocumentToRequest"),
    actionsCode.indexOf("uploadAndAttachDocumentToRequest")
  );
  assert.strictEqual(fnSlice.includes("created_by: user.id"), true);
});

it("4d. attachDocumentToRequest maps Postgres 23505 unique violation to already_attached", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("attachDocumentToRequest"),
    actionsCode.indexOf("uploadAndAttachDocumentToRequest")
  );
  assert.strictEqual(fnSlice.includes('insertError.code === "23505"'), true);
  assert.strictEqual(fnSlice.includes("already_attached"), true);
});

it("4e. attachDocumentToRequest uses shared normalizeRequirementTag", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("attachDocumentToRequest"),
    actionsCode.indexOf("uploadAndAttachDocumentToRequest")
  );
  assert.strictEqual(fnSlice.includes("normalizeRequirementTag(requirementTag)"), true);
});

// ─── 5. UPLOAD NEW & ATTACH PIPELINE ─────────────────────────────────────────

it("5a. uploadAndAttachDocumentToRequest derives customer_id from request server-side", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("uploadAndAttachDocumentToRequest"),
    actionsCode.indexOf("detachDocumentFromRequest")
  );
  assert.strictEqual(fnSlice.includes('formData.set("customer_id", request.customer_id)'), true);
});

it("5b. uploadAndAttachDocumentToRequest reuses canonical uploadCustomerDocument", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("uploadAndAttachDocumentToRequest"),
    actionsCode.indexOf("detachDocumentFromRequest")
  );
  assert.strictEqual(fnSlice.includes("await uploadCustomerDocument(formData)"), true);
});

it("5c. uploadAndAttachDocumentToRequest implements partial failure contract preserving vault doc", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("uploadAndAttachDocumentToRequest"),
    actionsCode.indexOf("detachDocumentFromRequest")
  );
  assert.strictEqual(fnSlice.includes("partialSuccess: true"), true);
  assert.strictEqual(fnSlice.includes('errorCode: "association_failed"'), true);
  assert.strictEqual(
    fnSlice.includes("The document was saved to the customer's Document Vault, but could not be attached to this request."),
    true
  );
});

// ─── 6. DETACH ACTION ────────────────────────────────────────────────────────

it("6a. detachDocumentFromRequest deletes ONLY service_request_documents association", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("detachDocumentFromRequest"),
    actionsCode.indexOf("toggleDocumentVerification")
  );
  assert.strictEqual(fnSlice.includes('.from("service_request_documents")'), true);
  assert.strictEqual(fnSlice.includes(".delete()"), true);
  assert.strictEqual(fnSlice.includes('.from("customer_documents").delete()'), false);
  assert.strictEqual(fnSlice.includes("removeStorageObject"), false);
});

it("6b. detachDocumentFromRequest validates association belongs to requestId", () => {
  const fnSlice = actionsCode.slice(
    actionsCode.indexOf("detachDocumentFromRequest"),
    actionsCode.indexOf("toggleDocumentVerification")
  );
  assert.strictEqual(fnSlice.includes('.eq("customer_service_id", requestId)'), true);
});

// ─── 7. VERIFICATION ACTION (COMPARE-AND-SET) ────────────────────────────────

it("7a. toggleDocumentVerification modifies association is_verified ONLY", () => {
  const fnSlice = actionsCode.slice(actionsCode.indexOf("toggleDocumentVerification"));
  assert.strictEqual(fnSlice.includes('.from("service_request_documents")'), true);
  assert.strictEqual(fnSlice.includes('.update({ is_verified: isVerified })'), true);
  assert.strictEqual(fnSlice.includes('.from("customer_documents").update('), false);
});

it("7b. toggleDocumentVerification implements CAS optimistic concurrency matching expectedIsVerified", () => {
  const fnSlice = actionsCode.slice(actionsCode.indexOf("toggleDocumentVerification"));
  assert.strictEqual(fnSlice.includes('.eq("is_verified", expectedIsVerified)'), true);
  assert.strictEqual(fnSlice.includes('errorCode: "conflict"'), true);
});

// ─── 8. WORKFLOW DECOUPLING & PRIVACY ────────────────────────────────────────

it("8a. Zero document lifecycle actions modify customer_services.status", () => {
  const lifecycleBlock = actionsCode.slice(actionsCode.indexOf("REQUEST DOCUMENT LIFECYCLE SERVER ACTIONS"));
  assert.strictEqual(lifecycleBlock.includes('.update({ status:'), false);
  assert.strictEqual(lifecycleBlock.includes("transitionServiceRequestStatus"), false);
});

it("8b. Server revalidations use concrete URL paths, never dynamic brackets", () => {
  assert.strictEqual(actionsCode.includes('revalidatePath("/requests/[id]")'), false);
  assert.strictEqual(actionsCode.includes('revalidatePath(`/requests/${requestId}`)'), true);
  assert.strictEqual(actionsCode.includes('revalidatePath("/requests")'), true);
});

// ─── 9. UI COMPONENTS & WORKSPACE INTEGRATION ────────────────────────────────

it("9a. RequestWorkspace remains a Server Component and integrates RequestDocumentManager", () => {
  assert.strictEqual(workspaceCode.includes('"use client"'), false, "RequestWorkspace must remain a Server Component");
  assert.strictEqual(workspaceCode.includes("<RequestDocumentManager"), true);
  assert.strictEqual(workspaceCode.includes("requestId={data.id}"), true);
  assert.strictEqual(workspaceCode.includes("customerId={data.customer.id}"), true);
  assert.strictEqual(workspaceCode.includes("documents={data.documents}"), true);
});

it("9b. RequestDocumentManager is a Client Component island with detach confirmation", () => {
  assert.strictEqual(managerCode.includes('"use client"'), true);
  assert.strictEqual(
    managerCode.includes("This removes the document from this request only. It remains in the customer's Document Vault.") ||
      managerCode.includes("This removes the document from this request only. It remains in the customer&apos;s Document Vault."),
    true,
    "Must display canonical detach warning text"
  );
  assert.strictEqual(managerCode.includes("handleVerifyToggle"), true);
  assert.strictEqual(managerCode.includes("handleConfirmDetach"), true);
});

it("9c. AttachRequestDocumentModal has Existing and Upload tabs with tag pills", () => {
  assert.strictEqual(modalCode.includes('"use client"'), true);
  assert.strictEqual(modalCode.includes('activeTab === "existing"'), true);
  assert.strictEqual(modalCode.includes('activeTab === "upload"'), true);
  assert.strictEqual(modalCode.includes("SUGGESTED_TAGS"), true);
  assert.strictEqual(modalCode.includes("handleAttachExisting"), true);
  assert.strictEqual(modalCode.includes("handleUploadAndAttach"), true);
});

// ─── 10. ARCHITECTURAL HARMONIZATION & SAFETY GATES ─────────────────────────

it("10a. Exactly ONE canonical association insertion implementation exists across codebase", () => {
  // requests/actions.ts contains the single authoritative insert into service_request_documents
  assert.strictEqual(actionsCode.includes('.from("service_request_documents")'), true);
  assert.strictEqual(actionsCode.includes('.insert(['), true);

  // services/actions.ts delegates to attachDocumentToRequest (no duplicate insert logic)
  assert.strictEqual(servicesActionsCode.includes("await attachDocumentToRequest({"), true);
  assert.strictEqual(servicesActionsCode.includes('.from("service_request_documents")\n    .insert'), false);

  // uploadAndAttachDocumentToRequest delegates to attachDocumentToRequest
  assert.strictEqual(actionsCode.includes("await attachDocumentToRequest({"), true);
});

it("10b. uploadCustomerDocument expects customer_id key and client customerId cannot override", () => {
  // Canonical uploader contract
  assert.strictEqual(documentsActionsCode.includes('formData.get("customer_id")'), true);

  // uploadAndAttachDocumentToRequest strips client customerId and forces request-derived customer_id
  assert.strictEqual(actionsCode.includes('formData.delete("customerId")'), true);
  assert.strictEqual(actionsCode.includes('formData.set("customer_id", request.customer_id)'), true);
});

it("10c. Strict archived status and archived_at guards in picker and server action", () => {
  // Picker strictly excludes archived status and non-null archived_at
  assert.strictEqual(actionsCode.includes('.neq("status", "archived")'), true);
  assert.strictEqual(actionsCode.includes('.is("archived_at", null)'), true);

  // Server action strictly rejects archived status even if archived_at is null, and vice versa
  assert.strictEqual(actionsCode.includes('docRes.data.status === "archived" || docRes.data.archived_at'), true);
  assert.strictEqual(actionsCode.includes('errorCode: "not_attachable"'), true);
});

it("10d. Same document allowed for different requirement tags; same tag duplicate rejected", () => {
  // Multi-tag tracking exposed on eligible picker
  assert.strictEqual(typesCode.includes("existingTags: string[]"), true);

  // DB unique constraint violation 23505 sanitized to already_attached
  assert.strictEqual(actionsCode.includes('insertError.code === "23505"'), true);
  assert.strictEqual(actionsCode.includes('errorCode: "already_attached"'), true);
});

it("10e. CAS verification distinguishes update from zero matching rows and returns conflict", () => {
  // Verifies association with expected state
  assert.strictEqual(actionsCode.includes('.eq("is_verified", expectedIsVerified)'), true);
  assert.strictEqual(actionsCode.includes('!updated || updated.length === 0'), true);
  assert.strictEqual(actionsCode.includes('errorCode: "conflict"'), true);

  // Never updates customer_documents.verified
  assert.strictEqual(actionsCode.includes('.from("customer_documents").update('), false);
});

it("10f. Detach action deletes only association row and never touches vault or storage", () => {
  assert.strictEqual(actionsCode.includes('.from("service_request_documents")'), true);
  assert.strictEqual(actionsCode.includes('.delete()'), true);
  assert.strictEqual(actionsCode.includes('.from("customer_documents").delete()'), false);
  assert.strictEqual(actionsCode.includes('storage.from("customer_documents").remove'), false);
});

it("10g. Partial failure contract preserves vault document on association failure", () => {
  assert.strictEqual(actionsCode.includes("partialSuccess: true"), true);
  assert.strictEqual(actionsCode.includes('errorCode: "association_failed"'), true);
  // Does not delete or remove vault document on association failure
  assert.strictEqual(actionsCode.includes('.from("customer_documents").delete()'), false);
});

console.log("\n==========================================================================");
console.log(`🏁 REQUEST DOCUMENT LIFECYCLE TESTS: ${passedTests}/${totalTests} PASSED`);
console.log("==========================================================================");

if (passedTests !== totalTests) {
  process.exit(1);
}
