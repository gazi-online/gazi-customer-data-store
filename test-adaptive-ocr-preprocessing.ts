import { LocalOcrEngine } from './src/lib/ocr/LocalOcrEngine';
import { ImagePreprocessor } from './src/lib/ocr/ImagePreprocessor';
import { DocumentClassifier } from './src/lib/ocr/DocumentClassifier';
import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';

async function runAdaptiveTest() {
  console.log("==========================================================================");
  console.log("🧪 ADAPTIVE LOCAL OCR PREPROCESSING & QUALITY SCORING SUITE");
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

  // 1. Clean Text Fixture Test (Fast-path ORIGINAL variant check)
  const cleanAadhaarText = `
    GOVERNMENT OF INDIA
    Dipika Roy
    DOB: 15/05/1992
    FEMALE
    9999 8888 7777
  `;
  const evalClean = LocalOcrEngine.evaluateVariant('ORIGINAL', cleanAadhaarText, 0.95, 'aadhaar.jpg');
  assert(evalClean.variant === 'ORIGINAL', "Clean image uses ORIGINAL variant");
  assert(evalClean.classification.documentType === 'aadhaar_front', "Clean image classified as aadhaar_front");
  assert(evalClean.qualityScore > 60, "Clean image quality score > 60");

  // 2. Garbled / Low Quality Evaluation Check
  const garbledText = "half 3 Bae be, Ey, 3 pre NN Vio kh. 2 8 T \\ pu z a SAN";
  const evalGarbled = LocalOcrEngine.evaluateVariant('ORIGINAL', garbledText, 0.30, 'dummy.jpg');
  assert(evalGarbled.classification.documentType === 'unknown', "Garbled text classified as unknown");
  assert(evalGarbled.qualityScore < 30, "Garbled text quality score < 30");

  // 3. Preprocessing Variant Output Check
  const dummyBuffer = Buffer.from('RIFF....WEBPVP8.....', 'utf-8');
  try {
    const processedB = await ImagePreprocessor.processVariantB(dummyBuffer);
    assert(processedB !== null, "ImagePreprocessor processVariantB executes cleanly");
  } catch {
    console.log("❌ [FAIL] ImagePreprocessor processVariantB threw exception");
    failed++;
  }

  // 4. Quality Scoring Comparison Check
  const lowText = "Government India 9999 8888 7777";
  const highText = "GOVERNMENT OF INDIA Dipika Roy DOB: 15/05/1992 FEMALE 9999 8888 7777";
  const evalLow = LocalOcrEngine.evaluateVariant('ORIGINAL', lowText, 0.50, 'aadhaar.jpg');
  const evalHigh = LocalOcrEngine.evaluateVariant('CONTRAST', highText, 0.90, 'aadhaar.jpg');

  assert(evalHigh.qualityScore > evalLow.qualityScore, "Higher field count & confidence yields higher quality score");

  // 5. Hindi & Bengali Script Preservation Check
  const hindiText = "भारत सरकार\nदीिपका रॉय\nजन्म तिथि: 15/05/1992\nमहिला\n9999 8888 7777";
  const bengaliText = "ভারত সরকার\nদীপিকা রায়\nজন্ম তারিখ: 15/05/1992\nমহিলা\n9999 8888 7777";

  const evalHindi = LocalOcrEngine.evaluateVariant('ORIGINAL', hindiText, 0.92, 'hindi.jpg');
  const evalBengali = LocalOcrEngine.evaluateVariant('ORIGINAL', bengaliText, 0.92, 'bengali.jpg');

  assert(evalHindi.classification.documentType === 'aadhaar_front', "Hindi Aadhaar text correctly classified");
  assert(evalBengali.classification.documentType === 'aadhaar_front', "Bengali Aadhaar text correctly classified");

  console.log("==========================================================================");
  console.log(`TOTAL ADAPTIVE OCR TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================================");

  await LocalOcrEngine.terminate();

  if (failed > 0) process.exit(1);
}

runAdaptiveTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
