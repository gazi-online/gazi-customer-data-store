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

    // Centralized Hard Rejection Helper for Non-Person Headers, Titles, and Labels
    const isNonPersonHeader = (line: string): boolean => {
      if (!line || line.trim().length === 0) return true;

      const u = line.toUpperCase().trim();

      // Explicit phrase rejection list (English, Hindi, Bengali)
      const HARD_REJECT_TERMS = [
        'GOVERNMENT OF', 'GOVT OF', 'GOVT. OF', 'REPUBLIC OF INDIA', 'STATE GOVERNMENT',
        'MINISTRY OF', 'DEPARTMENT OF', 'COMMISSION OF', 'AUTHORITY OF', 'INCOME TAX',
        'ELECTION COMMISSION', 'UNIQUE IDENTIFICATION', 'UIDAI', 'AADHAAR', 'ADHAAR',
        'ELECTOR PHOTO IDENTITY CARD', 'PERMANENT ACCOUNT NUMBER', 'PAN CARD',
        'DRIVING LICENCE', 'PASSPORT', 'WEST BENGAL', 'GOVERNMENT OF WEST BENGAL',
        'GOVT. OF WEST BENGAL', 'GOVERNMENT OF INDIA', 'GOVT OF INDIA', 'GOVT. OF INDIA',
        'FOOD & SUPPLIES', 'KHADYA SURAKSHA', 'PASSBOOK', 'BANK STATEMENT', 'STATE BANK',
        'SAVINGS BANK', 'HELP', 'WWW.', 'HTTP', 'HTTPS', 'AUTHORITY', 'ENROLMENT',
        'भारत सरकार', 'पश्चिमबंग सरकार', 'पश्चिम बंगाल सरकार', 'राज्य सरकार', 'आयकर विभाग',
        'निर्वाचन आयोग', 'चुनाव आयोग', 'राशन कार्ड', 'खाद्य विभाग', 'आधार',
        'পশ্চিমবঙ্গ সরকার', 'ভারত সরকার', 'ইউনিক আইডেন্টিফিকেশন', 'অথরিটি অব ইন্ডিয়া',
        'ইন্ডিয়া', 'নির্বাচন কমিশন', 'আয়কর বিভাগ', 'আধার'
      ];

      for (const term of HARD_REJECT_TERMS) {
        if (u.includes(term.toUpperCase())) {
          return true;
        }
      }

      // Regex patterns for government/department/organization headers
      const GOVT_PATTERNS = [
        /\bgovt\b|\bgovernment\b/i,
        /\bministry\b|\bdepartment\b|\bcommission\b|\bauthority\b/i,
        /\belection commission\b|\bincome tax\b/i,
        /\bपश्चिमबंग|\bपश्चिम बंगाल|\bপশ্চিমবঙ্গ/i,
        /\bभारत सरकार|\bসরকার\b|\bआयकर\b|\bनिर्वाचन\b/i
      ];

      for (const pat of GOVT_PATTERNS) {
        if (pat.test(line)) return true;
      }

      // Reject lines containing document labels or numbers > 3 digits
      if (
        /\b(DOB|Date of Birth|YOB|Year of Birth|जन्म तिथि|जन्म वर्ष|जन्म तारीख)\b/i.test(line) ||
        /\b(MALE|FEMALE|TRANSGENDER|पुरुष|महिला|মহিলা)\b/i.test(line) ||
        /\b(Address|पता|ঠিকানা|PIN|Pincode|Post Office)\b/i.test(line) ||
        /\b(S\/O|D\/O|W\/O|H\/O|C\/O|Son of|Daughter of|Wife of|Husband of|Care of)\b/i.test(line) ||
        /\d{4,}/.test(line)
      ) {
        return true;
      }

      return false;
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
      const dobMatch = cleanText.match(/\b(?:DOB|Date of Birth|DATE OF BIRTH|जन्म तिथि|जन्म तारीख)[:\s]*(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/i) ||
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

      // 4. Aadhaar Name & Native Language Name Extraction using Contextual Scoring
      if (documentType === 'aadhaar_front' || documentType === 'aadhaar_combined') {
        let dobLineIdx = -1;
        let genderLineIdx = -1;

        for (let i = 0; i < lines.length; i++) {
          const u = lines[i].toUpperCase();
          if (u.includes('DOB') || u.includes('DATE OF BIRTH') || u.includes('जन्म तिथि') || u.includes('जन्म तारीख')) dobLineIdx = i;
          if (u.includes('MALE') || u.includes('FEMALE') || u.includes('TRANSGENDER') || u.includes('पुरुष') || u.includes('महिला') || u.includes('মহিলা')) genderLineIdx = i;
        }

        const anchorIdx = dobLineIdx !== -1 ? dobLineIdx : (genderLineIdx !== -1 ? genderLineIdx : lines.length);

        let bestLatinCandidate: { text: string; score: number } | null = null;
        let bestNativeCandidate: { text: string; score: number } | null = null;

        for (let i = 0; i < anchorIdx; i++) {
          const rawLine = lines[i];
          // Strip leading/trailing punctuation noise e.g. :: Reshma Khatun :: or -- Reshma Khatun !!
          const line = rawLine.replace(/^[^\w\u0900-\u097F\u0980-\u09FF]+|[^\w\u0900-\u097F\u0980-\u09FF]+$/g, '').trim();

          // HARD REJECTION of Government/Organization/Header text
          if (isNonPersonHeader(line) || isNonPersonHeader(rawLine)) {
            continue;
          }

          // Calculate Anchor Proximity Score
          let proximityScore = 10;
          if (dobLineIdx !== -1) {
            const dist = dobLineIdx - i;
            if (dist === 1) proximityScore += 100;
            else if (dist === 2) proximityScore += 80;
            else if (dist === 3) proximityScore += 50;
          } else if (genderLineIdx !== -1) {
            const dist = genderLineIdx - i;
            if (dist === 1) proximityScore += 90;
            else if (dist === 2) proximityScore += 70;
          }

          // Native script candidate check
          if (hasNativeScript(line)) {
            const cleanedNative = cleanNativeName(line);
            if (cleanedNative.length >= 3) {
              const score = proximityScore + (cleanedNative.includes(' ') ? 20 : 10);
              if (!bestNativeCandidate || score > bestNativeCandidate.score) {
                bestNativeCandidate = { text: cleanedNative, score };
              }
            }
          }

          // Latin / English script candidate check
          if (/^[A-Za-z.\s\-]{2,50}$/.test(line)) {
            const cleanedLatin = cleanLatinName(line);
            if (cleanedLatin.length >= 3) {
              const score = proximityScore + (cleanedLatin.includes(' ') ? 30 : 10);
              if (!bestLatinCandidate || score > bestLatinCandidate.score) {
                bestLatinCandidate = { text: cleanedLatin, score };
              }
            }
          }
        }

        if (bestNativeCandidate && bestNativeCandidate.score > 0) {
          result.customer!.original_language_name = bestNativeCandidate.text;
        }

        if (bestLatinCandidate && bestLatinCandidate.score > 0) {
          result.customer!.full_name = bestLatinCandidate.text;
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

      // 3. PAN NAME EXTRACTION (Distinguish Name vs Father's Name)
      let nameNext = false;
      let fatherNext = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const u = line.toUpperCase();

        if (u.includes('NAME') && !u.includes('FATHER') && !u.includes('PERMANENT') && !u.includes('DEPARTMENT') && !u.includes('GOVT')) {
          const inlineVal = line.split(/[:\-]/)[1]?.trim();
          if (inlineVal && !isNonPersonHeader(inlineVal) && /^[A-Za-z\s.]{3,40}$/.test(inlineVal)) {
            result.customer!.full_name = cleanLatinName(inlineVal);
          } else {
            nameNext = true;
          }
          continue;
        }
        if (nameNext && !isNonPersonHeader(line) && /^[A-Za-z\s.]{3,40}$/.test(line)) {
          result.customer!.full_name = cleanLatinName(line);
          nameNext = false;
          continue;
        }

        if (u.includes("FATHER'S NAME") || u.includes("FATHER NAME")) {
          const inlineVal = line.split(/[:\-]/)[1]?.trim();
          if (inlineVal && !isNonPersonHeader(inlineVal) && /^[A-Za-z\s.]{3,40}$/.test(inlineVal)) {
            result.customer!.father_name = cleanLatinName(inlineVal);
          } else {
            fatherNext = true;
          }
          continue;
        }
        if (fatherNext && !isNonPersonHeader(line) && /^[A-Za-z\s.]{3,40}$/.test(line)) {
          result.customer!.father_name = cleanLatinName(line);
          fatherNext = false;
          continue;
        }
      }

      // Fallback: If full_name not extracted via label, search non-header lines after INCOME TAX DEPARTMENT / GOVT. OF INDIA
      if (!result.customer!.full_name) {
        const nameCandidates = lines.filter(l => {
          if (isNonPersonHeader(l)) return false;
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

      // 2. VOTER NAME EXTRACTION
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const u = line.toUpperCase();

        if ((u.includes("ELECTOR'S NAME") || u.includes("NAME") || line.includes("नाम")) && !u.includes("FATHER") && !u.includes("HUSBAND") && !u.includes("ELECTION") && !u.includes("COMMISSION")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && !isNonPersonHeader(val) && /^[A-Za-z\s.]{3,40}$/.test(val)) {
            result.customer!.full_name = cleanLatinName(val);
          }
        }
        if (u.includes("FATHER'S NAME") || u.includes("FATHER NAME") || line.includes("पिता का नाम")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && !isNonPersonHeader(val) && /^[A-Za-z\s.]{3,40}$/.test(val)) {
            result.customer!.father_name = cleanLatinName(val);
          }
        }
        if (u.includes("HUSBAND'S NAME") || u.includes("HUSBAND NAME") || line.includes("पति का नाम")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && !isNonPersonHeader(val) && /^[A-Za-z\s.]{3,40}$/.test(val)) {
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

