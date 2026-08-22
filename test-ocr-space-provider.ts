import sharp from 'sharp';
import { OcrSpaceProvider } from './src/lib/ocr/OcrSpaceProvider';
import { DocumentClassifier } from './src/lib/ocr/DocumentClassifier';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';

async function createExactSizeJpeg(targetKb: number): Promise<Buffer> {
  if (targetKb < 800) {
    // 700 KB target (strictly 650 KB – 750 KB / ~700 KB)
    const width = 1340;
    const height = 890;
    const svgText = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="none"/>
        <text x="50" y="80" font-family="Arial" font-size="28" font-weight="bold" fill="#1E3A8A">GOVERNMENT OF INDIA</text>
        <text x="50" y="130" font-family="Arial" font-size="22" font-weight="bold" fill="#1E3A8A">AADHAAR</text>
        <text x="50" y="190" font-family="Arial" font-size="24" font-weight="bold" fill="#000000">TEST CUSTOMER</text>
        <text x="50" y="250" font-family="Arial" font-size="22" fill="#000000">DOB: 01/01/1990</text>
        <text x="50" y="310" font-family="Arial" font-size="22" fill="#000000">Gender: Male</text>
        <text x="50" y="380" font-family="Arial" font-size="28" font-weight="bold" fill="#000000">1234 5678 9012</text>
      </svg>
    `;
    const svgPng = await sharp(Buffer.from(svgText)).png().toBuffer();
    const rawNoise = Buffer.alloc(width * height * 3);
    let seed = 101;
    for (let i = 0; i < rawNoise.length; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      rawNoise[i] = seed % 256;
    }
    return sharp(rawNoise, { raw: { width, height, channels: 3 } })
      .composite([{ input: svgPng }])
      .jpeg({ quality: 77 })
      .toBuffer();
  }

  // 1.09 MB target (strictly 1075 KB – 1175 KB / ~1122 KB)
  const width = 1650;
  const height = 1100;
  const svgText = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="none"/>
      <text x="60" y="100" font-family="Arial" font-size="34" font-weight="bold" fill="#1E3A8A">GOVERNMENT OF INDIA</text>
      <text x="60" y="160" font-family="Arial" font-size="26" font-weight="bold" fill="#1E3A8A">AADHAAR</text>
      <text x="60" y="230" font-family="Arial" font-size="30" font-weight="bold" fill="#000000">TEST CUSTOMER</text>
      <text x="60" y="290" font-family="Arial" font-size="26" fill="#000000">DOB: 01/01/1990</text>
      <text x="60" y="350" font-family="Arial" font-size="26" fill="#000000">Gender: Male</text>
      <text x="60" y="430" font-family="Arial" font-size="34" font-weight="bold" fill="#000000">1234 5678 9012</text>
      <text x="60" y="490" font-family="Arial" font-size="22" fill="#000000">Address: 123 Station Road, Kolkata - 700001</text>
    </svg>
  `;

  const svgPng = await sharp(Buffer.from(svgText)).png().toBuffer();
  const rawNoise = Buffer.alloc(width * height * 3);
  let seed = 42;
  for (let i = 0; i < rawNoise.length; i++) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    rawNoise[i] = seed % 256;
  }

  return sharp(rawNoise, { raw: { width, height, channels: 3 } })
    .composite([{ input: svgPng }])
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function runOcrSpaceTestSuite() {
  console.log("==========================================================================");
  console.log("🧪 EXACT ~1.09 MB BOUNDARY TEST SUITE");
  console.log("==========================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // Intercept fetch to mock OCR.space response while capturing submitted binary payloads
  const originalFetch = globalThis.fetch;
  let capturedSubmittedSizeBytes = 0;
  let capturedMimeType = "";
  let capturedFilename = "";

  process.env.OCR_SPACE_API_KEY = "test_mock_key";

  globalThis.fetch = (async (url: string, init?: any) => {
    const body = init?.body;
    if (body && body instanceof FormData) {
      const fileBlob = body.get("file") as Blob;
      capturedSubmittedSizeBytes = fileBlob.size;
      capturedMimeType = fileBlob.type;
      capturedFilename = (fileBlob as any).name || "file.jpg";
    }
    return new Response(JSON.stringify({
      IsErroredOnProcessing: false,
      ParsedResults: [{
        ParsedText: "GOVERNMENT OF INDIA\nAADHAAR\nTEST CUSTOMER\nDOB: 01/01/1990\nGender: Male\n1234 5678 9012\nAddress: 123 Station Road, Kolkata - 700001"
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as any;

  try {
    // --------------------------------------------------------------------------
    // 1. EXACT ~1.09 MB BOUNDARY TEST (1075 KB – 1175 KB)
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------");
    console.log("📸 TEST 1: ACTUAL ~1.09 MB (1115 KB TARGET) JPG BOUNDARY CASE");

    const boundaryJpgBuffer = await createExactSizeJpeg(1115); // ~1.09 MB
    const actualKb = parseFloat((boundaryJpgBuffer.length / 1024).toFixed(1));

    assert(actualKb >= 1075 && actualKb <= 1175, `Actual original encoded size is strictly ~1.09 MB (${actualKb} KB)`);

    const result109 = await OcrSpaceProvider.extractText({
      buffer: boundaryJpgBuffer,
      filename: "aadhaar_1.09mb.jpg",
      mimeType: "image/jpeg"
    });

    const submittedKb = parseFloat(((result109.submittedSizeBytes || 0) / 1024).toFixed(1));

    assert(result109.success === true, "OCR.space accepted request for ~1.09 MB JPG");
    assert(result109.wasCompressed === true, "Server-side Sharp optimization triggered for ~1.09 MB JPG");
    assert(submittedKb < 900, `Submitted size to OCR.space is < 900 KB (${submittedKb} KB)`);

    // Parse & classify extracted text
    const text109 = result109.text || "";
    const classification109 = DocumentClassifier.classify(text109);
    const parsed109 = DocumentTextParser.parse(text109, classification109.documentType);

    assert(classification109.documentType.startsWith("aadhaar") === true, `Document detected: ${classification109.documentType}`);
    assert(parsed109.customer?.full_name === "TEST CUSTOMER", "Name parsed: TEST CUSTOMER");
    assert(parsed109.customer?.dob === "1990-01-01", "DOB parsed: 1990-01-01");
    assert(parsed109.customer?.gender === "male", "Gender parsed: male");
    assert(parsed109.documents?.aadhaar?.number === "123456789012", "12-digit Aadhaar parsed: 123456789012");

    const canonicalJson = {
      customer: parsed109.customer || {},
      address: parsed109.address || {},
      documents: parsed109.documents || {},
      detected_documents: parsed109.detected_documents || [],
      confidence_summary: parsed109.confidence_summary || { overall: 0.9, low_confidence_fields: [] }
    };
    assert(canonicalJson.customer?.full_name === "TEST CUSTOMER", "Canonical JSON box auto-populated with customer data");

    // --------------------------------------------------------------------------
    // 2. ~700 KB SMALL JPG FAST PATH TEST
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------");
    console.log("⚡ TEST 2: ~700 KB SMALL JPG FAST PATH CASE");

    const smallJpgBuffer = await createExactSizeJpeg(700); // ~700 KB
    const smallKb = parseFloat((smallJpgBuffer.length / 1024).toFixed(1));
    assert(smallKb >= 650 && smallKb <= 750, `Small JPG size is ~700 KB (${smallKb} KB)`);

    const result700 = await OcrSpaceProvider.extractText({
      buffer: smallJpgBuffer,
      filename: "small_aadhaar_700kb.jpg",
      mimeType: "image/jpeg"
    });

    assert(result700.wasCompressed === false, "Optimization triggered for clean ~700 KB JPG: NO");
    assert(result700.submittedSizeBytes === smallJpgBuffer.length, `Original buffer submitted unchanged (${((result700.submittedSizeBytes || 0) / 1024).toFixed(1)} KB)`);

    // --------------------------------------------------------------------------
    // 3. ~1.09 MB PDF REJECTION CONTRAST TEST
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------");
    console.log("📄 TEST 3: ~1.09 MB PDF FREE-PLAN REJECTION CONTRAST CASE");

    capturedSubmittedSizeBytes = 0; // Reset network intercept tracker
    const pdf109Buffer = Buffer.alloc(1115 * 1024); // ~1.09 MB PDF

    const pdfResult = await OcrSpaceProvider.extractText({
      buffer: pdf109Buffer,
      filename: "document_1.09mb.pdf",
      mimeType: "application/pdf"
    });

    assert(pdfResult.success === false, "PDF ~1.09 MB rejected: YES");
    assert(pdfResult.errorCategory === "FILE_LIMIT", "PDF error category: FILE_LIMIT");
    assert(capturedSubmittedSizeBytes === 0, "OCR.space request sent for ~1.09 MB PDF: NO");

    // --------------------------------------------------------------------------
    // 4. HTTP 503 / 502 / 504 RETRY MATRIX TESTS (CASES A THROUGH J)
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------");
    console.log("🛡️ TEST 4: HTTP 503 / 502 / 504 RETRY & ERROR MATRIX (CASES A THROUGH J)");

    OcrSpaceProvider.resetCircuitBreaker();

    // CASE A: 503 -> Success (2 attempts)
    let callCountA = 0;
    globalThis.fetch = (async () => {
      callCountA++;
      if (callCountA === 1) {
        return new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" });
      }
      return new Response(JSON.stringify({
        IsErroredOnProcessing: false,
        ParsedResults: [{ ParsedText: "Case A Text" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;

    const resA = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "a.jpg", mimeType: "image/jpeg" });
    assert(resA.success === true, "Case A: 503 -> success succeeded");
    assert(resA.attemptsCount === 2, `Case A: Expected 2 attempts | Got ${resA.attemptsCount}`);

    // CASE B: 503 -> 503 -> Success (3 attempts)
    OcrSpaceProvider.resetCircuitBreaker();
    let callCountB = 0;
    globalThis.fetch = (async () => {
      callCountB++;
      if (callCountB <= 2) {
        return new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" });
      }
      return new Response(JSON.stringify({
        IsErroredOnProcessing: false,
        ParsedResults: [{ ParsedText: "Case B Text" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;

    const resB = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "b.jpg", mimeType: "image/jpeg" });
    assert(resB.success === true, "Case B: 503 -> 503 -> success succeeded");
    assert(resB.attemptsCount === 3, `Case B: Expected 3 attempts | Got ${resB.attemptsCount}`);

    // CASE C: 503 -> 503 -> 503 (Repeated 503 failure)
    OcrSpaceProvider.resetCircuitBreaker();
    let callCountC = 0;
    globalThis.fetch = (async () => {
      callCountC++;
      return new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" });
    }) as any;

    const resC = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "c.jpg", mimeType: "image/jpeg" });
    assert(resC.success === false, "Case C: Repeated 503 fails gracefully");
    assert(resC.errorCategory === "SERVICE_UNAVAILABLE", `Case C category: SERVICE_UNAVAILABLE (${resC.errorCategory})`);
    assert(resC.error === "OCR.space is temporarily unavailable. Please try again in a moment.", `Case C clean user message: ${resC.error}`);
    assert(resC.attemptsCount === 3, `Case C: Expected 3 attempts | Got ${resC.attemptsCount}`);

    // CASE D: 502 -> Success (2 attempts)
    OcrSpaceProvider.resetCircuitBreaker();
    let callCountD = 0;
    globalThis.fetch = (async () => {
      callCountD++;
      if (callCountD === 1) return new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" });
      return new Response(JSON.stringify({ IsErroredOnProcessing: false, ParsedResults: [{ ParsedText: "Case D Text" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;

    const resD = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "d.jpg", mimeType: "image/jpeg" });
    assert(resD.success === true && resD.attemptsCount === 2, "Case D: 502 -> retry -> success");

    // CASE E: 504 -> Success (2 attempts)
    OcrSpaceProvider.resetCircuitBreaker();
    let callCountE = 0;
    globalThis.fetch = (async () => {
      callCountE++;
      if (callCountE === 1) return new Response("Gateway Timeout", { status: 504, statusText: "Gateway Timeout" });
      return new Response(JSON.stringify({ IsErroredOnProcessing: false, ParsedResults: [{ ParsedText: "Case E Text" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;

    const resE = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "e.jpg", mimeType: "image/jpeg" });
    assert(resE.success === true && resE.attemptsCount === 2, "Case E: 504 -> retry -> success");

    // CASE F: 401 Unauthorized (1 attempt only)
    OcrSpaceProvider.resetCircuitBreaker();
    let callCountF = 0;
    globalThis.fetch = (async () => {
      callCountF++;
      return new Response("Unauthorized", { status: 401 });
    }) as any;

    const resF = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "f.jpg", mimeType: "image/jpeg" });
    assert(resF.success === false, "Case F: 401 fails");
    assert(resF.errorCategory === "AUTHENTICATION", "Case F category: AUTHENTICATION");
    assert(callCountF === 1, `Case F: Non-retryable 401 attempt count is 1 (${callCountF})`);

    // CASE G: 413 File Limit (1 attempt only)
    OcrSpaceProvider.resetCircuitBreaker();
    let callCountG = 0;
    globalThis.fetch = (async () => {
      callCountG++;
      return new Response("Payload Too Large", { status: 413 });
    }) as any;

    const resG = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "g.jpg", mimeType: "image/jpeg" });
    assert(resG.success === false, "Case G: 413 fails");
    assert(resG.errorCategory === "FILE_LIMIT", "Case G category: FILE_LIMIT");
    assert(callCountG === 1, `Case G: Non-retryable 413 attempt count is 1 (${callCountG})`);

    // CASE H: 429 Rate Limit (1 attempt only, RATE_LIMIT category)
    OcrSpaceProvider.resetCircuitBreaker();
    let callCountH = 0;
    globalThis.fetch = (async () => {
      callCountH++;
      return new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "2" } });
    }) as any;

    const resH = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "h.jpg", mimeType: "image/jpeg" });
    assert(resH.success === false, "Case H: 429 fails");
    assert(resH.errorCategory === "RATE_LIMIT", "Case H category: RATE_LIMIT");
    assert(callCountH === 1, `Case H: Rate limit 429 does not execute 503 retry policy (${callCountH})`);

    // CASE I: HTML Error Page with HTTP 503 (No JSON parser crash)
    OcrSpaceProvider.resetCircuitBreaker();
    let callCountI = 0;
    globalThis.fetch = (async () => {
      callCountI++;
      return new Response("<html><head><title>503 Service Unavailable</title></head><body>503 Service Temporarily Unavailable</body></html>", {
        status: 503,
        headers: { "Content-Type": "text/html" }
      });
    }) as any;

    const resI = await OcrSpaceProvider.extractText({ buffer: Buffer.from("test"), filename: "i.jpg", mimeType: "image/jpeg" });
    assert(resI.success === false, "Case I: HTML 503 error handled cleanly");
    assert(resI.errorCategory === "SERVICE_UNAVAILABLE", "Case I category: SERVICE_UNAVAILABLE");
    assert(resI.error === "OCR.space is temporarily unavailable. Please try again in a moment.", "Case I clean message without JSON parser crash");

    // CASE J: Prepared 1.09 MB JPG compressed once across retries
    OcrSpaceProvider.resetCircuitBreaker();
    let submittedSizesJ: number[] = [];
    globalThis.fetch = (async (url: string, init?: any) => {
      const body = init?.body;
      if (body && body instanceof FormData) {
        const fileBlob = body.get("file") as Blob;
        submittedSizesJ.push(fileBlob.size);
      }
      if (submittedSizesJ.length < 2) {
        return new Response("Service Unavailable", { status: 503 });
      }
      return new Response(JSON.stringify({
        IsErroredOnProcessing: false,
        ParsedResults: [{ ParsedText: "Case J Text" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;

    const boundaryJpgJ = await createExactSizeJpeg(1115);
    const resJ = await OcrSpaceProvider.extractText({ buffer: boundaryJpgJ, filename: "j.jpg", mimeType: "image/jpeg" });
    assert(resJ.success === true, "Case J: Retry with prepared image succeeded");
    assert(submittedSizesJ.length === 2, `Case J: 2 retry attempts executed (${submittedSizesJ.length})`);
    assert(submittedSizesJ[0] === submittedSizesJ[1], `Case J: Same prepared buffer size used across retries (${submittedSizesJ[0]} bytes vs ${submittedSizesJ[1]} bytes)`);

  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OCR_SPACE_API_KEY;
  }

  console.log("==========================================================================");
  console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================================");

  if (failed > 0) process.exit(1);
}

runOcrSpaceTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});

