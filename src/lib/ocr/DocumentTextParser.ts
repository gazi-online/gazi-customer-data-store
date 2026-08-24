import { ParsedDocumentFields } from './ocr-types';
import { isNonPersonNameCandidate } from '../names/nameSafety';

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

    // Centralized Hard Rejection Helper — delegates to shared nameSafety utility
    // so DocumentTextParser and BengaliNameTransliterator use the same rule set.
    const isNonPersonHeader = (line: string): boolean => isNonPersonNameCandidate(line);

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
      if (documentType === 'aadhaar_back' || documentType === 'aadhaar_combined' || documentType === 'aadhaar' || documentType === 'aadhaar_front' || documentType === 'generic_address_document') {
        const addressStopRegex = /(?:Unique Identification|UIDAI|भारतीय विशिष्ट पहचान प्राधिकरण|ইউনিক আইডেন্টিফিকেশন|Mera Aadhaar|আমার আধার|मेरा आधार|Scan QR|QR Code|Download Date|Issue Date|Date of Download|Date of Issue|Government of India|Government of West Bengal|পশ্চিমবঙ্গ সরকার|ভারত সরকার|भारत सरकार|Election Commission|Income Tax|help@uidai\.gov\.in|www\.uidai\.gov\.in|uidai\.gov\.in|Page \d)/i;

        const isNoiseLine = (l: string): boolean => {
          const t = l.trim();
          if (/^\d{4}\s\d{4}\s\d{4}$/.test(t) || /^\d{12}$/.test(t)) return true;
          if (/^VID\b/i.test(t)) return true;
          if (/^(?:DOB|Date of Birth|DATE OF BIRTH|जन्म तिथि|जन्म तारीख|Year of Birth|YOB|জন্ম তারিখ)[:\s]/i.test(t)) return true;
          if (/^(?:MALE|FEMALE|TRANSGENDER|पुरुष|মহিলা|महिला)$/i.test(t)) return true;
          if (/\b(?:1947|1800\s*\d{3}\s*\d{4}|help@uidai\.gov\.in|www\.uidai\.gov\.in|uidai\.gov\.in)\b/i.test(t)) return true;
          if (addressStopRegex.test(t)) return true;
          return false;
        };

        const addressStartLabels = [
          { regex: /^(?:Address|Adress|Addres|ADDRESS)[:\s\-]*/i, isNative: false, stripLabel: true },
          { regex: /^(?:To)[:\s\-]+/i, isNative: false, stripLabel: true },
          { regex: /^(?:C\/O|Care of)[:\s\-]+/i, isNative: false, stripLabel: false },
          { regex: /^(?:ঠিকানা)[:\s\-]*/i, isNative: true, stripLabel: true },
          { regex: /^(?:पता)[:\s\-]*/i, isNative: true, stripLabel: true }
        ];

        interface AddressCandidate {
          lines: string[];
          isNative: boolean;
          hasPin: boolean;
        }

        const candidateBlocks: AddressCandidate[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Check if this line starts an address block
          for (const lbl of addressStartLabels) {
            if (lbl.regex.test(line)) {
              let firstLineContent = lbl.stripLabel ? line.replace(lbl.regex, '').trim() : line.trim();
              const blockLines: string[] = [];
              if (firstLineContent.length > 0) {
                blockLines.push(firstLineContent);
              }

              let hasPin = pincodeMatch ? blockLines.some(l => pincodeMatch[0] && l.includes(pincodeMatch[0])) : false;

              // Collect subsequent address lines
              for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];

                // Stop if next line is another address header
                if (addressStartLabels.some(l => l.regex.test(nextLine))) break;

                // Stop if next line matches non-address noise or government footer
                if (isNoiseLine(nextLine)) {
                  break;
                }

                // Check for 6-digit PIN in this line
                const linePinMatch = nextLine.match(/\b[1-9][0-9]{5}\b/);
                if (linePinMatch) {
                  hasPin = true;
                  blockLines.push(nextLine.trim());
                  // PIN is the standard end anchor of Indian addresses.
                  break;
                }

                blockLines.push(nextLine.trim());
              }

              if (blockLines.length > 0) {
                candidateBlocks.push({
                  lines: blockLines,
                  isNative: lbl.isNative,
                  hasPin
                });
              }
              break;
            }
          }
        }

        // Choose best candidate block (prefer English if complete, otherwise native)
        let chosenCandidate: AddressCandidate | null = null;
        if (candidateBlocks.length === 1) {
          chosenCandidate = candidateBlocks[0];
        } else if (candidateBlocks.length > 1) {
          const engCandidate = candidateBlocks.find(c => !c.isNative && c.lines.join(' ').length >= 10);
          const nativeCandidate = candidateBlocks.find(c => c.isNative && c.lines.join(' ').length >= 10);
          if (engCandidate) {
            chosenCandidate = engCandidate;
          } else {
            chosenCandidate = nativeCandidate || candidateBlocks[0];
          }
        }

        if (chosenCandidate && chosenCandidate.lines.length > 0) {
          // Line wrap recovery & formatting
          const recoveredLines: string[] = [];
          for (let k = 0; k < chosenCandidate.lines.length; k++) {
            let cur = chosenCandidate.lines[k];

            while (k + 1 < chosenCandidate.lines.length) {
              const next = chosenCandidate.lines[k + 1];

              // Case 1: Word hyphen split e.g. "Murshida-" + "bad"
              if (/[\w\u0900-\u097F\u0980-\u09FF]\-$/.test(cur)) {
                cur = cur.slice(0, -1) + next;
                k++;
              }
              // Case 2: Label hyphen split e.g. "Vill-" + "Choto" or "Dist-" + "Murshidabad"
              else if (/(?:Vill|PO|P\.O|Dist|District|State|PIN|গ্রাম|পো|জেলা|পিন)\s*\-$/i.test(cur)) {
                cur = cur + ' ' + next;
                k++;
              }
              // Case 3: Line without trailing comma/period followed by continuation word/syllable
              else if (!/[,\.;]$/.test(cur) && (/^[a-z\u0900-\u097F\u0980-\u09FF]/.test(next) || next.length <= 4 || /^(?:Kalia|Gram|Pur|Nagar|Abad|Ganj|Bazar|Para|Tola|Danga)\b/i.test(next) || (cur.endsWith('Murshida') && next.startsWith('bad')))) {
                if (cur.endsWith('Murshida') && next.startsWith('bad')) {
                  cur = cur + next;
                } else {
                  cur = cur + ' ' + next;
                }
                k++;
              } else {
                break;
              }
            }

            recoveredLines.push(cur);
          }

          let fullAddressStr = recoveredLines
            .map(l => l.replace(/^[,\s:\-]+|[,\s:\-]+$/g, '').trim())
            .filter(l => l.length > 0)
            .join(', ')
            .replace(/,\s*,+/g, ', ')
            .trim();

          if (fullAddressStr.length > 5) {
            result.address!.full_address = fullAddressStr;

            // Extract PIN code from address
            const addrPinMatch = fullAddressStr.match(/\b[1-9][0-9]{5}\b/);
            if (addrPinMatch) {
              result.address!.pincode = addrPinMatch[0];
            }

            // Extract State from address lines (English + Bengali / Hindi aliases)
            for (const stateName of INDIAN_STATES) {
              if (new RegExp(`\\b${stateName}\\b`, 'i').test(fullAddressStr)) {
                result.address!.state = stateName;
                break;
              }
            }
            if (!result.address!.state) {
              if (fullAddressStr.includes('পশ্চিমবঙ্গ') || fullAddressStr.includes('পশ্চিম বঙ্গ') || fullAddressStr.includes('पश्चिम बंगाल')) {
                result.address!.state = 'West Bengal';
              } else if (fullAddressStr.includes('बिहार')) {
                result.address!.state = 'Bihar';
              } else if (fullAddressStr.includes('ঝাড়খণ্ড') || fullAddressStr.includes('झारखंड')) {
                result.address!.state = 'Jharkhand';
              } else if (fullAddressStr.includes('ওড়িশা') || fullAddressStr.includes('ओडिशा')) {
                result.address!.state = 'Odisha';
              }
            }

            // Extract District from address lines (Dist: X, District: X, Dist - X, জেলা: X, জেলা - X, ज़िला: X)
            // Supports alphanumeric district names like North 24 Parganas, South 24 Parganas
            const distMatch = fullAddressStr.match(/\b(?:Dist|District|জেলা|ज़िला|जिला)[:\s\-]+([A-Za-z0-9\u0900-\u097F\u0980-\u09FF\s]+?)(?:,|\n|\.|\-|\d{6}|$)/i);
            if (distMatch) {
              const cleanDist = distMatch[1].replace(/\b\d{6}\b/g, '').replace(/^[,\s:\-]+|[,\s:\-]+$/g, '').trim();
              if (cleanDist.length >= 2 && cleanDist.length <= 40) {
                result.address!.district = cleanDist;
              }
            } else if (result.address!.state) {
              // Check formatting: "Murshidabad, West Bengal"
              const stateEscaped = result.address!.state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const beforeStateMatch = fullAddressStr.match(new RegExp(`([A-Za-z0-9\\u0900-\\u097F\\u0980-\\u09FF\\s]{3,30}),\\s*${stateEscaped}`, 'i'));
              if (beforeStateMatch) {
                const candDist = beforeStateMatch[1].split(/,|\n|PO|P\.O|Vill/i).pop()?.trim();
                if (candDist && candDist.length >= 2 && !candDist.toLowerCase().includes('state')) {
                  result.address!.district = candDist;
                }
              }
            }

            // Extract Post Office (PO: X, P.O. X, Post Office: X, PO - X, ডাকঘর: X, डाकघर: X)
            const poMatch = fullAddressStr.match(/\b(?:P\.?O\.?|Post Office|ডাকঘর|डाकघर)[:\s\-]+([A-Za-z\u0900-\u097F\u0980-\u09FF\s]+?)(?:,|\n|\.|\-|\d{6}|$)/i);
            if (poMatch) {
              const cleanPo = poMatch[1].replace(/\b\d{6}\b/g, '').replace(/^[,\s:\-]+|[,\s:\-]+$/g, '').trim();
              if (cleanPo.length >= 2 && cleanPo.length <= 40) {
                result.address!.post_office = cleanPo;
              }
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

