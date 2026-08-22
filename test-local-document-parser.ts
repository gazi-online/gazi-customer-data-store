import { DocumentTextParser } from './src/lib/ocr/DocumentTextParser';

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

console.log("==========================================================================");
console.log(`PARSER TEST RESULT: ${passCount} PASSED, ${failCount} FAILED`);
console.log("==========================================================================");

if (failCount > 0) process.exit(1);
