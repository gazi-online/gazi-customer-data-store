/**
 * src/lib/names/BengaliNameTransliterator.ts
 *
 * Local, deterministic Bengali name transliteration utility.
 *
 * NO network. NO Gemini. NO OpenAI. NO Claude. NO OCR.space.
 *
 * Strategy:
 *   1. Token dictionary — curated map for common Indian/Bengali name tokens.
 *   2. Phonetic syllabic fallback — conservative English→Bengali mapping for
 *      unknown tokens (lower confidence than dictionary).
 *   3. Combination engine — joins per-token candidates into full names,
 *      deduplicates, caps at MAX_SUGGESTIONS.
 *
 * Safety:
 *   - Reuses isNonPersonNameCandidate() to reject government/header inputs.
 *   - Never invents additional name tokens.
 *   - Never transliterates a name already in Bengali script.
 */

import { isNonPersonNameCandidate } from './nameSafety';

export interface BengaliNameSuggestion {
  value: string;
  confidence: number;
  reason: 'dictionary' | 'phonetic' | 'mixed';
}

const MAX_SUGGESTIONS = 3;

// ---------------------------------------------------------------------------
// 1. CURATED TOKEN DICTIONARY
//    key: lowercase English token
//    value: Bengali spellings, most conventional first
// ---------------------------------------------------------------------------
const TOKEN_DICT: Record<string, string[]> = {
  // Common prefixes / titles
  md: ['মোঃ', 'মোহাম্মদ'],
  mohammad: ['মোহাম্মদ', 'মুহাম্মদ'],
  mohammed: ['মোহাম্মদ', 'মুহাম্মদ'],
  muhammad: ['মুহাম্মদ', 'মোহাম্মদ'],
  sk: ['শেখ'],
  sheikh: ['শেখ'],
  shaikh: ['শেখ'],

  // Surnames / last names
  gazi: ['গাজী', 'গাজি'],
  ghazi: ['গাজী', 'গাজি'],
  khatun: ['খাতুন'],
  khatoon: ['খাতুন'],
  begum: ['বেগম'],
  islam: ['ইসলাম'],
  rahman: ['রহমান', 'রাহমান'],
  ali: ['আলী', 'আলি'],
  hossain: ['হোসেন', 'হুসেন'],
  hossein: ['হোসেন', 'হুসেন'],
  hussain: ['হোসেন', 'হুসেন'],
  hussein: ['হোসেন', 'হুসেন'],
  rahim: ['রহিম'],
  karim: ['করিম'],
  roy: ['রায়'],
  das: ['দাস'],
  dey: ['দে'],
  de: ['দে'],
  mondal: ['মণ্ডল', 'মন্ডল'],
  mandal: ['মণ্ডল', 'মন্ডল'],
  biswas: ['বিশ্বাস'],
  sarkar: ['সরকার'],
  chakraborty: ['চক্রবর্তী'],
  chakrabarti: ['চক্রবর্তী'],
  banerjee: ['বন্দ্যোপাধ্যায়', 'ব্যানার্জি'],
  mukherjee: ['মুখোপাধ্যায়', 'মুখার্জি'],
  chatterjee: ['চট্টোপাধ্যায়', 'চ্যাটার্জি'],
  sen: ['সেন'],
  ghosh: ['ঘোষ'],
  paul: ['পাল'],
  pal: ['পাল'],
  saha: ['সাহা'],
  nath: ['নাথ'],
  molla: ['মোল্লা'],
  mullah: ['মোল্লা'],
  miah: ['মিয়া', 'মিঞা'],
  mia: ['মিয়া', 'মিঞা'],
  khan: ['খান'],
  pramanik: ['প্রামাণিক'],
  pramanick: ['প্রামাণিক'],
  haldar: ['হালদার'],
  halder: ['হালদার'],
  dutta: ['দত্ত'],
  dutt: ['দত্ত'],
  gupta: ['গুপ্ত'],
  jha: ['ঝা'],

  // First names — female
  reshma: ['রেশমা'],
  rekha: ['রেখা'],
  anita: ['অনিতা'],
  sunita: ['সুনিতা'],
  dipika: ['দীপিকা'],
  deepika: ['দীপিকা'],
  ruksana: ['রুকসানা'],
  hasina: ['হাসিনা'],
  fatema: ['ফাতেমা'],
  fatima: ['ফাতিমা'],
  nasrin: ['নাসরিন'],
  nasreen: ['নাসরিন'],
  parvin: ['পারভীন'],
  parveen: ['পারভীন'],
  meherun: ['মেহেরুন'],
  morjina: ['মর্জিনা'],
  maleka: ['মালেকা'],
  maleha: ['মালিহা'],
  sabina: ['সাবিনা'],
  selina: ['সেলিনা'],
  shapna: ['স্বপনা'],
  swapna: ['স্বপনা'],
  rina: ['রিনা'],
  mina: ['মিনা'],
  puja: ['পূজা'],
  pooja: ['পূজা'],
  priya: ['প্রিয়া'],
  soma: ['সোমা'],
  gita: ['গীতা'],
  geeta: ['গীতা'],
  lata: ['লতা'],
  mamata: ['মমতা'],
  mamta: ['মমতা'],
  anjali: ['অঞ্জলি'],
  mita: ['মিতা'],

  // First names — male
  dipu: ['দীপু'],
  debu: ['দেবু'],
  amit: ['অমিত'],
  sumit: ['সুমিত'],
  ranjit: ['রঞ্জিত'],
  sanjit: ['সঞ্জিত'],
  bijoy: ['বিজয়'],
  vijay: ['বিজয়'],
  bablu: ['বাবলু'],
  rahul: ['রাহুল'],
  rakesh: ['রাকেশ'],
  ramesh: ['রমেশ'],
  suresh: ['সুরেশ'],
  mukesh: ['মুকেশ'],
  naresh: ['নরেশ'],
  mahesh: ['মহেশ'],
  rajesh: ['রাজেশ'],
  suman: ['সুমন'],
  ratan: ['রতন'],
  rabi: ['রবি'],
  robin: ['রবিন'],
  rinku: ['রিংকু'],
  tapan: ['তপন'],
  bapan: ['বাপন'],
  subhas: ['সুভাষ'],
  subhash: ['সুভাষ'],
  arindam: ['অরিন্দম'],
  soumik: ['সৌমিক'],
  soumya: ['সৌম্য'],
  samir: ['সমীর'],
  sameer: ['সমীর'],
  kabir: ['কবির'],
  jakir: ['জাকির'],
  zahir: ['জাহির'],
  jahir: ['জাহির'],
  akter: ['আক্তার', 'আখতার'],
  akhter: ['আখতার', 'আক্তার'],
  aktar: ['আক্তার', 'আখতার'],
  rubel: ['রুবেল'],
  sumon: ['সুমন'],
  // Extended dictionary for better phonetic coverage
  sudip: ['সুদীপ'],
  sudipta: ['সুদীপ্ত'],
  tanmoy: ['তন্ময়'],
  tanmay: ['তন্ময়'],
  bose: ['বোস', 'বসু'],
  soumen: ['সৌমেন'],
  partho: ['পার্থ'],
  partha: ['পার্থ'],
  arnab: ['অর্ণব'],
  arpita: ['অর্পিতা'],
  susmita: ['সুস্মিতা'],
  moumita: ['মৌমিতা'],
  shreya: ['শ্রেয়া'],
  sudha: ['সুধা'],
  tarun: ['তরুণ'],
  arun: ['অরুণ'],
  barun: ['বরুণ'],
  kamal: ['কমল'],
  ramen: ['রামেন'],
  shyamal: ['শ্যামল'],
  bimal: ['বিমল'],
  nirmal: ['নির্মল'],
};

// ---------------------------------------------------------------------------
// 2. SYLLABLE-AWARE PHONETIC TRANSLITERATION  (English -> Bengali)
//    Uses consonant base + vowel matra (diacritic) model to avoid
//    malformed outputs like "সউদইপ" for "Sudip".
// ---------------------------------------------------------------------------

// Bengali vowel matras (dependent vowel signs used AFTER a consonant)
const VOWEL_MATRA: Record<string, string> = {
  'aa': 'া', 'a': '',   // inherent 'a' = no matra needed
  'ii': 'ী', 'i': 'ি',
  'ee': 'ী',
  'uu': 'ূ', 'u': 'ু',
  'oo': 'ু',
  'e':  'ে', 'ei': 'ে',
  'o':  'ো', 'ou': 'ো',
  'oi': 'ৈ', 'au': 'ৌ',
};

// Standalone vowels (used at token start or after another vowel)
const VOWEL_STANDALONE: Record<string, string> = {
  'aa': 'আ', 'a': 'অ',
  'ii': 'ঈ', 'i': 'ই',
  'ee': 'ই',
  'uu': 'ঊ', 'u': 'উ',
  'oo': 'উ',
  'e':  'এ', 'ei': 'এ',
  'o':  'ও', 'ou': 'ও',
  'oi': 'ঐ', 'au': 'ঔ',
};

// Consonant map (longest cluster first)
const CONSONANT_MAP: [string, string][] = [
  ['ksh', 'ক্ষ'], ['shh', 'ষ'],
  ['kh', 'খ'], ['gh', 'ঘ'], ['ch', 'ছ'], ['jh', 'ঝ'], ['th', 'ঠ'],
  ['dh', 'ধ'], ['ph', 'ফ'], ['bh', 'ভ'], ['sh', 'শ'],
  ['ng', 'ঙ'], ['ny', 'ঞ'],
  ['tr', 'ত্র'], ['pr', 'প্র'], ['br', 'ব্র'], ['kr', 'ক্র'],
  ['dr', 'ড্র'], ['gr', 'গ্র'], ['sr', 'স্র'], ['sw', 'স্ব'],
  ['b', 'ব'], ['c', 'ক'], ['d', 'দ'], ['f', 'ফ'], ['g', 'গ'],
  ['h', 'হ'], ['j', 'জ'], ['k', 'ক'], ['l', 'ল'], ['m', 'ম'],
  ['n', 'ন'], ['p', 'প'], ['q', 'ক'], ['r', 'র'], ['s', 'স'],
  ['t', 'ত'], ['v', 'ভ'], ['w', 'ব'], ['x', 'ক্স'], ['y', 'য'], ['z', 'জ'],
];

const VOWEL_KEYS = Object.keys(VOWEL_MATRA).sort((a, b) => b.length - a.length);

function phoneticTransliterate(token: string): string {
  const lower = token.toLowerCase();
  let result = '';
  let i = 0;
  let lastWasConsonant = false;

  while (i < lower.length) {
    // Try vowel (longest match first)
    let vowelMatched = false;
    for (const vk of VOWEL_KEYS) {
      if (lower.startsWith(vk, i)) {
        if (lastWasConsonant) {
          result += VOWEL_MATRA[vk];  // diacritic form
        } else {
          result += (VOWEL_STANDALONE[vk] ?? '');  // standalone form
        }
        i += vk.length;
        lastWasConsonant = false;
        vowelMatched = true;
        break;
      }
    }
    if (vowelMatched) continue;

    // Try consonant cluster (longest match first)
    let consMatched = false;
    for (const [eng, ben] of CONSONANT_MAP) {
      if (lower.startsWith(eng, i)) {
        result += ben;
        i += eng.length;
        lastWasConsonant = true;
        consMatched = true;
        break;
      }
    }
    if (consMatched) continue;

    // Unmapped character — skip silently
    i++;
  }

  return result.trim() || token;
}
// ---------------------------------------------------------------------------
// 3. PER-TOKEN CANDIDATE GENERATION
// ---------------------------------------------------------------------------
interface TokenCandidate {
  bengali: string[];
  reason: 'dictionary' | 'phonetic';
}

function getCandidatesForToken(token: string): TokenCandidate {
  const lower = token.toLowerCase();
  if (TOKEN_DICT[lower] && TOKEN_DICT[lower].length > 0) {
    return { bengali: TOKEN_DICT[lower], reason: 'dictionary' };
  }
  const phonetic = phoneticTransliterate(token);
  return { bengali: [phonetic], reason: 'phonetic' };
}

// ---------------------------------------------------------------------------
// 4. COMBINATION ENGINE
//    Takes per-token candidates and produces full-name combinations.
//    Caps at MAX_SUGGESTIONS distinct results.
// ---------------------------------------------------------------------------
function buildCombinations(tokenCandidates: TokenCandidate[]): BengaliNameSuggestion[] {
  // Use cartesian product but abort early once we have enough
  const results: BengaliNameSuggestion[] = [];
  const seen = new Set<string>();

  function recurse(idx: number, current: string[], reasons: Array<'dictionary' | 'phonetic'>) {
    if (results.length >= MAX_SUGGESTIONS) return;
    if (idx === tokenCandidates.length) {
      const value = current.join(' ').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      const allDict = reasons.every(r => r === 'dictionary');
      const allPhon = reasons.every(r => r === 'phonetic');
      const reason: BengaliNameSuggestion['reason'] = allDict ? 'dictionary' : allPhon ? 'phonetic' : 'mixed';
      const confidence = allDict ? 0.92 : allPhon ? 0.60 : 0.76;
      results.push({ value, confidence, reason });
      return;
    }
    const tc = tokenCandidates[idx];
    for (const candidate of tc.bengali) {
      if (results.length >= MAX_SUGGESTIONS) break;
      recurse(idx + 1, [...current, candidate], [...reasons, tc.reason]);
    }
  }

  recurse(0, [], []);
  return results;
}

// ---------------------------------------------------------------------------
// 5. PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Suggest Bengali transliterations for a Latin-script person name.
 *
 * Returns [] when:
 * - fullName is null/empty
 * - fullName is already in Bengali script
 * - fullName is a government/header string (via isNonPersonNameCandidate)
 *
 * Returns 1–3 distinct Bengali suggestions otherwise.
 */
export function suggestBengaliNames(fullName: string): BengaliNameSuggestion[] {
  if (!fullName || typeof fullName !== 'string') return [];
  const trimmed = fullName.trim();
  if (!trimmed) return [];

  // Reject government/header text
  if (isNonPersonNameCandidate(trimmed)) return [];

  // Already Bengali — do not transliterate again
  if (/[\u0980-\u09FF]/.test(trimmed)) return [];

  // Tokenise on whitespace
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const tokenCandidates = tokens.map(getCandidatesForToken);
  const suggestions = buildCombinations(tokenCandidates);

  // Final dedup by normalized value (strip extra spaces, normalise Unicode)
  const seen = new Set<string>();
  return suggestions.filter(s => {
    const key = s.value.trim().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_SUGGESTIONS);
}

/**
 * Returns true if the given string contains Bengali Unicode characters.
 * Used by ReviewPanel to detect document-derived Bengali names.
 */
export function isBengaliScript(value: string): boolean {
  return /[\u0980-\u09FF]/.test(value);
}


