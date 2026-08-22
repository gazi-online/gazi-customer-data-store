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

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Common Pincode Extractor
    const pincodeMatch = text.match(/\b[1-9][0-9]{5}\b/);
    if (pincodeMatch) {
      result.address!.pincode = pincodeMatch[0];
    }

    // Common Date Extractor Helper (DD/MM/YYYY or YYYY-MM-DD)
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

    if (documentType.startsWith('aadhaar')) {
      // 1. Aadhaar Number
      const aadhaarMatch = text.match(/\b[1-9][0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/);
      if (aadhaarMatch) {
        const cleanNo = aadhaarMatch[0].replace(/\s+/g, '');
        if (cleanNo.length === 12) {
          result.documents!.aadhaar = { number: cleanNo };
        }
      }

      // 2. Gender
      if (/\b(MALE|पुरुष)\b/i.test(text)) {
        result.customer!.gender = 'male';
      } else if (/\b(FEMALE|महिला)\b/i.test(text)) {
        result.customer!.gender = 'female';
      } else if (/\b(TRANSGENDER)\b/i.test(text)) {
        result.customer!.gender = 'other';
      }

      // 3. DOB / YOB
      const dobMatch = text.match(/\b(?:DOB|Date of Birth|DATE OF BIRTH|जन्म तिथि)[:\s]*(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/i) ||
                       text.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/);
      if (dobMatch) {
        const norm = normalizeDateStr(dobMatch[1]);
        if (norm) result.customer!.dob = norm;
      } else {
        const yobMatch = text.match(/\b(?:YOB|Year of Birth|जन्म वर्ष)[:\s]*(\d{4})\b/i);
        if (yobMatch) {
          result.customer!.dob = `${yobMatch[1]}-01-01`;
        }
      }

      // 4. Aadhaar Name Extraction (Front)
      if (documentType === 'aadhaar_front' || documentType === 'aadhaar_combined') {
        for (const line of lines) {
          const u = line.toUpperCase();
          if (
            u.includes('GOVERNMENT OF INDIA') || u.includes('BHARAT SARKAR') || u.includes('भारत सरकार') ||
            u.includes('UNIQUE IDENTIFICATION') || u.includes('UIDAI') || u.includes('AADHAAR') ||
            u.includes('DOB') || u.includes('MALE') || u.includes('FEMALE') || u.includes('ENROLMENT') ||
            u.includes('HELP') || u.includes('WWW.') || /\d{4}/.test(line)
          ) {
            continue;
          }
          // If line looks like a person's name (2+ alphabetic words)
          if (/^[A-Za-z.\s]{3,40}$/.test(line) && line.split(' ').length >= 1) {
            result.customer!.full_name = line.trim();
            break;
          }
        }
      }

      // 5. Relationship Rules (S/O, D/O, W/O, H/O, C/O)
      const relMatch = text.match(/\b(S\/O|D\/O|W\/O|H\/O|C\/O|Son of|Daughter of|Wife of|Husband of|Care of)[:\s]+([A-Za-z\s.]+)/i);
      if (relMatch) {
        const relType = relMatch[1].toUpperCase();
        let relName = relMatch[2].split(/,|\n|Address|पता/i)[0].trim();
        relName = relName.replace(/[^A-Za-z\s.]/g, '').trim();

        if (relName.length > 2) {
          if (relType.includes('S/O') || relType.includes('D/O') || relType.includes('SON') || relType.includes('DAUGHTER')) {
            result.customer!.father_name = relName;
          } else if (relType.includes('W/O') || relType.includes('H/O') || relType.includes('WIFE') || relType.includes('HUSBAND')) {
            result.customer!.spouse_name = relName;
          } else if (relType.includes('C/O') || relType.includes('CARE')) {
            // C/O is ambiguous: do NOT assign to father or spouse!
            result.diagnostic_data!.care_of = relName;
          }
        }
      }

      // 6. Address Extraction (Back)
      if (documentType === 'aadhaar_back' || documentType === 'aadhaar_combined') {
        const addrIndex = text.search(/Address:|Address|पता:/i);
        if (addrIndex !== -1) {
          const addrSub = text.substring(addrIndex).replace(/^Address[:\s]*/i, '').replace(/^पता[:\s]*/i, '');
          const addrClean = addrSub.split(/Unique Identification|UIDAI|1800|www\./i)[0].trim();
          result.address!.full_address = addrClean;
        }
      }
    } else if (documentType === 'pan_card') {
      // 1. PAN Number
      const panMatch = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/);
      if (panMatch) {
        result.documents!.pan = { number: panMatch[0] };
      }

      // 2. DOB
      const dobMatch = text.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/);
      if (dobMatch) {
        const norm = normalizeDateStr(dobMatch[1]);
        if (norm) result.customer!.dob = norm;
      }

      // 3. Name & Father Name
      let nameNext = false;
      let fatherNext = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const u = line.toUpperCase();

        if (u.includes('NAME') && !u.includes('FATHER') && !u.includes('PERMANENT') && !u.includes('DEPARTMENT')) {
          const inlineVal = line.split(/[:\-]/)[1]?.trim();
          if (inlineVal && /^[A-Za-z\s.]{3,40}$/.test(inlineVal)) {
            result.customer!.full_name = inlineVal;
          } else {
            nameNext = true;
          }
          continue;
        }
        if (nameNext && /^[A-Za-z\s.]{3,40}$/.test(line) && !u.includes('INCOME') && !u.includes('INDIA')) {
          result.customer!.full_name = line.trim();
          nameNext = false;
          continue;
        }

        if (u.includes("FATHER'S NAME") || u.includes("FATHER NAME")) {
          const inlineVal = line.split(/[:\-]/)[1]?.trim();
          if (inlineVal && /^[A-Za-z\s.]{3,40}$/.test(inlineVal)) {
            result.customer!.father_name = inlineVal;
          } else {
            fatherNext = true;
          }
          continue;
        }
        if (fatherNext && /^[A-Za-z\s.]{3,40}$/.test(line)) {
          result.customer!.father_name = line.trim();
          fatherNext = false;
          continue;
        }
      }

      // Fallback: If full_name not extracted via label, search line after INCOME TAX DEPARTMENT
      if (!result.customer!.full_name) {
        const idx = lines.findIndex(l => l.toUpperCase().includes('INCOME TAX DEPARTMENT') || l.toUpperCase().includes('GOVT. OF INDIA'));
        if (idx !== -1 && lines[idx + 1] && /^[A-Za-z\s.]{3,40}$/.test(lines[idx + 1])) {
          result.customer!.full_name = lines[idx + 1].trim();
        }
      }
    } else if (documentType === 'voter_id') {
      // 1. EPIC Number
      const epicMatch = text.match(/\b[A-Z]{3}[0-9]{7}\b/) || text.match(/\b[A-Z]{2}\/\d{2,3}\/\d{3,4}\/\d{5,6}\b/);
      if (epicMatch) {
        result.documents!.voter_id = { number: epicMatch[0] };
      }

      // 2. Name & Relationships
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const u = line.toUpperCase();

        if ((u.includes("ELECTOR'S NAME") || u.includes("NAME") || line.includes("नाम")) && !u.includes("FATHER") && !u.includes("HUSBAND") && !u.includes("ELECTION")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && /^[A-Za-z\s.]{3,40}$/.test(val)) {
            result.customer!.full_name = val;
          }
        }
        if (u.includes("FATHER'S NAME") || u.includes("FATHER NAME") || line.includes("पिता का नाम")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && /^[A-Za-z\s.]{3,40}$/.test(val)) {
            result.customer!.father_name = val;
          }
        }
        if (u.includes("HUSBAND'S NAME") || u.includes("HUSBAND NAME") || line.includes("पति का नाम")) {
          const val = line.split(/[:\-]/)[1]?.trim() || lines[i + 1]?.trim();
          if (val && /^[A-Za-z\s.]{3,40}$/.test(val)) {
            result.customer!.spouse_name = val;
          }
        }
      }
    } else if (documentType === 'bank_passbook' || documentType === 'bank_statement') {
      const acctMatch = text.match(/\b(A\/C|ACCOUNT NO|ACCOUNT NUMBER)[:\s]*([0-9]{9,18})\b/i);
      const ifscMatch = text.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/);
      if (acctMatch) result.diagnostic_data!.account_number = acctMatch[2];
      if (ifscMatch) result.diagnostic_data!.ifsc_code = ifscMatch[0];
    } else if (documentType === 'ration_card') {
      const rationNoMatch = text.match(/\b(RATION CARD NO|CARD NO|RC NO)[:\s]*([A-Z0-9]{8,16})\b/i);
      if (rationNoMatch) result.diagnostic_data!.ration_card_number = rationNoMatch[2];
    }

    return result;
  }
}
