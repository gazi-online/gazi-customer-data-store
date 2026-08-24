import { ClassificationResult } from './ocr-types';

export class DocumentClassifier {
  static classify(text: string): ClassificationResult {
    if (!text || text.trim().length === 0) {
      return { documentType: 'unknown', confidence: 0, signals: ['No text detected'] };
    }

    const cleanText = text.replace(/\s+/g, ' ');
    const upperText = cleanText.toUpperCase();
    const signals: string[] = [];

    // Regex Patterns
    const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/;
    const aadhaarRegex = /\b[1-9][0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/;
    const voterEpicRegex = /\b[A-Z]{3}[0-9]{7}\b/;
    const voterFormat2 = /\b[A-Z]{2}\/\d{2,3}\/\d{3,4}\/\d{5,6}\b/;
    const pincodeRegex = /\b[1-9][0-9]{5}\b/;
    const dobRegex = /\b(DOB|DATE OF BIRTH|YEAR OF BIRTH|YOB|BIRTH)\b/i;

    // 1. Bank Passbook / Bank Statement (Check BEFORE raw numbers)
    if (upperText.includes('STATEMENT OF ACCOUNT') || upperText.includes('ACCOUNT STATEMENT') || upperText.includes('CLOSING BALANCE')) {
      return { documentType: 'bank_statement', confidence: 0.8, signals: ['Found: Bank Statement headers'] };
    }
    if (upperText.includes('PASSBOOK') || (upperText.includes('ACCOUNT NUMBER') && upperText.includes('IFSC')) || (upperText.includes('SAVINGS') && upperText.includes('BANK'))) {
      return { documentType: 'bank_passbook', confidence: 0.75, signals: ['Found: Bank Passbook indicators'] };
    }

    // 2. PAN Card Check
    let panScore = 0;
    if (upperText.includes('INCOME TAX DEPARTMENT')) { panScore += 0.5; signals.push('Found: INCOME TAX DEPARTMENT'); }
    if (upperText.includes('PERMANENT ACCOUNT NUMBER')) { panScore += 0.4; signals.push('Found: PERMANENT ACCOUNT NUMBER'); }
    if (upperText.includes('GOVT. OF INDIA') || upperText.includes('GOVT OF INDIA')) { panScore += 0.2; }
    const panMatch = upperText.match(panRegex);
    if (panMatch) { panScore += 0.6; signals.push(`Found PAN Pattern: ${panMatch[0]}`); }

    if (panScore >= 0.6) {
      return { documentType: 'pan_card', confidence: Math.min(1.0, panScore), signals };
    }

    // 3. Voter ID Check
    let voterScore = 0;
    if (upperText.includes('ELECTION COMMISSION OF INDIA') || upperText.includes('ELECTOR PHOTO IDENTITY CARD') || upperText.includes('BHARAT NIRVACHAN AYOG')) {
      voterScore += 0.6;
      signals.push('Found: Election Commission of India / EPIC');
    }
    if (upperText.includes('ELECTOR') || upperText.includes('EPIC') || upperText.includes('IDENTITY CARD')) { voterScore += 0.3; }
    const voterMatch = upperText.match(voterEpicRegex) || upperText.match(voterFormat2);
    if (voterMatch) { voterScore += 0.5; signals.push(`Found Voter ID Pattern: ${voterMatch[0]}`); }

    if (voterScore >= 0.5) {
      return { documentType: 'voter_id', confidence: Math.min(1.0, voterScore), signals };
    }

    // 4. Ration Card / Khadya Suraksha
    let rationScore = 0;
    if (upperText.includes('RATION CARD') || upperText.includes('KHADYA SURAKSHA') || upperText.includes('NFSA') || upperText.includes('FOOD & SUPPLIES') || cleanText.includes('राशन') || cleanText.includes('खाद्य सुरक्षा')) {
      rationScore += 0.7;
      signals.push('Found: Ration Card / Khadya Suraksha indicators');
    }
    if (rationScore >= 0.6) {
      return { documentType: 'ration_card', confidence: Math.min(1.0, rationScore), signals };
    }

    // 5. Cancelled Cheque
    if (upperText.includes('CANCELLED') && (upperText.includes('PAY') || upperText.includes('IFSC') || upperText.includes('CHEQUE'))) {
      return { documentType: 'cancelled_cheque', confidence: 0.85, signals: ['Found: Cancelled Cheque text'] };
    }

    // 6. Passport
    if (upperText.includes('PASSPORT') && (upperText.includes('REPUBLIC OF INDIA') || upperText.includes('TYPE P'))) {
      return { documentType: 'passport', confidence: 0.9, signals: ['Found: Passport indicators'] };
    }

    // 7. Driving Licence
    if (upperText.includes('DRIVING LICENCE') || upperText.includes('DRIVING LICENSE') || upperText.includes('DL NO')) {
      return { documentType: 'driving_licence', confidence: 0.85, signals: ['Found: Driving Licence indicators'] };
    }

    // 8. Aadhaar Check (Front vs Back vs Combined)
    let aadhaarFrontScore = 0;
    let aadhaarBackScore = 0;

    if (upperText.includes('GOVERNMENT OF INDIA') || upperText.includes('BHARAT SARKAR') || cleanText.includes('भारत सरकार')) {
      aadhaarFrontScore += 0.3;
      signals.push('Found: Government of India');
    }
    if (upperText.includes('UNIQUE IDENTIFICATION AUTHORITY') || upperText.includes('UIDAI')) {
      aadhaarFrontScore += 0.3;
      signals.push('Found: UIDAI');
    }
    if (upperText.includes('AADHAAR') || upperText.includes('AADHAA') || cleanText.includes('आधार')) {
      aadhaarFrontScore += 0.3;
      signals.push('Found: Aadhaar keyword');
    }
    if (dobRegex.test(cleanText) || upperText.includes('MALE') || upperText.includes('FEMALE') || cleanText.includes('पुरुष') || cleanText.includes('महिला')) {
      aadhaarFrontScore += 0.3;
      signals.push('Found: DOB/Gender');
    }
    const aadhaarMatch = upperText.match(aadhaarRegex);
    if (aadhaarMatch && !upperText.includes('ACCOUNT NUMBER') && !upperText.includes('A/C')) {
      aadhaarFrontScore += 0.4;
      signals.push(`Found 12-digit Aadhaar pattern: ${aadhaarMatch[0]}`);
    }

    // Aadhaar Back specific indicators
    if (
      upperText.includes('ADDRESS:') || upperText.includes('ADDRESS') || upperText.includes('ADRESS') ||
      cleanText.includes('पता:') || cleanText.includes('पता') ||
      cleanText.includes('ঠিকানা:') || cleanText.includes('ঠিকানা')
    ) {
      aadhaarBackScore += 0.4;
      signals.push('Found: Address label');
    }
    if (
      /\b(S\/O|D\/O|W\/O|H\/O|C\/O|CARE OF|SON OF|DAUGHTER OF|WIFE OF|HUSBAND OF)\b/.test(upperText) ||
      cleanText.includes('আত্মজ') || cleanText.includes('কন্যা') || cleanText.includes('স্ত্রী') ||
      cleanText.includes('স্বামী') || cleanText.includes('পুত্র') || cleanText.includes('पत्नी') ||
      cleanText.includes('पिता') || cleanText.includes('पति')
    ) {
      aadhaarBackScore += 0.3;
      signals.push('Found: Relationship label (S/O, W/O, C/O)');
    }
    if (
      (pincodeRegex.test(upperText) || upperText.includes('PIN')) &&
      (upperText.includes('STATE') || upperText.includes('DIST') || upperText.includes('PO:') ||
       upperText.includes('VILL') || upperText.includes('POST') ||
       cleanText.includes('জেলা') || cleanText.includes('ডাকঘর') || cleanText.includes('গ্রাম') ||
       cleanText.includes('राज्य') || cleanText.includes('ज़िला') || cleanText.includes('जिला'))
    ) {
      aadhaarBackScore += 0.3;
      signals.push('Found: Pincode and location terms');
    }
    if (upperText.includes('1947') || upperText.includes('HELP@UIDAI') || upperText.includes('WWW.UIDAI.GOV.IN')) {
      aadhaarBackScore += 0.2;
      signals.push('Found: UIDAI helpline / website footer');
    }

    const hasAadhaarSignal = (
      upperText.includes('AADHAAR') || upperText.includes('AADHAA') || cleanText.includes('आधार') || cleanText.includes('আধার') ||
      upperText.includes('UNIQUE IDENTIFICATION') || upperText.includes('UIDAI') || cleanText.includes('ইউনিক আইডেন্টিফিকেশন') || cleanText.includes('भारतीय विशिष्ट पहचान प्राधिकरण') ||
      upperText.includes('GOVERNMENT OF INDIA') || upperText.includes('BHARAT SARKAR') || cleanText.includes('भारत सरकार') ||
      upperText.includes('1947') || upperText.includes('HELP@UIDAI') || upperText.includes('WWW.UIDAI.GOV.IN') || upperText.includes('MERA AADHAAR') || cleanText.includes('আমার আধার') ||
      (aadhaarMatch && !upperText.includes('ACCOUNT NUMBER') && !upperText.includes('A/C'))
    );

    const hasFrontSpecifics = dobRegex.test(cleanText) || upperText.includes('MALE') || upperText.includes('FEMALE') || cleanText.includes('पुरुष') || cleanText.includes('महिला') || cleanText.includes('মহিলা');
    const hasBackSpecifics = aadhaarBackScore >= 0.4;

    if (hasAadhaarSignal) {
      if (hasFrontSpecifics && hasBackSpecifics) {
        return { documentType: 'aadhaar_combined', confidence: Math.min(1.0, (aadhaarFrontScore + aadhaarBackScore) / 2), signals };
      }
      if (hasBackSpecifics && (aadhaarBackScore >= aadhaarFrontScore || !hasFrontSpecifics)) {
        return { documentType: 'aadhaar_back', confidence: Math.min(1.0, aadhaarBackScore), signals };
      }
      if (aadhaarFrontScore >= 0.4) {
        return { documentType: 'aadhaar_front', confidence: Math.min(1.0, aadhaarFrontScore), signals };
      }
      if (aadhaarBackScore >= 0.4) {
        return { documentType: 'aadhaar_back', confidence: Math.min(1.0, aadhaarBackScore), signals };
      }
    }

    // 9. Generic ID vs Generic Address vs Unknown
    if (/\b(IDENTITY CARD|PHOTO ID|GOVT ID)\b/.test(upperText)) {
      return { documentType: 'generic_identity_document', confidence: 0.4, signals: ['Found generic identity keywords'] };
    }
    if (pincodeRegex.test(upperText) && (upperText.includes('ROAD') || upperText.includes('STREET') || upperText.includes('VILLAGE') || upperText.includes('ADDRESS'))) {
      return { documentType: 'generic_address_document', confidence: 0.4, signals: ['Found generic address keywords'] };
    }

    return { documentType: 'unknown', confidence: 0, signals: ['Weak or insufficient text evidence'] };
  }
}
