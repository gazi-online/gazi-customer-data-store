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
