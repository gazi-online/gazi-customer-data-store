import { DocumentClassifier } from './src/lib/ocr/DocumentClassifier';

console.log("==========================================================================");
console.log("🧪 LOCAL DOCUMENT CLASSIFIER TEST SUITE");
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

// 1. Aadhaar Front
const resAadhaarFront = DocumentClassifier.classify(`
  GOVERNMENT OF INDIA
  Unique Identification Authority of India
  To
  Dipika Roy
  DOB: 15/05/1992
  MALE
  9999 8888 7777
`);
report("Aadhaar Front classification", resAadhaarFront.documentType === 'aadhaar_front' && resAadhaarFront.confidence >= 0.5, resAadhaarFront);

// 2. Aadhaar Back
const resAadhaarBack = DocumentClassifier.classify(`
  Address:
  S/O: Ramesh Roy, 45B Park Street,
  Kolkata, West Bengal, 700016
  UIDAI
`);
report("Aadhaar Back classification", resAadhaarBack.documentType === 'aadhaar_back' && resAadhaarBack.confidence >= 0.4, resAadhaarBack);

// 3. Aadhaar Combined
const resAadhaarComb = DocumentClassifier.classify(`
  GOVERNMENT OF INDIA
  DOB: 15/05/1992 MALE
  9999 8888 7777
  Address: S/O Ramesh Roy, 45B Park Street, Kolkata, PIN 700016
`);
report("Aadhaar Combined classification", resAadhaarComb.documentType === 'aadhaar_combined', resAadhaarComb);

// 4. PAN Card
const resPan = DocumentClassifier.classify(`
  INCOME TAX DEPARTMENT
  GOVT. OF INDIA
  PERMANENT ACCOUNT NUMBER
  ABCDE1234F
  RAHUL KUMAR
`);
report("PAN Card classification", resPan.documentType === 'pan_card' && resPan.confidence >= 0.6, resPan);

// 5. Voter ID
const resVoter = DocumentClassifier.classify(`
  ELECTION COMMISSION OF INDIA
  ELECTOR PHOTO IDENTITY CARD
  WB/01/123/456789
  NAME: MOHAMMAD ISLAM GAZI
`);
report("Voter ID classification", resVoter.documentType === 'voter_id' && resVoter.confidence >= 0.5, resVoter);

// 6. Ration Card
const resRation = DocumentClassifier.classify(`
  KHADYA SURAKSHA RATION CARD
  DEPARTMENT OF FOOD & SUPPLIES
  FPS: 1045
`);
report("Ration Card classification", resRation.documentType === 'ration_card', resRation);

// 7. Passbook
const resPassbook = DocumentClassifier.classify(`
  STATE BANK OF INDIA
  SAVINGS BANK PASSBOOK
  ACCOUNT NUMBER: 123456789012
  IFSC CODE: SBIN0001234
`);
report("Bank Passbook classification", resPassbook.documentType === 'bank_passbook', resPassbook);

// 8. Unknown safety
const resUnknown = DocumentClassifier.classify("Random text line without identity signals 1234");
report("Unknown safety (no fabricated type)", resUnknown.documentType === 'unknown' && resUnknown.confidence === 0, resUnknown);

console.log("==========================================================================");
console.log(`CLASSIFIER TEST RESULT: ${passCount} PASSED, ${failCount} FAILED`);
console.log("==========================================================================");

if (failCount > 0) process.exit(1);
