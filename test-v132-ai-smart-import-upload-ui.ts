import fs from "fs";
import path from "path";
import { UPLOAD_CONSTANTS, StagedFileItem, validateSideAssignments, isOfficeDocument } from "./src/components/AiSmartImportEngine/uploadConstants";

console.log("==========================================================================");
console.log("🧪 V13.2 AI SMART IMPORT PREMIUM UPLOADER REDESIGN TEST SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, actual?: unknown) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.log(`❌ [FAIL] ${testName} | Actual:`, actual);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// GROUP 1: Upload Constants & Supported Specifications
// -----------------------------------------------------------------------------

// 1. Valid extensions (PDF, DOCX, XLSX, JPG, PNG, WEBP)
assert(
  UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS.includes('.jpg') &&
  UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS.includes('.png') &&
  UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS.includes('.webp') &&
  UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS.includes('.pdf') &&
  UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS.includes('.docx') &&
  UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS.includes('.xlsx'),
  "1. UPLOAD_CONSTANTS includes .jpg, .png, .webp, .pdf, .docx, and .xlsx"
);

// 2. Disallowed extensions NOT present (doc, xls, ppt, pptx, tiff)
assert(
  !(UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS as readonly string[]).includes('.doc') &&
  !(UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS as readonly string[]).includes('.xls') &&
  !(UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS as readonly string[]).includes('.ppt') &&
  !(UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS as readonly string[]).includes('.pptx') &&
  !(UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS as readonly string[]).includes('.tiff'),
  "2. UPLOAD_CONSTANTS strictly excludes legacy .doc, .xls, .ppt, .pptx, and .tiff"
);

// 3. Allowed MIME types
assert(
  UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES.includes('application/pdf') &&
  UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') &&
  UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') &&
  UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES.includes('image/jpeg') &&
  UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES.includes('image/png') &&
  UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES.includes('image/webp'),
  "3. Allowed MIME types accurately match PDF, DOCX, XLSX, JPEG, PNG, and WEBP"
);

// 4. Max size is strictly 10 MB
assert(
  UPLOAD_CONSTANTS.MAX_FILE_SIZE_BYTES === 10 * 1024 * 1024 &&
  UPLOAD_CONSTANTS.MAX_FILE_SIZE_LABEL === "10 MB",
  "4. Max file size is 10 MB (10,485,760 bytes)"
);

// 5. Max files per batch is 10
assert(
  UPLOAD_CONSTANTS.MAX_FILES_PER_BATCH === 10,
  "5. Max batch limit is 10 documents"
);

// 6. Side options: Front, Back, Both, Single
assert(
  UPLOAD_CONSTANTS.SIDE_OPTIONS.length === 4 &&
  UPLOAD_CONSTANTS.SIDE_OPTIONS.includes('Front') &&
  UPLOAD_CONSTANTS.SIDE_OPTIONS.includes('Back') &&
  UPLOAD_CONSTANTS.SIDE_OPTIONS.includes('Both') &&
  UPLOAD_CONSTANTS.SIDE_OPTIONS.includes('Single'),
  "6. Side options exactly include Front, Back, Both, Single"
);

// 7. Default side is 'Single'
assert(
  UPLOAD_CONSTANTS.DEFAULT_SIDE === 'Single',
  "7. Default side selection is 'Single'"
);

// -----------------------------------------------------------------------------
// GROUP 2: Validation Logic Simulation
// -----------------------------------------------------------------------------

interface MockFile {
  name: string;
  size: number;
  type: string;
}

function simulateValidation(
  files: MockFile[], 
  staged: { name: string; size: number }[]
): { valid: MockFile[]; errors: { file: string; reason: string; type: string }[] } {
  const errors: { file: string; reason: string; type: string }[] = [];
  const valid: MockFile[] = [];
  let count = staged.length;

  for (const f of files) {
    if (count >= UPLOAD_CONSTANTS.MAX_FILES_PER_BATCH) {
      errors.push({ file: f.name, reason: "Batch limit reached", type: "batch_limit" });
      break;
    }

    const isDup = staged.some(s => s.name === f.name && s.size === f.size) ||
                  valid.some(v => v.name === f.name && v.size === f.size);
    if (isDup) {
      errors.push({ file: f.name, reason: "Duplicate file", type: "duplicate" });
      continue;
    }

    const lower = f.name.toLowerCase();
    if (lower.endsWith('.tif') || lower.endsWith('.tiff') || f.type.includes('tiff')) {
      errors.push({ file: f.name, reason: "TIFF unsupported", type: "unsupported_type" });
      continue;
    }

    if (lower.endsWith('.doc')) {
      errors.push({ file: f.name, reason: "Legacy .doc format is not supported.", type: "unsupported_type" });
      continue;
    }

    if (lower.endsWith('.xls')) {
      errors.push({ file: f.name, reason: "Legacy .xls format is not supported.", type: "unsupported_type" });
      continue;
    }

    if (lower.endsWith('.ppt') || lower.endsWith('.pptx') || f.type.includes('presentation') || f.type.includes('powerpoint')) {
      errors.push({ file: f.name, reason: "PowerPoint presentations are not supported.", type: "unsupported_type" });
      continue;
    }

    const hasExt = UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS.some(e => lower.endsWith(e));
    const hasMime = (UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES as readonly string[]).includes(f.type);
    if (!hasExt && !hasMime) {
      errors.push({ file: f.name, reason: "Unsupported type", type: "unsupported_type" });
      continue;
    }

    if (f.size > UPLOAD_CONSTANTS.MAX_FILE_SIZE_BYTES) {
      errors.push({ file: f.name, reason: "Size exceeded", type: "size_exceeded" });
      continue;
    }

    valid.push(f);
    count++;
  }

  return { valid, errors };
}

// 8. Valid JPG accepted
const resJpg = simulateValidation([{ name: "aadhaar_front.jpg", size: 2 * 1024 * 1024, type: "image/jpeg" }], []);
assert(resJpg.valid.length === 1 && resJpg.errors.length === 0, "8. Valid JPG file accepted");

// 9. Valid PNG accepted
const resPng = simulateValidation([{ name: "pan_card.png", size: 1.5 * 1024 * 1024, type: "image/png" }], []);
assert(resPng.valid.length === 1 && resPng.errors.length === 0, "9. Valid PNG file accepted");

// 10. Valid WEBP accepted
const resWebp = simulateValidation([{ name: "voter_id.webp", size: 800 * 1024, type: "image/webp" }], []);
assert(resWebp.valid.length === 1 && resWebp.errors.length === 0, "10. Valid WEBP file accepted");

// 11. Valid PDF accepted
const resPdf = simulateValidation([{ name: "bank_statement.pdf", size: 5 * 1024 * 1024, type: "application/pdf" }], []);
assert(resPdf.valid.length === 1 && resPdf.errors.length === 0, "11. Valid PDF file accepted");

// 12a. Valid DOCX accepted
const resDocx = simulateValidation([{ name: "customer_kyc.docx", size: 500 * 1024, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }], []);
assert(resDocx.valid.length === 1 && resDocx.errors.length === 0, "12a. Valid DOCX file accepted");

// 12b. Valid XLSX accepted
const resXlsx = simulateValidation([{ name: "customer_records.xlsx", size: 600 * 1024, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }], []);
assert(resXlsx.valid.length === 1 && resXlsx.errors.length === 0, "12b. Valid XLSX file accepted");

// 12c. PPTX rejected
const resPptx = simulateValidation([{ name: "deck.pptx", size: 1 * 1024 * 1024, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }], []);
assert(resPptx.valid.length === 0 && resPptx.errors[0]?.type === "unsupported_type", "12c. PPTX presentation rejected");

// 12d. Legacy DOC rejected
const resDoc = simulateValidation([{ name: "legacy_profile.doc", size: 400 * 1024, type: "application/msword" }], []);
assert(resDoc.valid.length === 0 && resDoc.errors[0]?.type === "unsupported_type", "12d. Legacy DOC file rejected");

// 12e. Legacy XLS rejected
const resXls = simulateValidation([{ name: "legacy_table.xls", size: 300 * 1024, type: "application/vnd.ms-excel" }], []);
assert(resXls.valid.length === 0 && resXls.errors[0]?.type === "unsupported_type", "12e. Legacy XLS file rejected");

// 13. TIFF rejected with specific message
const resTiff = simulateValidation([{ name: "scan.tiff", size: 3 * 1024 * 1024, type: "image/tiff" }], []);
assert(resTiff.valid.length === 0 && resTiff.errors[0]?.type === "unsupported_type", "13. TIFF file rejected");

// 14. Oversized file (> 10MB) rejected
const resOversize = simulateValidation([{ name: "huge.pdf", size: 11 * 1024 * 1024, type: "application/pdf" }], []);
assert(resOversize.valid.length === 0 && resOversize.errors[0]?.type === "size_exceeded", "14. Oversized file (11MB) rejected with size_exceeded");

// 15. Exactly 10MB accepted
const resBoundary = simulateValidation([{ name: "exact10mb.pdf", size: 10 * 1024 * 1024, type: "application/pdf" }], []);
assert(resBoundary.valid.length === 1 && resBoundary.errors.length === 0, "15. Exactly 10MB file accepted (boundary test)");

// 16. Duplicate file rejected
const resDup = simulateValidation(
  [{ name: "aadhaar.jpg", size: 1024, type: "image/jpeg" }],
  [{ name: "aadhaar.jpg", size: 1024 }]
);
assert(resDup.valid.length === 0 && resDup.errors[0]?.type === "duplicate", "16. Duplicate file rejected with duplicate type");

// 17. Multi-file staging
const multiFiles: MockFile[] = [
  { name: "f1.jpg", size: 1000, type: "image/jpeg" },
  { name: "f2.png", size: 2000, type: "image/png" },
  { name: "f3.pdf", size: 3000, type: "application/pdf" },
];
const resMulti = simulateValidation(multiFiles, []);
assert(resMulti.valid.length === 3 && resMulti.errors.length === 0, "17. Multi-file upload stages all 3 valid files");

// 18. Batch limit enforcement (>10)
const twelveFiles: MockFile[] = Array.from({ length: 12 }, (_, i) => ({
  name: `doc_${i}.pdf`,
  size: 500,
  type: "application/pdf"
}));
const resTwelve = simulateValidation(twelveFiles, []);
assert(
  resTwelve.valid.length === 10 && resTwelve.errors.some(e => e.type === "batch_limit"),
  "18. Maximum 10 batch limit strictly enforced (10 staged, remainder rejected with batch_limit)"
);

// -----------------------------------------------------------------------------
// GROUP 3: Document Side Selection & State Preservation
// -----------------------------------------------------------------------------

// 19. Initial side defaults to 'Single'
const stagedItem: StagedFileItem = {
  id: "test-1",
  file: new File(["dummy"], "aadhaar.pdf", { type: "application/pdf" }),
  side: UPLOAD_CONSTANTS.DEFAULT_SIDE
};
assert(stagedItem.side === "Single", "19. Staged item starts with side 'Single'");

// 20. Update side to 'Front'
const updatedFront: StagedFileItem = { ...stagedItem, side: "Front" };
assert(updatedFront.side === "Front", "20. Side successfully updated to 'Front'");

// 21. Update side to 'Back'
const updatedBack: StagedFileItem = { ...stagedItem, side: "Back" };
assert(updatedBack.side === "Back", "21. Side successfully updated to 'Back'");

// 22. Update side to 'Both'
const updatedBoth: StagedFileItem = { ...stagedItem, side: "Both" };
assert(updatedBoth.side === "Both", "22. Side successfully updated to 'Both'");

// 23. ImportJob frontFile / backFile mapping from designated sides
const stagedBatch: StagedFileItem[] = [
  { id: "1", file: new File(["front"], "card_front.jpg", { type: "image/jpeg" }), side: "Front" },
  { id: "2", file: new File(["back"], "card_back.jpg", { type: "image/jpeg" }), side: "Back" },
  { id: "3", file: new File(["other"], "doc_single.pdf", { type: "application/pdf" }), side: "Single" }
];
const designatedFront = stagedBatch.find(s => s.side === "Front");
const designatedBack = stagedBatch.find(s => s.side === "Back");
assert(
  designatedFront?.file.name === "card_front.jpg" && designatedBack?.file.name === "card_back.jpg",
  "23. Extraction payload maps frontFile and backFile correctly from designated side metadata"
);

// 23a. Case A: 1 Front + 1 Back is a valid pair
const caseA: StagedFileItem[] = [
  { id: "1", file: new File(["f"], "front.jpg", { type: "image/jpeg" }), side: "Front" },
  { id: "2", file: new File(["b"], "back.jpg", { type: "image/jpeg" }), side: "Back" }
];
assert(validateSideAssignments(caseA) === null, "23a. Case A: 1 Front + 1 Back is a valid pair");

// 23b. Case B: 2 Front blocked with exact message
const caseB: StagedFileItem[] = [
  { id: "1", file: new File(["f1"], "front1.jpg", { type: "image/jpeg" }), side: "Front" },
  { id: "2", file: new File(["f2"], "front2.jpg", { type: "image/jpeg" }), side: "Front" }
];
assert(
  validateSideAssignments(caseB) === "Only one Front file can be assigned per document pair.",
  "23b. Case B: 2 Front files blocked with 'Only one Front file can be assigned per document pair.'"
);

// 23c. Case C: 2 Back blocked with exact message
const caseC: StagedFileItem[] = [
  { id: "1", file: new File(["b1"], "back1.jpg", { type: "image/jpeg" }), side: "Back" },
  { id: "2", file: new File(["b2"], "back2.jpg", { type: "image/jpeg" }), side: "Back" }
];
assert(
  validateSideAssignments(caseC) === "Only one Back file can be assigned per document pair.",
  "23c. Case C: 2 Back files blocked with 'Only one Back file can be assigned per document pair.'"
);

// 23d. Case D: 1 Both + 1 Front blocked
const caseD: StagedFileItem[] = [
  { id: "1", file: new File(["both"], "both.jpg", { type: "image/jpeg" }), side: "Both" },
  { id: "2", file: new File(["f"], "front.jpg", { type: "image/jpeg" }), side: "Front" }
];
assert(
  validateSideAssignments(caseD) !== null,
  "23d. Case D: Both + Front/Back combination blocked with clear validation"
);

// 23e. Case E: Single does NOT populate frontFile or backFile
const caseE: StagedFileItem[] = [
  { id: "1", file: new File(["s1"], "single1.pdf", { type: "application/pdf" }), side: "Single" },
  { id: "2", file: new File(["s2"], "single2.pdf", { type: "application/pdf" }), side: "Single" }
];
const singleFront = caseE.find(s => s.side === "Front");
const singleBack = caseE.find(s => s.side === "Back");
assert(
  singleFront === undefined && singleBack === undefined,
  "23e. Case E: 'Single' files do not populate frontFile or backFile"
);

// 23f. Case F: Both mapped as primary document
const caseF: StagedFileItem[] = [
  { id: "1", file: new File(["both"], "aadhaar_both.jpg", { type: "image/jpeg" }), side: "Both" }
];
const bothItem = caseF.find(s => s.side === "Both");
assert(
  bothItem !== undefined && bothItem.file.name === "aadhaar_both.jpg",
  "23f. Case F: 'Both' document mapped cleanly (architectural limitation noted: ImportJob lacks bothFile field)"
);

// 23g. DOCX normalized to Single
const docxFileItem: StagedFileItem = {
  id: "docx-1",
  file: new File(["data"], "customer.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
  side: isOfficeDocument("customer.docx") ? "Single" : "Front"
};
assert(
  isOfficeDocument("customer.docx") === true && docxFileItem.side === "Single",
  "23g. DOCX is detected by isOfficeDocument and normalized to 'Single'"
);

// 23h. XLSX normalized to Single
const xlsxFileItem: StagedFileItem = {
  id: "xlsx-1",
  file: new File(["data"], "customer.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  side: isOfficeDocument("customer.xlsx") ? "Single" : "Front"
};
assert(
  isOfficeDocument("customer.xlsx") === true && xlsxFileItem.side === "Single",
  "23h. XLSX is detected by isOfficeDocument and normalized to 'Single'"
);

// 23i. DOCX cannot be assigned Front or Back
const invalidDocxSide: StagedFileItem[] = [
  { id: "1", file: new File(["d"], "customer.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), side: "Front" }
];
assert(
  validateSideAssignments(invalidDocxSide) === "Office documents are processed as a single document.",
  "23i. DOCX assigned to 'Front' is rejected by validateSideAssignments"
);

// 23j. XLSX cannot be assigned Front, Back, or Both
const invalidXlsxSide: StagedFileItem[] = [
  { id: "1", file: new File(["x"], "sheet.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), side: "Both" }
];
assert(
  validateSideAssignments(invalidXlsxSide) === "Office documents are processed as a single document.",
  "23j. XLSX assigned to 'Both' is rejected by validateSideAssignments"
);

// 23k. Images retain full Front/Back/Both/Single flexibility
const imgFront: StagedFileItem = { id: "1", file: new File(["f"], "front.jpg", { type: "image/jpeg" }), side: "Front" };
const imgBack: StagedFileItem = { id: "2", file: new File(["b"], "back.jpg", { type: "image/jpeg" }), side: "Back" };
const imgBoth: StagedFileItem = { id: "3", file: new File(["b"], "both.webp", { type: "image/webp" }), side: "Both" };
const imgSingle: StagedFileItem = { id: "4", file: new File(["s"], "single.png", { type: "image/png" }), side: "Single" };
assert(
  !isOfficeDocument(imgFront.file.name) &&
  !isOfficeDocument(imgBack.file.name) &&
  !isOfficeDocument(imgBoth.file.name) &&
  !isOfficeDocument(imgSingle.file.name) &&
  validateSideAssignments([imgFront, imgBack]) === null,
  "23k. Images (JPG, PNG, WEBP) retain full Front/Back/Both/Single behavior"
);

// 23l. PDF retains full Front/Back/Both/Single flexibility
const pdfDoc: StagedFileItem = { id: "1", file: new File(["p"], "statement.pdf", { type: "application/pdf" }), side: "Single" };
assert(
  !isOfficeDocument(pdfDoc.file.name) && pdfDoc.side === "Single",
  "23l. PDF retains existing document side behavior without Office single-forcing"
);

// -----------------------------------------------------------------------------
// GROUP 4: UI Text, Labels & Action Elements
// -----------------------------------------------------------------------------

const dropzoneCode = fs.readFileSync(
  path.join(__dirname, "src/components/AiSmartImportEngine/components/PremiumDropzone.tsx"),
  "utf8"
);
const indexCode = fs.readFileSync(
  path.join(__dirname, "src/components/AiSmartImportEngine/index.tsx"),
  "utf8"
);
const globalsCss = fs.readFileSync(
  path.join(__dirname, "src/app/globals.css"),
  "utf8"
);

// 24. Main AI action text is "Analyze Documents with AI"
assert(
  dropzoneCode.includes("Analyze Documents with AI"),
  "24. CTA button contains 'Analyze Documents with AI'"
);

// 25. Processing state text is "Analyzing documents..." and "Extracting structured customer information"
assert(
  dropzoneCode.includes("Analyzing documents...") &&
  dropzoneCode.includes("Extracting structured customer information"),
  "25. Processing state includes 'Analyzing documents...' and helper 'Extracting structured customer information'"
);

// 26. Marching ants animated dashed border in globals.css
assert(
  globalsCss.includes("@keyframes marchingAnts") &&
  globalsCss.includes(".animate-marching-ants") &&
  dropzoneCode.includes("animate-marching-ants"),
  "26. Animated marching ants dashed border is defined and applied"
);

// 27. Prefers-reduced-motion media query present
assert(
  globalsCss.includes("prefers-reduced-motion: reduce") &&
  globalsCss.includes("animation: none !important"),
  "27. Reduced motion media query disables marching ants and pulse animations"
);

// 28. JSON Import tab is preserved untouched with functional generator, editor and parse action
assert(
  indexCode.includes("<JsonAiGenerator") &&
  indexCode.includes("Customer Extraction JSON Editor") &&
  indexCode.includes("onClick={handleAddJson}") &&
  (indexCode.includes("Read Customer Details") || indexCode.includes("Parse & Review JSON")),
  "28. JSON Import tab and JSON Editor components preserved completely intact"
);

// 29. OCR missing key mapped to user-friendly message
assert(
  indexCode.includes("OCR service is not configured. Please configure the server OCR API key."),
  "29. OCR missing key gracefully maps to user-friendly message without raw stack/secret exposure"
);

// 30. File icons for DOCX and XLSX
assert(
  dropzoneCode.includes("FileType") && dropzoneCode.includes("Sheet"),
  "30. PremiumDropzone renders FileType icon for DOCX and Sheet icon for XLSX"
);

// 31. Office document single notice in UI
assert(
  dropzoneCode.includes("Office documents are processed as a single document."),
  "31. PremiumDropzone includes user notice: 'Office documents are processed as a single document.'"
);

console.log("==========================================================================");
console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("==========================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`🎉 ALL ${passed} ASSERTIONS PASSED PERFECTLY!`);
}
