/**
 * src/lib/names/nameSafety.ts
 *
 * Centralized non-person-header rejection logic.
 * Shared by DocumentTextParser and BengaliNameTransliterator
 * so that government/department/commission strings are
 * rejected from BOTH OCR extraction AND transliteration input.
 *
 * DO NOT add AI/network calls here. Must stay deterministic.
 */

const HARD_REJECT_TERMS: string[] = [
  'GOVERNMENT OF', 'GOVT OF', 'GOVT. OF', 'REPUBLIC OF INDIA', 'STATE GOVERNMENT',
  'MINISTRY OF', 'DEPARTMENT OF', 'COMMISSION OF', 'AUTHORITY OF', 'INCOME TAX',
  'ELECTION COMMISSION', 'UNIQUE IDENTIFICATION', 'UIDAI', 'AADHAAR', 'ADHAAR',
  'ELECTOR PHOTO IDENTITY CARD', 'PERMANENT ACCOUNT NUMBER', 'PAN CARD',
  'DRIVING LICENCE', 'PASSPORT', 'WEST BENGAL', 'GOVERNMENT OF WEST BENGAL',
  'GOVT. OF WEST BENGAL', 'GOVERNMENT OF INDIA', 'GOVT OF INDIA', 'GOVT. OF INDIA',
  'FOOD & SUPPLIES', 'KHADYA SURAKSHA', 'PASSBOOK', 'BANK STATEMENT', 'STATE BANK',
  'SAVINGS BANK', 'HELP', 'WWW.', 'HTTP', 'HTTPS', 'AUTHORITY', 'ENROLMENT',
  // Hindi
  'भारत सरकार', 'पश्चिमबंग सरकार', 'पश्चिम बंगाल सरकार', 'राज्य सरकार', 'आयकर विभाग',
  'निर्वाचन आयोग', 'चुनाव आयोग', 'राशन कार्ड', 'खाद्य विभाग', 'आधार',
  // Bengali
  'পশ্চিমবঙ্গ সরকার', 'ভারত সরকার', 'ইউনিক আইডেন্টিফিকেশন', 'অথরিটি অব ইন্ডিয়া',
  'ইন্ডিয়া', 'নির্বাচন কমিশন', 'আয়কর বিভাগ', 'আধার',
];

const GOVT_PATTERNS: RegExp[] = [
  /\bgovt\b|\bgovernment\b/i,
  /\bministry\b|\bdepartment\b|\bcommission\b|\bauthority\b/i,
  /\belection commission\b|\bincome tax\b/i,
  /\bপশ্চিমবঙ্গ|\bপশ্চিম বঙ্গ/u,
  /\bভারত সরকার|\bসরকার\b/u,
  /\bभारत सरकार|\bपश्चिमबंग|\bआयकर|\bनिर्वाचन/u,
];

/**
 * Returns true if the value is clearly a government/organization header
 * or a document label — i.e. it must NEVER be treated as a person's name.
 *
 * Shared between DocumentTextParser (OCR extraction)
 * and BengaliNameTransliterator (transliteration input guard).
 */
export function isNonPersonNameCandidate(value: string): boolean {
  if (!value || value.trim().length === 0) return true;

  const upper = value.toUpperCase().trim();

  for (const term of HARD_REJECT_TERMS) {
    if (upper.includes(term.toUpperCase())) return true;
  }

  for (const pat of GOVT_PATTERNS) {
    if (pat.test(value)) return true;
  }

  // Reject document labels, DOB/gender lines, long numbers
  if (
    /\b(DOB|Date of Birth|YOB|Year of Birth|जन्म तिथि|जन्म वर्ष|जन्म तारीख|জন্ম তারিখ|জন্মতারিখ|জন্ম সাল)\b/i.test(value) ||
    /\b(MALE|FEMALE|TRANSGENDER|पुरुष|महिला|মহিলা)\b/i.test(value) ||
    /\b(Address|पता|ঠিকানা|PIN|Pincode|Post Office)\b/i.test(value) ||
    /\b(S\/O|D\/O|W\/O|H\/O|C\/O|Son of|Daughter of|Wife of|Husband of|Care of)\b/i.test(value) ||
    /\d{4,}/.test(value)
  ) {
    return true;
  }

  return false;
}

/**
 * Conservative script-aware validator that returns true if the value contains
 * meaningful non-Latin / native script (e.g. Bengali বাংলা, Devanagari/Hindi हिंदी,
 * Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, or Urdu)
 * without being government headers, OCR noise, or predominantly Latin text.
 */
export function hasMeaningfulNativeScript(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;

  // Reject URL/web addresses or excessive digits
  if (/\b(?:https?:\/\/|www\.)/i.test(trimmed)) return false;
  const digits = trimmed.match(/\d/g) || [];
  if (digits.length > 2) return false;

  // Reject government headers, relationship prefixes, address lines, etc.
  if (isNonPersonNameCandidate(trimmed)) return false;

  // Supported Indic & native script ranges:
  // \u0900-\u097F : Devanagari (Hindi, Marathi, Sanskrit, Nepali)
  // \u0980-\u09FF : Bengali, Assamese
  // \u0A00-\u0A7F : Gurmukhi (Punjabi)
  // \u0A80-\u0AFF : Gujarati
  // \u0B00-\u0B7F : Odia / Oriya
  // \u0B80-\u0BFF : Tamil
  // \u0C00-\u0C7F : Telugu
  // \u0C80-\u0CFF : Kannada
  // \u0D00-\u0D7F : Malayalam
  // \u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF : Arabic / Urdu
  const nativeCharPattern = /[\u0900-\u0D7F\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const nativeMatches = trimmed.match(nativeCharPattern) || [];

  // Must have at least 2 native script characters
  if (nativeMatches.length < 2) return false;

  // Must be predominantly native script (prevent Latin with a single stray native character)
  const latinMatches = trimmed.match(/[A-Za-z]/g) || [];
  if (latinMatches.length > nativeMatches.length) return false;

  return true;
}
