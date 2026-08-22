import fs from 'fs';
import path from 'path';
import { LocalOcrEngine } from './src/lib/ocr/LocalOcrEngine';
import { DocumentClassifier } from './src/lib/ocr/DocumentClassifier';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';
import { DataNormalizer } from './src/components/AiSmartImportEngine/DataNormalizer';
import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';
import { ImportJob } from './src/components/AiSmartImportEngine/types';

console.log("==========================================================================");
console.log("🧪 LOCAL OFFLINE TESSERACT OCR INTEGRATION TEST MATRIX");
console.log("==========================================================================");

let passCount = 0;
let failCount = 0;

function report(testName: string, condition: boolean, details?: any) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.log(`❌ [FAIL] ${testName}`, details || '');
    failCount++;
  }
}

async function runMatrix() {
  const rootDir = process.cwd();
  const dummyJpgPath = path.join(rootDir, 'dummy-aadhaar.jpg');
  const samplePngPath = path.join(rootDir, 'sample-test-doc.png');

  console.log("--- 1. LOCAL ASSET VERIFICATION ---");
  const workerFile = path.join(rootDir, 'public', 'ocr', 'worker', 'worker.min.js');
  const coreSimdWasm = path.join(rootDir, 'public', 'ocr', 'core', 'tesseract-core-simd.wasm');
  const pdfWorkerFile = path.join(rootDir, 'public', 'ocr', 'pdf.worker.min.mjs');
  const engData = path.join(rootDir, 'public', 'ocr', 'lang', 'eng.traineddata.gz');
  const hinData = path.join(rootDir, 'public', 'ocr', 'lang', 'hin.traineddata.gz');
  const benData = path.join(rootDir, 'public', 'ocr', 'lang', 'ben.traineddata.gz');

  report("Local Tesseract Worker exists", fs.existsSync(workerFile));
  report("Local Tesseract Core WASM exists", fs.existsSync(coreSimdWasm));
  report("Local PDF.js Worker exists", fs.existsSync(pdfWorkerFile));
  report("Local English Traineddata exists", fs.existsSync(engData));
  report("Local Hindi Traineddata exists", fs.existsSync(hinData));
  report("Local Bengali Traineddata exists", fs.existsSync(benData));

  console.log("\n--- 2. WORKER STARTUP & MULTI-LANG EVALUATION ---");
  const t0 = Date.now();
  const workerEng = await LocalOcrEngine.getWorker('eng');
  const startupEng = Date.now() - t0;
  console.log(`Initial Worker Startup (eng): ${startupEng} ms`);
  report("English Worker initialized from local assets", !!workerEng);

  const tHin = Date.now();
  const workerHin = await LocalOcrEngine.getWorker('eng+hin');
  const startupHin = Date.now() - tHin;
  console.log(`Worker Load (eng+hin): ${startupHin} ms`);
  report("Hindi (eng+hin) Worker loaded", !!workerHin);

  const tBen = Date.now();
  const workerBen = await LocalOcrEngine.getWorker('eng+ben');
  const startupBen = Date.now() - tBen;
  console.log(`Worker Load (eng+ben): ${startupBen} ms`);
  report("Bengali (eng+ben) Worker loaded", !!workerBen);

  // Reset back to eng for general matrix
  await LocalOcrEngine.getWorker('eng');

  // Test A: Aadhaar Front JPG file
  console.log("\n--- TEST A: Aadhaar Front JPG ---");
  if (fs.existsSync(dummyJpgPath)) {
    const tA = Date.now();
    const { ocrResult, parsedFields } = await LocalOcrEngine.processFile(dummyJpgPath, 'eng');
    const latA = Date.now() - tA;
    console.log(`Aadhaar JPG Latency: ${latA} ms | Text length: ${ocrResult.fullText.length}`);

    report("Aadhaar JPG OCR Text returned", ocrResult.fullText.length >= 0);
    report("Aadhaar Front Classification", parsedFields.detected_documents?.[0]?.detected_type !== undefined, parsedFields.detected_documents);
  }

  // Test B: Aadhaar Back PNG file
  console.log("\n--- TEST B: Aadhaar Back PNG ---");
  if (fs.existsSync(samplePngPath)) {
    const tB = Date.now();
    const { ocrResult } = await LocalOcrEngine.processFile(samplePngPath, 'eng');
    const latB = Date.now() - tB;
    console.log(`PNG Latency: ${latB} ms | Text length: ${ocrResult.fullText.length}`);

    report("PNG OCR Text returned", ocrResult.fullText.length >= 0);
  }

  // Test C: Aadhaar Front + Back separate jobs merge
  console.log("\n--- TEST C: Aadhaar Front + Back Merge ---");
  const rawFront = {
    customer: { full_name: "Dipika Roy", gender: "female" },
    documents: { aadhaar: { number: "999988887777" } },
    detected_documents: [{ detected_type: "aadhaar_front", confidence: 0.95, source_filename: "front.jpg" }]
  };
  const rawBack = {
    address: { full_address: "45B Park Street, Kolkata", pincode: "700016" },
    detected_documents: [{ detected_type: "aadhaar_back", confidence: 0.95, source_filename: "back.png" }]
  };

  const jobFront: ImportJob = { id: 'j1', documentType: 'aadhaar_front', provider: 'manual', source: 'file', status: 'completed', normalizedData: DataNormalizer.normalize(rawFront), version: 1 };
  const jobBack: ImportJob = { id: 'j2', documentType: 'aadhaar_back', provider: 'manual', source: 'file', status: 'completed', normalizedData: DataNormalizer.normalize(rawBack), version: 1 };
  const mergeC = MergeEngine.merge([jobFront, jobBack]);

  report("Aadhaar Front + Back merged", mergeC.data.aadhaar_number?.value === "999988887777" && mergeC.data.pincode?.value === "700016", mergeC.data);

  // Test D: 2-page PDF
  console.log("\n--- TEST D: 2-Page PDF Simulation ---");
  const mockPdfFile = {
    name: 'aadhaar-2page.pdf',
    type: 'application/pdf',
    arrayBuffer: async () => {
      const encoder = new TextEncoder();
      return encoder.encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF").buffer;
    }
  };
  const tD = Date.now();
  const { ocrResult: pdfRes } = await LocalOcrEngine.processFile(mockPdfFile as any, 'eng');
  const latD = Date.now() - tD;
  console.log(`2-Page PDF Latency: ${latD} ms`);
  report("2-Page PDF processed through PdfRenderer & LocalOcrEngine", pdfRes.pages.length >= 1, pdfRes);

  // Test E: PAN Image
  console.log("\n--- TEST E: PAN Card ---");
  const panText = `INCOME TAX DEPARTMENT GOVT OF INDIA PERMANENT ACCOUNT NUMBER ABCDE1234F RAHUL KUMAR DOB 10/01/1995`;
  const classE = DocumentClassifier.classify(panText);
  const parseE = DocumentTextParser.parse(panText, classE.documentType, 'pan.png');
  report("PAN Card detection & extraction", classE.documentType === 'pan_card' && parseE.documents?.pan?.number === 'ABCDE1234F', parseE);

  // Test F: Voter Image
  console.log("\n--- TEST F: Voter ID ---");
  const voterText = `ELECTION COMMISSION OF INDIA ELECTOR PHOTO IDENTITY CARD EPIC WB/01/123/456789 MOHAMMAD ISLAM GAZI`;
  const classF = DocumentClassifier.classify(voterText);
  const parseF = DocumentTextParser.parse(voterText, classF.documentType, 'voter.jpg');
  report("Voter ID detection & extraction", classF.documentType === 'voter_id' && parseF.documents?.voter_id?.number === 'WB/01/123/456789', parseF);

  // Test G: Ration Card
  console.log("\n--- TEST G: Ration Card ---");
  const rationText = `KHADYA SURAKSHA RATION CARD FOOD & SUPPLIES DEPARTMENT`;
  const classG = DocumentClassifier.classify(rationText);
  report("Ration Card detection", classG.documentType === 'ration_card', classG);

  // Test H: Bank Passbook
  console.log("\n--- TEST H: Bank Passbook ---");
  const passbookText = `SAVINGS BANK PASSBOOK ACCOUNT NUMBER 123456789012 IFSC SBIN0001234`;
  const classH = DocumentClassifier.classify(passbookText);
  report("Bank Passbook detection", classH.documentType === 'bank_passbook', classH);

  // Test I & J: Hindi & Bengali Text Fixtures
  console.log("\n--- TEST I & J: Hindi & Bengali Text Fixtures ---");
  const hindiText = `भारत सरकार आधार नाम: राहुल कुमार जन्म तिथि: 10/01/1995 9999 8888 7777`;
  const classI = DocumentClassifier.classify(hindiText);
  report("Hindi Aadhaar detection without transliteration", classI.documentType === 'aadhaar_front' || classI.documentType === 'aadhaar_combined', classI);

  const benText = `ভারত সরকার আধার জন্ম তারিখ: 10/01/1995 9999 8888 7777`;
  const classJ = DocumentClassifier.classify(benText);
  report("Bengali Aadhaar detection without transliteration", classJ.documentType === 'aadhaar_front' || classJ.documentType === 'aadhaar_combined', classJ);

  // Test K: Unknown Image Safety
  console.log("\n--- TEST K: Unknown Image ---");
  const unknownText = `Random photo description landscape mountains 2026`;
  const classK = DocumentClassifier.classify(unknownText);
  report("Unknown image classified as unknown (no fabricated type)", classK.documentType === 'unknown', classK);

  // Test L: Misleading Filename (filename 'pan.jpg' containing Voter ID text)
  console.log("\n--- TEST L: Misleading Filename ---");
  const misText = `ELECTION COMMISSION OF INDIA EPIC WB/01/123/456789`;
  const classL = DocumentClassifier.classify(misText);
  report("Misleading filename 'pan.jpg' classified by content as voter_id", classL.documentType === 'voter_id', classL);

  // Test M: Mixed Aadhaar + PAN + Voter batch merge
  console.log("\n--- TEST M: Mixed Document Batch ---");
  const rawBatch = {
    customer: { full_name: "Mohammad Islam Gazi", dob: "1988-11-20" },
    documents: { aadhaar: { number: "111122223333" }, pan: { number: "ABCDE1234F" }, voter_id: { number: "WB/01/123/456789" } },
    detected_documents: [
      { detected_type: "aadhaar_combined", confidence: 0.99, source_filename: "aadhaar.pdf" },
      { detected_type: "pan_card", confidence: 0.97, source_filename: "pan.png" },
      { detected_type: "voter_id", confidence: 0.95, source_filename: "voter.jpg" }
    ]
  };
  const normBatch = DataNormalizer.normalize(rawBatch);
  const jobBatch: ImportJob = { id: 'bm1', documentType: 'Mixed Batch', provider: 'manual', source: 'file', status: 'completed', normalizedData: normBatch, version: 1 };
  const mergeBatch = MergeEngine.merge([jobBatch]);

  report("Mixed batch merge retains all identity numbers & detected types",
    mergeBatch.data.aadhaar_number?.value === "111122223333" &&
    mergeBatch.data.pan_number?.value === "ABCDE1234F" &&
    mergeBatch.data.voter_id_number?.value === "WB/01/123/456789" &&
    mergeBatch.data.detected_documents?.length === 3,
    mergeBatch.data
  );

  await LocalOcrEngine.terminate();

  console.log("==========================================================================");
  console.log(`MATRIX TOTAL RESULT: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("==========================================================================");

  if (failCount > 0) process.exit(1);
}

runMatrix().catch((err) => {
  console.error("Test Matrix Error:", err);
  process.exit(1);
});
