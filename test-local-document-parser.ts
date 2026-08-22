import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';
import { DataNormalizer } from './src/components/AiSmartImportEngine/DataNormalizer';
import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';

console.log("==========================================================================");
console.log("🧪 LOCAL DOCUMENT PARSER TEST SUITE");
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

// 1. Aadhaar Number & DOB & Gender
const pAadhaar = DocumentTextParser.parse(`
  GOVERNMENT OF INDIA
  Dipika Roy
  DOB: 15/05/1992
  FEMALE
  9999 8888 7777
`, 'aadhaar_front');

report("Aadhaar Number extraction", pAadhaar.documents?.aadhaar?.number === '999988887777', pAadhaar);
report("Aadhaar DOB extraction (normalized)", pAadhaar.customer?.dob === '1992-05-15', pAadhaar);
report("Aadhaar Gender extraction", pAadhaar.customer?.gender === 'female', pAadhaar);

// 2. PAN Number & Name & Father Name & DOB
const pPan = DocumentTextParser.parse(`
  INCOME TAX DEPARTMENT
  GOVT. OF INDIA
  Name: RAHUL KUMAR
  Father Name: SURESH KUMAR
  Date of Birth: 10/01/1995
  Permanent Account Number: ABCDE1234F
`, 'pan_card');

report("PAN Number extraction", pPan.documents?.pan?.number === 'ABCDE1234F', pPan);
report("PAN Name extraction", pPan.customer?.full_name === 'RAHUL KUMAR', pPan);
report("PAN Father Name extraction", pPan.customer?.father_name === 'SURESH KUMAR', pPan);
report("PAN DOB extraction", pPan.customer?.dob === '1995-01-10', pPan);

// 3. Voter ID & Relationships
const pVoter = DocumentTextParser.parse(`
  ELECTION COMMISSION OF INDIA
  ELECTOR PHOTO IDENTITY CARD
  EPIC: WB/01/123/456789
  Name: MOHAMMAD ISLAM GAZI
  Father's Name: ABDUL GAZI
`, 'voter_id');

report("Voter ID extraction", pVoter.documents?.voter_id?.number === 'WB/01/123/456789', pVoter);
report("Voter Name extraction", pVoter.customer?.full_name === 'MOHAMMAD ISLAM GAZI', pVoter);
report("Voter Father Name extraction", pVoter.customer?.father_name === 'ABDUL GAZI', pVoter);

// 4. Relationship Safety: S/O -> father, W/O -> spouse, C/O -> ambiguous
const pRelFather = DocumentTextParser.parse(`Address: S/O: Ramesh Roy, Kolkata 700016`, 'aadhaar_back');
report("S/O mapped to father_name", pRelFather.customer?.father_name === 'Ramesh Roy', pRelFather);

const pRelSpouse = DocumentTextParser.parse(`Address: W/O: Amit Kumar, Kolkata 700016`, 'aadhaar_back');
report("W/O mapped to spouse_name", pRelSpouse.customer?.spouse_name === 'Amit Kumar', pRelSpouse);

const pRelCareOf = DocumentTextParser.parse(`Address: C/O: Sunita Sharma, Kolkata 700016`, 'aadhaar_back');
report("C/O NOT mapped to father or spouse (ambiguous)", pRelCareOf.customer?.father_name === undefined && pRelCareOf.customer?.spouse_name === undefined && pRelCareOf.diagnostic_data?.care_of === 'Sunita Sharma', pRelCareOf);

// 5. PIN Code Extraction
report("PIN Code extraction", pRelFather.address?.pincode === '700016', pRelFather);

// --------------------------------------------------------------------------
// REAL DOCUMENT TEST MATRIX (FIXTURES A THROUGH J)
// --------------------------------------------------------------------------
console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE A: Aadhaar Front — English Name");
const fixA = DocumentTextParser.parse(`
  GOVERNMENT OF INDIA
  Reshma Khatun
  DOB: 01/01/1990
  FEMALE
  1234 5678 9012
`, 'aadhaar_front');
report("Fixture A: full_name extracted", fixA.customer?.full_name === 'Reshma Khatun', fixA);
report("Fixture A: first/middle/last explicit fields are NOT fabricated", (fixA.customer as any)?.first_name === undefined && (fixA.customer as any)?.last_name === undefined, fixA);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE B: Aadhaar Front — Hindi + English Name");
const fixB = DocumentTextParser.parse(`
  भारत सरकार
  GOVERNMENT OF INDIA
  रेशमा खातून
  Reshma Khatun
  जन्म तिथि / DOB: 01/01/1990
  महिला / FEMALE
  1234 5678 9012
`, 'aadhaar_front');
report("Fixture B: full_name (Latin) extracted", fixB.customer?.full_name === 'Reshma Khatun', fixB);
report("Fixture B: original_language_name (Hindi) preserved", fixB.customer?.original_language_name === 'रेशमा खातून', fixB);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE C: Aadhaar Front — Bengali + English Name");
const fixC = DocumentTextParser.parse(`
  ইউনিক আইডেন্টিফিকেশন অথরিটি অব ইন্ডিয়া
  GOVERNMENT OF INDIA
  রেশমা খাতুন
  Reshma Khatun
  DOB: 01/01/1990
  FEMALE
  1234 5678 9012
`, 'aadhaar_front');
report("Fixture C: full_name (Latin) extracted", fixC.customer?.full_name === 'Reshma Khatun', fixC);
report("Fixture C: original_language_name (Bengali) preserved", fixC.customer?.original_language_name === 'রেশমা খাতুন', fixC);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE D: Aadhaar Back — Multiline Address");
const fixD = DocumentTextParser.parse(`
  Address:
  S/O: Abdul Gazi
  123 Station Road, Ward No 4
  PO: Park Street, Dist: Kolkata
  State: West Bengal - 700001
  UIDAI
`, 'aadhaar_back');
report("Fixture D: full_address extracted multiline", fixD.address?.full_address?.includes('123 Station Road') === true, fixD);
report("Fixture D: pincode extracted", fixD.address?.pincode === '700001', fixD);
report("Fixture D: state extracted", fixD.address?.state === 'West Bengal', fixD);
report("Fixture D: district extracted", fixD.address?.district === 'Kolkata', fixD);
report("Fixture D: post_office extracted", fixD.address?.post_office === 'Park Street', fixD);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE E: Aadhaar Front + Back Together (Normalizer & Priority Check)");
const normFrontE = DataNormalizer.normalize({
  customer: { full_name: 'Reshma Khatun', dob: '1990-01-01' },
  address: { full_address: 'Weak front text' }
});
const normBackE = DataNormalizer.normalize({
  customer: {},
  address: { full_address: '123 Station Road, Kolkata, West Bengal - 700001', pincode: '700001', state: 'West Bengal', district: 'Kolkata' }
});
const mergeResultE = MergeEngine.merge([
  { id: '1', documentType: 'Aadhaar Card Front', provider: 'manual', source: 'file', status: 'completed', normalizedData: normFrontE, version: 1 },
  { id: '2', documentType: 'Aadhaar Card Back', provider: 'manual', source: 'file', status: 'completed', normalizedData: normBackE, version: 1 }
]);
report("Fixture E: full_name from front preserved", mergeResultE.data.full_name?.value === 'Reshma Khatun', mergeResultE);
report("Fixture E: address from Aadhaar Back wins over Front", mergeResultE.data.address?.value?.includes('123 Station Road') === true, mergeResultE);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE F: PAN — Customer + Father Name Distinction");
const fixF = DocumentTextParser.parse(`
  INCOME TAX DEPARTMENT
  GOVT. OF INDIA
  MOHAMMAD ISLAM GAZI
  ABDUL GAZI
  01/01/1990
  Permanent Account Number: ABCDE1234F
`, 'pan_card');
report("Fixture F: full_name is customer", fixF.customer?.full_name === 'MOHAMMAD ISLAM GAZI', fixF);
report("Fixture F: father_name distinct from full_name", fixF.customer?.father_name === 'ABDUL GAZI', fixF);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE G: Voter — Customer + Father");
const fixG = DocumentTextParser.parse(`
  ELECTION COMMISSION OF INDIA
  Name: DIPU ROY
  Father's Name: RAMESH ROY
  EPIC: WB1234567
`, 'voter_id');
report("Fixture G: full_name is Dipu Roy", fixG.customer?.full_name === 'DIPU ROY', fixG);
report("Fixture G: father_name is Ramesh Roy", fixG.customer?.father_name === 'RAMESH ROY', fixG);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE H: Voter — Customer + Husband");
const fixH = DocumentTextParser.parse(`
  ELECTION COMMISSION OF INDIA
  Name: ANITA SHARMA
  Husband's Name: AMIT SHARMA
  EPIC: WB7654321
`, 'voter_id');
report("Fixture H: full_name is Anita Sharma", fixH.customer?.full_name === 'ANITA SHARMA', fixH);
report("Fixture H: spouse_name is Amit Sharma", fixH.customer?.spouse_name === 'AMIT SHARMA', fixH);
report("Fixture H: father_name is not set", fixH.customer?.father_name === undefined, fixH);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE I: Noisy OCR Text");
const fixI = DocumentTextParser.parse(`
  ...---=== GOVERNMENT OF INDIA ===---...
  :: Reshma Khatun ::
  DOB :: 01/01/1990
  FEMALE !!
  1234 5678 9012
`, 'aadhaar_front');
report("Fixture I: full_name extracted despite OCR punctuation noise", fixI.customer?.full_name === 'Reshma Khatun', fixI);

console.log("--------------------------------------------------------------------------");
console.log("📄 FIXTURE J: Native Script Only Name");
const fixJ = DocumentTextParser.parse(`
  भारत सरकार
  रेशमा खातून
  DOB: 01/01/1990
  FEMALE
`, 'aadhaar_front');
report("Fixture J: original_language_name preserved", fixJ.customer?.original_language_name === 'रेशमा खातून', fixJ);
report("Fixture J: full_name NOT fabricated as fake English string", fixJ.customer?.full_name === undefined, fixJ);

console.log("==========================================================================");
console.log(`PARSER TEST RESULT: ${passCount} PASSED, ${failCount} FAILED`);
console.log("==========================================================================");

if (failCount > 0) process.exit(1);
