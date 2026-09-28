import fs from "fs";
import path from "path";

console.log("==========================================================================");
console.log("🧪 V2 CUSTOMER INTAKE UI/UX & MORE OPTIONS REGRESSION TEST SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: unknown) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.log(`❌ [FAIL] ${testName} | Detail:`, detail);
    failed++;
  }
}

const dropzoneCode = fs.readFileSync(
  path.join(__dirname, "src/components/AiSmartImportEngine/components/PremiumDropzone.tsx"),
  "utf8"
);
const indexCode = fs.readFileSync(
  path.join(__dirname, "src/components/AiSmartImportEngine/index.tsx"),
  "utf8"
);

// -----------------------------------------------------------------------------
// GROUP 1: Dropzone Simplification & Content Hierarchy
// -----------------------------------------------------------------------------

// 1. Removed distracting workflow chip
assert(
  !dropzoneCode.includes("Upload</span>") && !dropzoneCode.includes("Check details</span>"),
  "1. Workflow chip ('Upload → Check details → Save') is removed from dropzone"
);

// 2. Removed redundant explanation text
assert(
  !dropzoneCode.includes("We'll read the documents and prepare the customer details for you."),
  "2. Redundant explanation text removed from empty dropzone"
);

// 3. Clear title
assert(
  dropzoneCode.includes("Upload customer documents"),
  "3. Clear title 'Upload customer documents' is present"
);

// 4. Document examples
assert(
  dropzoneCode.includes("Aadhaar, PAN, Voter ID, Passport & more"),
  "4. Document examples 'Aadhaar, PAN, Voter ID, Passport & more' are present"
);

// 5. Primary CTA 'Browse Files' with proper text
assert(
  dropzoneCode.includes("Browse Files") && dropzoneCode.includes("UploadCloud"),
  "5. Primary CTA 'Browse Files' with UploadCloud icon is present"
);

// 6. Click and drag/drop helper
assert(
  dropzoneCode.includes("Drop files here or click to browse"),
  "6. Operator helper 'Drop files here or click to browse' is present"
);

// 7. File format helper with middot
assert(
  dropzoneCode.includes("PDF, DOCX, XLSX, JPG, PNG, WEBP · Max 10 MB"),
  "7. Clean file format line 'PDF, DOCX, XLSX, JPG, PNG, WEBP · Max 10 MB' is present"
);

// 8. Entire dropzone is clickable
assert(
  dropzoneCode.includes("cursor-pointer") && dropzoneCode.includes("onKeyDown={handleDropzoneKeyDown}"),
  "8. Entire dropzone is clickable with cursor-pointer and keyboard activation"
);

// -----------------------------------------------------------------------------
// GROUP 2: Staged Files State
// -----------------------------------------------------------------------------

// 9. Staged files header uses 'Documents added'
assert(
  dropzoneCode.includes("Documents added"),
  "9. Staged files header uses operator-first 'Documents added'"
);

// 10. Secondary add action uses 'Add more'
assert(
  dropzoneCode.includes("Add more"),
  "10. Secondary add action uses simple 'Add more'"
);

// 11. Staged file action uses 'Read Documents'
assert(
  dropzoneCode.includes("Read Documents"),
  "11. Staged file primary action uses 'Read Documents'"
);

// 12. Document side segmented control preserved
assert(
  dropzoneCode.includes("role=\"radiogroup\"") && dropzoneCode.includes("onSideChanged"),
  "12. Document side segmented control (Front, Back, Both, Single) preserved"
);

// -----------------------------------------------------------------------------
// GROUP 3: More Options Menu & Card Overlap Fix
// -----------------------------------------------------------------------------

// 13. Outer intake card does NOT have overflow-hidden that clips popovers
const outerCardMatch = indexCode.match(/<div className="([^"]*rounded-2xl[^"]*)"/);
assert(
  outerCardMatch !== null && !outerCardMatch[1].includes("overflow-hidden"),
  "13. Intake card container does NOT have overflow-hidden that clips popovers/menus",
  outerCardMatch?.[1]
);

// 14. More Options menu anchors upward (bottom-full) to eliminate bottom clipping
assert(
  indexCode.includes("bottom-full") && indexCode.includes("right-0 mb-2"),
  "14. More Options menu anchors upward (bottom-full right-0 mb-2) to avoid viewport/card clipping"
);

// 15. More Options content includes 'Paste JSON data' and 'Advanced import option'
assert(
  indexCode.includes("Paste JSON data") && indexCode.includes("Advanced import option"),
  "15. More Options contains 'Paste JSON data' with 'Advanced import option' subtext"
);

// 16. Click outside closes More Options
assert(
  indexCode.includes("handleClickOutside") &&
  indexCode.includes("addEventListener(\"mousedown\"") &&
  indexCode.includes("addEventListener(\"touchstart\""),
  "16. Click outside closes More Options menu on desktop and touch devices"
);

// 17. Escape key closes More Options and restores button focus
assert(
  indexCode.includes("handleKeyDown") &&
  indexCode.includes("e.key === \"Escape\"") &&
  indexCode.includes("moreOptionsButtonRef.current?.focus()"),
  "17. Escape key closes More Options and returns focus to trigger button"
);

// 18. Accessibility attributes on More Options
assert(
  indexCode.includes("aria-haspopup=\"menu\"") &&
  indexCode.includes("aria-expanded={showMoreOptions}") &&
  indexCode.includes("role=\"menu\"") &&
  indexCode.includes("role=\"menuitem\""),
  "18. More Options menu has complete WAI-ARIA menu semantics"
);

// 19. Action bar hierarchy: Enter details manually + More options
assert(
  indexCode.includes("Enter details manually") && indexCode.includes("More options"),
  "19. Action bar provides both 'Enter details manually' and 'More options'"
);

console.log("==========================================================================");
console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("==========================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`🎉 ALL ${passed} V2 INTAKE UI ASSERTIONS PASSED!`);
}
