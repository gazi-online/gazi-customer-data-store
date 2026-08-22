import { ParsedDocumentFields } from './ocr-types';

export class DocumentTextParser {
  static parse(text: string, documentType: string, filename?: string): ParsedDocumentFields {
    const result: ParsedDocumentFields = {
      customer: {},
      address: {},
      documents: {},
      detected_documents: [{
        detected_type: documentType,
        confidence: 0.9,
        source_filename: filename
      }],
      raw_text: text,
      diagnostic_data: {},
      confidence_summary: {
        overall: 0.85,
        low_confidence_fields: []
      }
    };

    if (!text || text.trim().length === 0) return result;

    // 10. MULTILINE NORMALIZATION: Pre-normalize CRLF -> LF, trim lines, collapse internal tabs/spaces
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Common Pincode Extractor
    const pincodeMatch = cleanText.match(/\b[1-9][0-9]{5}\b/);
    if (pincodeMatch) {
      result.address!.pincode = pincodeMatch[0];
    }

    // Indian States List for Address Parsing
    const INDIAN_STATES = [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
      'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
      'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
      'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
      'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh',
      'Puducherry', 'Chandigarh', 'A & N Islands', 'D&NH and D&D'
    ];

    // Helper: Normalize Date Strings
    const normalizeDateStr = (dateStr: string): string | undefined => {
      if (!dateStr) return undefined;
      const clean = dateStr.replace(/[^\d\/\-.]/g, '');
      const parts = clean.split(/[\/\-.]/);
      if (parts.length === 3) {
        if (parts[0].length === 2 && parts[2].length === 4) {
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        if (parts[0].length === 4 && parts[2].length === 2) {
          return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
      }
      return undefined;
    };

    // Helper: Native Script Detectors (Devanagari & Bengali)
    const hasDevanagari = (str: string) => /[\u0900-\u097F]/.test(str);
    const hasBengali = (str: string) => /[\u0980-\u09FF]/.test(str);
    const hasNativeScript = (str: string) => hasDevanagari(str) || hasBengali(str);

    // Clean noise from native script name lines
    const cleanNativeName = (line: string): string => {
      return line.replace(/[^\u0900-\u097F\u0980-\u09FF\s.]/g, '').trim();
    };

    // Clean noise from Latin name lines
    const cleanLatinName = (line: string): string => {
      return line.replace(/[^A-Za-z\s.]/g, '').trim();
    };

    if (documentType.startsWith('aadhaar')) {
      // 1. Aadhaar Number
      const aadhaarMatch = cleanText.match(/\b[1-9][0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/);
      if (aadhaarMatch) {
        const cleanNo = aadhaarMatch[0].replace(/\s+/g, '');
        if (cleanNo.length === 12) {
          result.documents!.aadhaar = { number: cleanNo };
        }
      }

      // 2. Gender
      if (/\b(MALE|पुरुष|পুরুষ)\b/i.test(cleanText)) {
        result.customer!.gender = 'male';
      } else if (/\b(FEMALE|महिला|মহিলা)\b/i.test(cleanText)) {
        result.customer!.gender = 'female';
      } else if (/\b(TRANSGENDER)\b/i.test(cleanText)) {
        result.customer!.gender = 'other';
      }

      // 3. DOB / YOB
      const dobMatch = cleanText.match(/\b(?:DOB|Date of Birth|DATE OF BIRTH|जन्म तिथि|জন্ম তারিখ)[:\s]*(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/i) ||
                       cleanText.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/);
      if (dobMatch) {
        const norm = normalizeDateStr(dobMatch[1]);
        if (norm) result.customer!.dob = norm;
      } else {
        const yobMatch = cleanText.match(/\b(?:YOB|Year of Birth|जन्म वर्ष)[:\s]*(\d{4})\b/i);
        if (yobMatch) {
          result.customer!.dob = `${yobMatch[1]}-01-01`;
        }
      }

      // 4. Aadhaar Name & Native Language Name Extraction (Front / Combined)
      if (documentType === 'aadhaar_front' || documentType === 'aadhaar_combined') {
        let dobLineIdx = -1;
        let genderLineIdx = -1;

        for (let i = 0; i < lines.length; i++) {
          const u = lines[i].toUpperCase();
          if (u.includes('DOB') || u.includes('DATE OF BIRTH') || u.includes('जन्म तिथि')) dobLineIdx = i;
          if (u.includes('MALE') || u.includes('FEMALE') || u.includes('TRANSGENDER') || u.includes('पुरुष') || u.includes('महिला')) genderLineIdx = i;
        }

        const anchorIdx = dobLineIdx !== -1 ? dobLineIdx : (genderLineIdx !== -1 ? genderLineIdx : lines.length);

        // Search lines above DOB / Gender anchor for name candidates
        for (let i = 0; i < anchorIdx; i++) {
          const line = lines[i];
          const u = line.toUpperCase();

          // Filter out header noise, UIDAI info, dates, and numbers
          if (
            u.includes('GOVERNMENT OF INDIA') || u.includes('BHARAT SARKAR') || u.includes('भारत सरकार') || u.includes('ইউনিক') ||
            u.includes('আইডেন্টিফিকেশন') || u.includes('অথরিটি') || u.includes('ইন্ডিয়া') || u.includes('ভারত') ||
            u.includes('UNIQUE IDENTIFICATION') || u.includes('UIDAI') || u.includes('AADHAAR') || u.includes('ADHAAR') ||
            u.includes('DOB') || u.includes('MALE') || u.includes('FEMALE') || u.includes('ENROLMENT') || u.includes('HELP') ||
            u.includes('WWW.') || u.includes('AUTHORITY') || /\d{4}/.test(line) || u.includes('S/O') || u.includes('D/O') || u.includes('W/O')
          ) {
            continue;
          }

          // Native script candidate check
          if (hasNativeScript(line) && !result.customer!.original_language_name) {
            const cleanedNative = cleanNativeName(line);
            if (cleanedNative.length >= 3) {
              result.customer!.original_language_name = cleanedNative;
            }
          }

          // Latin / English script candidate check
          if (/^[A-Za-z.\s\-]{2,50}$/.test(line) && !result.customer!.full_name) {
            const cleanedLatin = cleanLatinName(line);
            if (cleanedLatin.length >= 3 && cleanedLatin.includes(' ')) {
              result.customer!.full_name = cleanedLatin;
            } else if (cleanedLatin.length >= 3 && !result.customer!.full_name) {
              result.customer!.full_name = cleanedLatin;
            }
          }
        }

        // Fallback for full_name if anchor search didn't find multi-word name
        if (!result.customer!.full_name) {
          for (let i = 0; i < anchorIdx; i++) {
            const line = lines[i];
            const u = line.toUpperCase();
            if (
              u.includes('GOVERNMENT') || u.includes('INDIA') || u.includes('SARKAR') || u.includes('UIDAI') ||
              u.includes('AADHAAR') || /\d/.test(line) || hasNativeScript(line)
            ) {
              continue;
            }
            const clean = cleanLatinName(line);
            if (clean.length >= 3) {
              result.customer!.full_name = clean;
              break;
            }
          }
        }

        // If only native script name was found and no Latin script name exists:
        if (!result.customer!.full_name && result.customer!.original_language_name) {
          // Do NOT fabricate English translation. Leave original_language_name as primary.
        }
      }

      // 5. Relationship Rules (S/O, D/O, W/O, H/O, C/O)
      const relMatch = cleanText.match(/\b(S\/O|D\/O|W\/O|H\/O|C\/O|Son of|Daughter of|Wife of|Husband of|Care of)[:\s]+([^\n,]+)/i);
      if (relMatch) {
        const relType = relMatch[1].toUpperCase();
        let relName = relMatch[2].split(/,|\n|Address|पता|ঠিকানা/i)[0].trim();
        relName = cleanLatinName(relName);

        if (relName.length > 2) {
          if (relType.includes('S/O') || relType.includes('D/O') || relType.includes('SON') || relType.includes('DAUGHTER')) {
            result.customer!.father_name = relName;
          } else if (relType.includes('W/O') || relType.includes('H/O') || relType.includes('WIFE') || relType.includes('HUSBAND')) {
            result.customer!.spouse_name = relName;
          } else if (relType.includes('C/O') || relType.includes('CARE')) {
            result.diagnostic_data!.care_of = relName;
          }
        }
      }

      // 8. ADDRESS EXTRACTION (Aadhaar Back / Combined Multiline Address)
      if (documentType === 'aadhaar_back' || documentType === 'aadhaar_combined') {
        const addrIndex = cleanText.search(/Address:|Address|पता:|पता|ঠিকানা:|ঠিকানা/i);
        if (addrIndex !== -1) {
          const addrSub = cleanText.substring(addrIndex)
            .replace(/^(Address|पता|ঠিকানা)[:\s]*/i, '')
            .split(/Unique Identification|UIDAI|1800|www\.|Help|Page \d/i)[0]
            .trim();

          const addrLines = addrSub.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          const fullAddressStr = addrLines.join(', ');
          
          if (fullAddressStr.length > 5) {
            result.address!.full_address = fullAddressStr;

            // Extract State from address lines
            for (const stateName of INDIAN_STATES) {
              if (new RegExp(`\\b${stateName}\\b`, 'i').test(fullAddressStr)) {
                result.address!.state = stateName;
                break;
              }
            }

            // Extract District from address lines (Dist: X or District: X or জেলা: X)
            const distMatch = fullAddressStr.match(/\b(?:Dist|District|জেলা|ज़िला)[:\s]+([A-Za-z\s]+)(?:,|$)/i);
            if (distMatch) {
              result.address!.district = distMatch[1].trim();
            }

            // Extract Post Office (PO: X or P.O. X or Post Office: X)
            const poMatch = fullAddressStr.match(/\b(?:P\.?O\.?|Post Office|ডাকঘর|डाकघर)[:\s]+([A-Za-z\s]+)(?:,|$)/i);
            if (poMatch) {
              result.address!.post_office = poMatch[1].trim();
            }
          }
        }
      }
    } else if (documentType === 'pan_card') {
      // 1. PAN Number
      const panMatch = cleanText.match(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/);
      if (panMatch) {
        result.documents!.pan = { number: panMatch[0] };
      }

      // 2. DOB
      const dobMatch = cleanText.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/);
      if (dobMatch) {
        const norm = normalizeDateStr(dobMatch[1]);
        if (norm) result.customer!.dob = norm;
      }

      // 6. PAN NAME EXTRACTION (Distinguish Name vs Father's Name)
      let nameNext = false;
      let fatherNext = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const u = line.toUpperCase();

        if (u.includes('NAME') && !u.includes('FATHER') && !u.includes('PERMANENT') && !u.includes('DEPARTMENT') && !u.includes('GOVT')) {
          const inlineVal = line.split(/[:\-]/)[1]?.trim();
          if (inlineVal && /^[A-Za-z\s.]{3,40}$/.test(inlineVal)) {
            result.customer!.full_name = cleanLatinName(inlineVal);
          } else {
            nameNext = true;
          }
          continue;
        }
        if (nameNext && /^[A-Za-z\s.]{3,40}$/.test(line) && !u.includes('INCOME') && !u.includes('INDIA')) {
          result.customer!.full_name = cleanLatinName(line);
          nameNext = false;
          continue;
        }

        if (u.includes("FATHER'S NAME") || u.includes("FATHER NAME")) {
          const inlineVal = line.split(/[:\-]/)[1]?.trim();
          if (inlineVal && /^[A-Za-z\s.]{3,40}$/.test(inlineVal)) {
            result.customer!.father_name = cleanLatinName(inlineVal);
          } else {
            fatherNext = true;
          }
          continue;
        }
        if (fatherNext && /^[A-Za-z\s.]{3,40}$/.test(line)) {
          result.customer!.father_name = cleanLatinName(line);
          fatherNext = false;
          continue;
        }
      }

      // Fallback: If full_name not extracted via label, search non-header lines after INCOME TAX DEPARTMENT / GOVT. OF INDIA
      if (!result.customer!.full_name) {
        const panHeaderNoise = ['INCOME', 'TAX', 'DEPARTMENT', 'GOVT', 'GOVERNMENT', 'INDIA', 'PERMANENT', 'ACCOUNT', 'NUMBER'];
        const nameCandidates = lines.filter(l => {
          const u = l.toUpperCase();
          if (panHeaderNoise.some(n => u.includes(n))) return false;
          if (/\d/.test(l)) return false;
          return /^[A-Za-z\s.]{3,40}$/.test(l);
        });

        if (nameCandidates.length > 0) {
          result.customer!.full_name = cleanLatinName(nameCandidates[0]);
          if (nameCandidates.length > 1 && !result.customer!.father_name) {
            result.customer!.father_name = cleanLatinName(nameCandidates[1]);
          }
        }
      }
    } else if (documentType === 'voter_id') {
      // 1. EPIC Number
      const epicMatch = cleanText.match(/\b[A-Z]{3}[0-9]{7}\b/) || cleanText.match(/\b[A-Z]{2}\/\d{2,3}\/\d{3,4}\/\d{5,6}\b/);
      if (epicMatch) {
        result.documents!.voter_id = { number: epicMatch[0] };
      }

      // 7. VOTER NAME EXTRACTION
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const u = line.toUpperCase();

        if ((u.includes("ELECTOR'S NAME") || u.includes("NAME") || line.includes("नाम")) && !u.includes("FATHER") && !u.includes("HUSBAND") && !u.includes("ELECTION")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && /^[A-Za-z\s.]{3,40}$/.test(val)) {
            result.customer!.full_name = cleanLatinName(val);
          }
        }
        if (u.includes("FATHER'S NAME") || u.includes("FATHER NAME") || line.includes("पिता का नाम")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && /^[A-Za-z\s.]{3,40}$/.test(val)) {
            result.customer!.father_name = cleanLatinName(val);
          }
        }
        if (u.includes("HUSBAND'S NAME") || u.includes("HUSBAND NAME") || line.includes("पति का नाम")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && /^[A-Za-z\s.]{3,40}$/.test(val)) {
            result.customer!.spouse_name = cleanLatinName(val);
          }
        }
      }
    } else if (documentType === 'bank_passbook' || documentType === 'bank_statement') {
      const acctMatch = cleanText.match(/\b(A\/C|ACCOUNT NO|ACCOUNT NUMBER)[:\s]*([0-9]{9,18})\b/i);
      const ifscMatch = cleanText.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/);
      if (acctMatch) result.diagnostic_data!.account_number = acctMatch[2];
      if (ifscMatch) result.diagnostic_data!.ifsc_code = ifscMatch[0];
    } else if (documentType === 'ration_card') {
      const rationNoMatch = cleanText.match(/\b(RATION CARD NO|CARD NO|RC NO)[:\s]*([A-Z0-9]{8,16})\b/i);
      if (rationNoMatch) result.diagnostic_data!.ration_card_number = rationNoMatch[2];
    }

    return result;
  }
}

