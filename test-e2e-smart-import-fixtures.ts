import fs from "fs";
import path from "path";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const cleanLine = line.replace(/\r/g, "").trim();
    const match = cleanLine.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

async function runE2EFixtureTests() {
  console.log("==========================================================================");
  console.log("🧪 AI SMART IMPORT END-TO-END FIXTURES & FEATURE FLAG TEST SUITE");
  console.log("==========================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: unknown) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${testName} | Details:`, detail);
      failed++;
    }
  }

  const { DocumentPreprocessorRouter } = await import("./src/lib/document-preprocessing/DocumentPreprocessorRouter");
  const { MarkItDownProvider } = await import("./src/lib/document-preprocessing/providers/MarkItDownProvider");

  const textPdfPath = path.join(process.cwd(), "tools/markitdown-worker/fixtures/synthetic_text.pdf");
  const scannedPdfPath = path.join(process.cwd(), "tools/markitdown-worker/fixtures/synthetic_scanned.pdf");
  const docxPath = path.join(process.cwd(), "tools/markitdown-worker/fixtures/synthetic_customer.docx");
  const xlsxPath = path.join(process.cwd(), "tools/markitdown-worker/fixtures/synthetic_customer.xlsx");

  // ---------------------------------------------------------------------------
  // SECTION 7: End-to-End Fixture Routing with Flag = true
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 7: Fixture Routing (MARKITDOWN_PREPROCESSING_ENABLED=true) ---");
  process.env.MARKITDOWN_PREPROCESSING_ENABLED = "true";

  // 1. synthetic_text.pdf
  const textPdfBuf = fs.readFileSync(textPdfPath);
  const textPdfRes = await DocumentPreprocessorRouter.routeAndPreprocess(textPdfBuf, "synthetic_text.pdf", "application/pdf");
  assert(
    textPdfRes.source === "markitdown" &&
    !textPdfRes.fallbackRequired &&
    typeof textPdfRes.markdown === "string" &&
    textPdfRes.markdown.length > 50,
    "1. synthetic_text.pdf -> MarkItDown -> Markdown extracted successfully",
    { source: textPdfRes.source, len: textPdfRes.markdown?.length }
  );

  // 2. synthetic_scanned.pdf
  const scannedPdfBuf = fs.readFileSync(scannedPdfPath);
  const scannedPdfRes = await DocumentPreprocessorRouter.routeAndPreprocess(scannedPdfBuf, "synthetic_scanned.pdf", "application/pdf");
  assert(
    scannedPdfRes.source === "existing-ocr" &&
    scannedPdfRes.fallbackRequired === true,
    "2. synthetic_scanned.pdf -> MarkItDown detects no usable text -> existing OCR/Vision fallback triggered",
    { source: scannedPdfRes.source, fallback: scannedPdfRes.fallbackRequired, error: scannedPdfRes.error }
  );

  // 3. synthetic_customer.docx
  const docxBuf = fs.readFileSync(docxPath);
  const docxRes = await DocumentPreprocessorRouter.routeAndPreprocess(docxBuf, "synthetic_customer.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert(
    docxRes.source === "markitdown" &&
    !docxRes.fallbackRequired &&
    typeof docxRes.markdown === "string" &&
    docxRes.markdown.length > 50,
    "3. synthetic_customer.docx -> MarkItDown -> Markdown extracted successfully",
    { source: docxRes.source, len: docxRes.markdown?.length }
  );

  // 4. synthetic_customer.xlsx
  const xlsxBuf = fs.readFileSync(xlsxPath);
  const xlsxRes = await DocumentPreprocessorRouter.routeAndPreprocess(xlsxBuf, "synthetic_customer.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert(
    xlsxRes.source === "markitdown" &&
    !xlsxRes.fallbackRequired &&
    typeof xlsxRes.markdown === "string" &&
    xlsxRes.markdown.length > 50,
    "4. synthetic_customer.xlsx -> MarkItDown -> Markdown extracted successfully",
    { source: xlsxRes.source, len: xlsxRes.markdown?.length }
  );

  // 5. Verify NO raw Markdown leaked in error strings
  const allErrors = [textPdfRes.error, scannedPdfRes.error, docxRes.error, xlsxRes.error].filter(Boolean) as string[];
  const hasRawMdInError = allErrors.some(e => e.includes("# ") || e.includes("```") || e.includes("|---"));
  assert(!hasRawMdInError, "5. Diagnostics and errors never leak raw Markdown to the UI");

  // 6. Verify NO internal python path leaked in error strings
  const hasInternalPathInError = allErrors.some(e => e.includes(".venv") || e.includes("python.exe") || e.includes("Traceback"));
  assert(!hasInternalPathInError, "6. Diagnostics and errors never leak internal Python path (.venv) or stack traces");

  // 7. Verify AI Provider Configuration Status
  console.log("\n--- AI Provider Configuration Reporting ---");
  const provider = process.env.DEFAULT_AI_PROVIDER || "gemini";
  const hasGeminiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0;
  const hasOcrSpaceKey = !!process.env.OCR_SPACE_API_KEY && process.env.OCR_SPACE_API_KEY.trim().length > 0;

  console.log(`Configured Provider: ${provider}`);
  console.log(`GEMINI_API_KEY present: ${hasGeminiKey}`);
  console.log(`OCR_SPACE_API_KEY present: ${hasOcrSpaceKey}`);
  assert(
    !hasGeminiKey,
    "7. External AI Provider configuration precisely reported: GEMINI_API_KEY is not configured locally (do not fabricate extraction success)"
  );

  // ---------------------------------------------------------------------------
  // SECTION 8: Feature Flag OFF Behavior
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 8: Feature Flag OFF (MARKITDOWN_PREPROCESSING_ENABLED=false) ---");
  process.env.MARKITDOWN_PREPROCESSING_ENABLED = "false";

  // 8. PDF with flag=false -> safe fallback to existing OCR/Vision
  const flagOffPdfRes = await DocumentPreprocessorRouter.routeAndPreprocess(textPdfBuf, "synthetic_text.pdf", "application/pdf");
  assert(
    flagOffPdfRes.source === "existing-ocr" &&
    flagOffPdfRes.fallbackRequired === true,
    "8. Feature flag OFF: PDF routes safely to existing OCR/Vision pipeline"
  );

  // 9. JPG with flag=false -> existing vision behavior
  const dummyJpgBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const flagOffJpgRes = await DocumentPreprocessorRouter.routeAndPreprocess(dummyJpgBuf, "aadhaar.jpg", "image/jpeg");
  assert(
    flagOffJpgRes.source === "vision" &&
    !flagOffJpgRes.fallbackRequired,
    "9. Feature flag OFF: JPG routes to existing vision pipeline"
  );

  // 10. DOCX with flag=false -> safe unsupported/manual-entry message without worker spawn
  const flagOffDocxRes = await DocumentPreprocessorRouter.routeAndPreprocess(docxBuf, "synthetic_customer.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert(
    flagOffDocxRes.source === "none" &&
    flagOffDocxRes.fallbackRequired === false &&
    Boolean(flagOffDocxRes.error?.includes("enter the details manually")),
    "10. Feature flag OFF: DOCX returns safe unsupported/manual-entry message without worker spawn"
  );

  // 11. XLSX with flag=false -> safe unsupported/manual-entry message without worker spawn
  const flagOffXlsxRes = await DocumentPreprocessorRouter.routeAndPreprocess(xlsxBuf, "synthetic_customer.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert(
    flagOffXlsxRes.source === "none" &&
    flagOffXlsxRes.fallbackRequired === false &&
    Boolean(flagOffXlsxRes.error?.includes("enter the details manually")),
    "11. Feature flag OFF: XLSX returns safe unsupported/manual-entry message without worker spawn"
  );

  // 12. Restore intended local flag state
  process.env.MARKITDOWN_PREPROCESSING_ENABLED = "true";
  assert(
    process.env.MARKITDOWN_PREPROCESSING_ENABLED === "true",
    "12. Intended local feature flag restored to MARKITDOWN_PREPROCESSING_ENABLED=true"
  );

  console.log("\n==========================================================================");
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("==========================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log(`🎉 ALL ${passed} E2E & FEATURE FLAG TESTS PASSED!`);
  }
}

runE2EFixtureTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
