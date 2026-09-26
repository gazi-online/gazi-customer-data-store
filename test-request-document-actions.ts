/**
 * ==============================================================================
 * REQUEST WORKSPACE DOCUMENT ACTIONS (PREVIEW & DOWNLOAD) REGRESSION TEST SUITE
 * ==============================================================================
 * Verifies:
 * 1. Preview action exists for attached document
 * 2. Download action exists for attached document
 * 3. Existing getDocumentSignedUrl server action is reused
 * 4. Preview requests view-mode behavior (download = false)
 * 5. Download requests download-mode behavior (download = true with targetFilename)
 * 6. Failure paths provide operator feedback via toast.error
 * 7. Verification toggle remains intact
 * 8. Detach remains intact
 * 9. No bulk/ZIP implementation was introduced
 * 10. No persistence/client caching of signed URLs introduced
 * ==============================================================================
 */

import assert from "assert";
import fs from "fs";
import path from "path";

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
console.log("🧪 REQUEST WORKSPACE DOCUMENT PREVIEW & DOWNLOAD REGRESSION SUITE");
console.log("==========================================================================\n");

// Read source files
const managerPath = path.resolve("src/components/requests/RequestDocumentManager.tsx");
const docActionsPath = path.resolve("src/app/(dashboard)/documents/actions.ts");

assert.strictEqual(fs.existsSync(managerPath), true, "RequestDocumentManager.tsx must exist");
assert.strictEqual(fs.existsSync(docActionsPath), true, "documents/actions.ts must exist");

const managerCode = fs.readFileSync(managerPath, "utf-8");
const docActionsCode = fs.readFileSync(docActionsPath, "utf-8");

// 1. Preview action exists for attached document
it("1a. RequestDocumentManager imports Eye icon for preview action", () => {
  assert.match(managerCode, /\bEye\b/, "Must import Eye icon from lucide-react");
});

it("1b. Preview button is rendered for each attached document with accessible label", () => {
  assert.match(managerCode, /handlePreviewDoc\(doc\)/, "Must bind handlePreviewDoc onClick");
  assert.match(managerCode, /aria-label=\{`Preview \$\{doc\.documentName\}`\}/, "Must provide accessible aria-label");
  assert.match(managerCode, />\s*Preview\s*<\/span>/, "Must display Preview label text");
});

// 2. Download action exists for attached document
it("2a. RequestDocumentManager imports Download icon for download action", () => {
  assert.match(managerCode, /\bDownload\b/, "Must import Download icon from lucide-react");
});

it("2b. Download button is rendered for each attached document with accessible label", () => {
  assert.match(managerCode, /handleDownloadDoc\(doc\)/, "Must bind handleDownloadDoc onClick");
  assert.match(managerCode, /aria-label=\{`Download \$\{doc\.documentName\}`\}/, "Must provide accessible aria-label");
  assert.match(managerCode, />\s*Download\s*<\/span>/, "Must display Download label text");
});

// 3. Existing signed URL action is reused
it("3a. RequestDocumentManager imports getDocumentSignedUrl from documents/actions", () => {
  assert.match(
    managerCode,
    /import\s*\{\s*[^}]*getDocumentSignedUrl[^}]*\}\s*from\s*["']@\/app\/\(dashboard\)\/documents\/actions["']/,
    "Must import getDocumentSignedUrl from documents/actions"
  );
});

it("3b. documents/actions exports getDocumentSignedUrl with mandatory AAL2 check", () => {
  assert.match(docActionsCode, /export\s+async\s+function\s+getDocumentSignedUrl/, "Must export getDocumentSignedUrl");
  assert.match(docActionsCode, /await\s+requireAal2\(supabase\)/, "getDocumentSignedUrl must enforce requireAal2");
});

// 4. Preview requests view-mode behavior
it("4a. handlePreviewDoc passes download = false to getDocumentSignedUrl", () => {
  assert.match(
    managerCode,
    /getDocumentSignedUrl\(\s*targetDocId\s*,\s*false\s*\)/,
    "handlePreviewDoc must call getDocumentSignedUrl with download = false"
  );
});

it("4b. handlePreviewDoc opens window securely with noopener and noreferrer", () => {
  assert.match(managerCode, /window\.open\([^,]+,\s*["']_blank["'],\s*["']noopener,noreferrer["']\)/, "Must open in new tab securely");
});

// 5. Download requests download-mode behavior
it("5a. handleDownloadDoc passes download = true and targetFilename to getDocumentSignedUrl", () => {
  assert.match(
    managerCode,
    /getDocumentSignedUrl\(\s*targetDocId\s*,\s*true\s*,\s*targetFilename\s*\)/,
    "handleDownloadDoc must call getDocumentSignedUrl with download = true and targetFilename"
  );
});

it("5b. handleDownloadDoc triggers native browser download via link click and cleanup", () => {
  assert.match(managerCode, /document\.createElement\(["']a["']\)/, "Must create anchor tag");
  assert.match(managerCode, /link\.download\s*=\s*targetFilename/, "Must set download attribute");
  assert.match(managerCode, /link\.click\(\)/, "Must trigger click");
  assert.match(managerCode, /document\.body\.removeChild\(link\)/, "Must clean up anchor tag from DOM");
});

// 6. Failure path provides operator feedback
it("6a. handlePreviewDoc provides error feedback on failure and cleans up tab", () => {
  assert.match(managerCode, /newTab\.close\(\)/, "Must close popup tab if generation fails");
  assert.match(managerCode, /toast\.error\(message\)/, "Must notify operator on preview error");
});

it("6b. handleDownloadDoc provides error feedback on failure", () => {
  assert.match(managerCode, /toast\.error\(msg\)/, "Must notify operator on download error");
});

it("6c. Loading states are scoped per document and disable double-clicks", () => {
  assert.match(managerCode, /viewingDocId/, "Must track viewingDocId");
  assert.match(managerCode, /downloadingDocId/, "Must track downloadingDocId");
  assert.match(managerCode, /disabled=\{isViewingThis\s*\|\|\s*isDownloadingThis/, "Must disable action while loading");
  assert.match(managerCode, /<Loader2\s+className=["'][^"']*animate-spin/, "Must render spinner when action is active");
});

// 7. Verification toggle remains intact
it("7a. handleVerifyToggle remains intact with CAS optimistic concurrency", () => {
  assert.match(managerCode, /const\s+handleVerifyToggle\s*=\s*async/, "handleVerifyToggle must exist");
  assert.match(managerCode, /toggleDocumentVerification/, "Must call toggleDocumentVerification");
  assert.match(managerCode, /expectedIsVerified:\s*doc\.isVerified/, "Must implement CAS concurrency check");
  assert.match(managerCode, />\s*\{doc\.isVerified\s*\?\s*["']Verified["']\s*:\s*["']Unverified["']\}\s*<\/span>/, "Must render Verified/Unverified label");
});

// 8. Detach remains intact
it("8a. handleConfirmDetach remains intact with confirmation dialog", () => {
  assert.match(managerCode, /const\s+handleConfirmDetach\s*=\s*async/, "handleConfirmDetach must exist");
  assert.match(managerCode, /detachDocumentFromRequest/, "Must call detachDocumentFromRequest");
  assert.match(managerCode, /detachTarget/, "Must preserve detachTarget state");
  assert.match(managerCode, /Detach Document Association/, "Must preserve confirmation modal header");
  assert.match(managerCode, /This removes the document from this request only/, "Must preserve explanation text");
});

// 9. No bulk/ZIP implementation was introduced
it("9a. RequestDocumentManager strictly excludes bulk/ZIP/archive implementations", () => {
  assert.strictEqual(managerCode.includes("jszip"), false, "Must NOT import jszip");
  assert.strictEqual(managerCode.includes("JSZip"), false, "Must NOT reference JSZip");
  assert.strictEqual(managerCode.includes("downloadAll"), false, "Must NOT implement downloadAll");
  assert.strictEqual(managerCode.includes("download-all"), false, "Must NOT implement download-all");
  assert.strictEqual(managerCode.includes("packageDocuments"), false, "Must NOT implement packageDocuments");
  assert.strictEqual(managerCode.includes("createZip"), false, "Must NOT implement createZip");
});

// 10. No persistence/client caching of signed URLs introduced
it("10a. RequestDocumentManager does not persist signed URLs in state, storage, or cache", () => {
  assert.strictEqual(managerCode.includes("localStorage"), false, "Must NOT write to localStorage");
  assert.strictEqual(managerCode.includes("sessionStorage"), false, "Must NOT write to sessionStorage");
  assert.strictEqual(managerCode.includes("signedUrls"), false, "Must NOT store signedUrls array in state");
  assert.strictEqual(managerCode.includes("signedUrlMap"), false, "Must NOT store signedUrlMap in state");
});

console.log("\n==========================================================================");
console.log(`🏁 REGRESSION SUITE: ${passedTests}/${totalTests} PASSED`);
console.log("==========================================================================");
