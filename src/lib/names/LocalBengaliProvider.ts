/**
 * src/lib/names/LocalBengaliProvider.ts
 *
 * Local, deterministic, zero-dependency Bengali name transliteration utility.
 *
 * NO network calls. NO external API keys. NO LLMs.
 *
 * Architecture:
 *   1. Curated Token Dictionary — High-frequency Bengali/Indian first and last names.
 *   2. Syllable-Aware Phonetic Engine — Conservative English -> Bengali syllable mapping
 *      (consonant clusters + vowel matras) for unlisted tokens.
 *   3. Combination & Ranking Engine — Produces Cartesian combinations, deduplicates,
 *      and caps at MAX_SUGGESTIONS (3).
 *
 * Safety:
 *   - Reuses isNonPersonNameCandidate() to reject government/organization/relation headers.
 *   - Never transliterates text that is already in Bengali script.
 *   - Never fabricates extra name tokens.
 */

import { isNonPersonNameCandidate } from './nameSafety';
import { isBengaliScript } from './BengaliNameTransliterator';

const MAX_SUGGESTIONS = 3;

// ---------------------------------------------------------------------------
// 1. CURATED TOKEN DICTIONARY (High-frequency Bengali / Indian name tokens)
// ---------------------------------------------------------------------------
const TOKEN_DICT: Record<string, string[]> = {
  // Titles / Prefixes
  md: ['মোঃ', 'মোহাম্মদ'],
  mohammad: ['মোহাম্মদ', 'মুহাম্মদ'],
  mohammed: ['মোহাম্মদ', 'মুহাম্মদ'],
  muhammad: ['মুহাম্মদ', 'মোহাম্মদ'],
  sk: ['শেখ'],
  sheikh: ['শেখ'],
  shaikh: ['শেখ'],
  syed: ['সৈয়দ'],
  sayed: ['সৈয়দ'],

  // Common Surnames
  gazi: ['গাজী', 'গাজি'],
  ghazi: ['গাজী', 'গাজি'],
  khatun: ['খাতুন'],
  khatoon: ['খাতুন'],
  begum: ['বেগম'],
  islam: ['ইসলাম'],
  rahman: ['রহমান', 'রাহমান'],
  rahaman: ['রহমান', 'রাহমান'],
  ali: ['আলী', 'আলি'],
  hossain: ['হোসেন', 'হুসেন'],
  hossein: ['হোসেন', 'হুসেন'],
  hussain: ['হোসেন', 'হুসেন'],
  hussein: ['হোসেন', 'হুসেন'],
  rahim: ['রহিম'],
  karim: ['করিম'],
  sardar: ['সরদার'],
  shardar: ['সরদার'],
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
  haldar: ['হালদার'],
  halder: ['হালদার'],
  dutta: ['দত্ত'],
  dutt: ['দত্ত'],
  gupta: ['গুপ্ত'],
  jha: ['ঝা'],
  sharma: ['শর্মা'],
  kumar: ['কুমার'],
  singh: ['সিংহ'],

  // Female First Names
  jesmira: ['জেসমিরা', 'জেসমীরা'],
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
  lata: ['লতা'],
  mamata: ['মমতা'],
  anjali: ['অঞ্জলি'],
  mita: ['মিতা'],
  susmita: ['সুস্মিতা'],
  moumita: ['মৌমিতা'],
  shreya: ['শ্রেয়া'],

  // Male First Names
  nur: ['নুর', 'নূর'],
  noor: ['নূর', 'নুর'],
  rahul: ['রাহুল'],
  rakesh: ['রাকেশ'],
  ramesh: ['রমেশ'],
  suresh: ['সুরেশ'],
  mukesh: ['মুকেশ'],
  rajesh: ['রাজেশ'],
  suman: ['সুমন'],
  sumon: ['সুমন'],
  ratan: ['রতন'],
  rabi: ['রবি'],
  robin: ['রবিন'],
  rinku: ['রিংকু'],
  tapan: ['তপন'],
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
  sudip: ['সুদীপ'],
  sudipta: ['সুদীপ্ত'],
  tanmoy: ['তন্ময়'],
  tanmay: ['তন্ময়'],
  soumen: ['সৌমেন'],
  partho: ['পার্থ'],
  partha: ['পার্থ'],
  arnab: ['অর্ণব'],
  tarun: ['তরুণ'],
  arun: ['অরুণ'],
  barun: ['বরুণ'],
  kamal: ['কমল'],
  ramen: ['রামেন'],
  shyamal: ['শ্যামল'],
  bimal: ['বিমল'],
  nirmal: ['নির্মল'],
  bikash: ['বিকাশ'],
  ashok: ['অশোক'],
  subrata: ['সুব্রত'],
  swapan: ['স্বপন'],
  uttam: ['উত্তম'],
  manik: ['মানিক'],
  abdul: ['আব্দুল'],
};

// ---------------------------------------------------------------------------
// 2. SYLLABLE-AWARE PHONETIC TRANSLITERATION ENGINE
// ---------------------------------------------------------------------------

const VOWEL_MATRA: Record<string, string> = {
  'aa': 'া', 'a': '',
  'ii': 'ী', 'i': 'ি',
  'ee': 'ী',
  'uu': 'ূ', 'u': 'ু',
  'oo': 'ু',
  'e':  'ে', 'ei': 'ে',
  'o':  'ো', 'ou': 'ো',
  'oi': 'ৈ', 'au': 'ৌ',
};

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
    let vowelMatched = false;
    for (const vk of VOWEL_KEYS) {
      if (lower.startsWith(vk, i)) {
        if (lastWasConsonant) {
          result += VOWEL_MATRA[vk];
        } else {
          result += (VOWEL_STANDALONE[vk] ?? '');
        }
        i += vk.length;
        lastWasConsonant = false;
        vowelMatched = true;
        break;
      }
    }
    if (vowelMatched) continue;

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

    // Unmapped character
    i++;
  }

  return result.trim() || token;
}

// ---------------------------------------------------------------------------
// 3. TOKEN CANDIDATE & COMBINATION RESOLVER
// ---------------------------------------------------------------------------

function getCandidatesForToken(token: string): string[] {
  const lower = token.toLowerCase();
  if (TOKEN_DICT[lower] && TOKEN_DICT[lower].length > 0) {
    return TOKEN_DICT[lower];
  }
  const phonetic = phoneticTransliterate(token);
  return [phonetic];
}

function buildCombinations(tokenCandidates: string[][]): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  function recurse(idx: number, current: string[]) {
    if (results.length >= MAX_SUGGESTIONS) return;
    if (idx === tokenCandidates.length) {
      const value = current.join(' ').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      results.push(value);
      return;
    }
    const candidates = tokenCandidates[idx];
    for (const candidate of candidates) {
      if (results.length >= MAX_SUGGESTIONS) break;
      recurse(idx + 1, [...current, candidate]);
    }
  }

  recurse(0, []);
  return results;
}

// ---------------------------------------------------------------------------
// 4. PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Deterministically suggest Bengali transliterations for an English customer name.
 * Returns up to 3 distinct Bengali strings.
 */
export function suggestBengaliNames(fullName: string): string[] {
  if (!fullName || typeof fullName !== 'string') return [];
  const trimmed = fullName.trim();
  if (!trimmed) return [];

  // Reject government/header/relationship text
  if (isNonPersonNameCandidate(trimmed)) return [];

  // Already Bengali script — return as-is
  if (isBengaliScript(trimmed)) return [trimmed];

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const tokenCandidates = tokens.map(getCandidatesForToken);
  const combinations = buildCombinations(tokenCandidates);

  // Filter only strings with valid Bengali characters
  const seen = new Set<string>();
  const validSuggestions: string[] = [];

  for (const s of combinations) {
    const clean = s.trim().replace(/\s+/g, ' ');
    if (clean && !seen.has(clean) && isBengaliScript(clean)) {
      seen.add(clean);
      validSuggestions.push(clean);
      if (validSuggestions.length >= MAX_SUGGESTIONS) break;
    }
  }

  return validSuggestions;
}
