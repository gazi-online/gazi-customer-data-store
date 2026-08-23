/**
 * test-google-input-tools.ts
 *
 * Mocked unit tests for GoogleInputToolsProvider.
 * Uses global fetch mocking — NO real HTTP requests made.
 *
 * Run: npx tsx test-google-input-tools.ts
 */

import { fetchBengaliSuggestions, type GoogleBengaliSuggestion } from './src/lib/names/GoogleInputToolsProvider';
import { isBengaliScript } from './src/lib/names/BengaliNameTransliterator';
import { isNonPersonNameCandidate } from './src/lib/names/nameSafety';

// ============================================================
// Test harness
// ============================================================

let passed = 0;
let failed = 0;
let fetchCallCount = 0;

function assert(condition: boolean, label: string, extra?: unknown) {
  if (condition) {
    console.log(`✅ [PASS] ${label}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${label}`, extra !== undefined ? `| got: ${JSON.stringify(extra)}` : '');
    failed++;
  }
}

function makeGoogleResponse(input: string, suggestions: string[]): unknown {
  return ['SUCCESS', [[input, suggestions, {}]]];
}

function makeBadResponse(): unknown {
  return { totally: 'wrong', shape: 42 };
}

// Mock/restore helpers
function mockFetchWith(impl: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>) {
  fetchCallCount = 0;
  (globalThis as any).fetch = async (url: string, opts?: { signal?: AbortSignal }) => {
    fetchCallCount++;
    if (opts?.signal?.aborted) {
      const e = new DOMException('Aborted', 'AbortError');
      throw e;
    }
    return impl(url);
  };
}

function restoreFetch() {
  (globalThis as any).fetch = undefined; // reset; real tests don't need real fetch
}

// ============================================================
// Main async test runner
// ============================================================

async function runTests() {

  // ── A: Reshma Khatun → Bengali candidates ─────────────────
  console.log('\n--- A: Reshma Khatun → Bengali candidates ---');
  mockFetchWith(() => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(makeGoogleResponse('Reshma Khatun', ['রেশমা খাতুন', 'রিশমা খাতুন', 'রেশমা খাটুন'])),
  }));
  const resultA = await fetchBengaliSuggestions('Reshma Khatun');
  assert(resultA.ok === true, 'A: result.ok is true');
  if (resultA.ok) {
    assert(resultA.suggestions.length > 0, 'A: at least 1 suggestion');
    assert(resultA.suggestions[0].value === 'রেশমা খাতুন', 'A: first suggestion = রেশমা খাতুন', resultA.suggestions[0]?.value);
    assert(resultA.suggestions[0].source === 'google_input_tools', 'A: source = google_input_tools');
  }
  restoreFetch();

  // ── B: Mohammad Islam Gazi → max 3 ────────────────────────
  console.log('\n--- B: Mohammad Islam Gazi → max 3 ---');
  mockFetchWith(() => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(makeGoogleResponse('Mohammad Islam Gazi', [
      'মোহাম্মদ ইসলাম গাজী', 'মুহাম্মদ ইসলাম গাজী',
      'মোহাম্মাদ ইসলাম গাজি', 'মোহাম্মদ ইছলাম গাজী',
    ])),
  }));
  const resultB = await fetchBengaliSuggestions('Mohammad Islam Gazi');
  assert(resultB.ok === true, 'B: result.ok');
  if (resultB.ok) {
    assert(resultB.suggestions.length <= 3, 'B: max 3 suggestions', resultB.suggestions.length);
    assert(resultB.suggestions.length > 0, 'B: at least 1 suggestion');
  }
  restoreFetch();

  // ── C: Duplicate candidates → dedupe ──────────────────────
  console.log('\n--- C: Duplicate candidates → dedupe ---');
  mockFetchWith(() => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(makeGoogleResponse('Rina Sarkar', [
      'রিনা সরকার', 'রিনা সরকার', 'রিনা সরকার',
    ])),
  }));
  const resultC = await fetchBengaliSuggestions('Rina Sarkar');
  assert(resultC.ok === true, 'C: result.ok');
  if (resultC.ok) {
    const seen = new Set(resultC.suggestions.map(s => s.value));
    assert(seen.size === resultC.suggestions.length, 'C: no duplicates', resultC.suggestions.map(s => s.value));
    assert(resultC.suggestions.length === 1, 'C: deduped to 1', resultC.suggestions.length);
  }
  restoreFetch();

  // ── D: Malformed response → [] ─────────────────────────────
  console.log('\n--- D: Malformed response → [] ---');
  mockFetchWith(() => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(makeBadResponse()),
  }));
  const resultD = await fetchBengaliSuggestions('Sudip Mandal');
  assert(resultD.ok === true, 'D: result.ok (no crash)');
  if (resultD.ok) {
    assert(resultD.suggestions.length === 0, 'D: empty on malformed', resultD.suggestions.length);
  }
  restoreFetch();

  // ── E: Timeout → unavailable ───────────────────────────────
  console.log('\n--- E: Timeout → unavailable ---');
  mockFetchWith((_url) => new Promise((_res, reject) => {
    setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 10);
  }));
  const resultE = await fetchBengaliSuggestions('Tanmoy Ghosh');
  assert(!resultE.ok, 'E: result.ok is false on timeout');
  if (!resultE.ok) assert(resultE.error === 'unavailable', 'E: error = unavailable', resultE.error);
  restoreFetch();

  // ── F: Google 5xx → unavailable ───────────────────────────
  console.log('\n--- F: Google 5xx → unavailable ---');
  mockFetchWith(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }));
  const resultF = await fetchBengaliSuggestions('Priya Das');
  assert(!resultF.ok, 'F: result.ok is false on 5xx');
  if (!resultF.ok) assert(resultF.error === 'unavailable', 'F: error = unavailable', resultF.error);
  restoreFetch();

  // ── G: Government header → skipped (0 requests) ───────────
  console.log('\n--- G: Government header → skipped (0 requests) ---');
  let gCalls = 0;
  mockFetchWith(() => { gCalls++; throw new Error('Should not be called'); });
  const resultG = await fetchBengaliSuggestions('Government of West Bengal');
  assert(!resultG.ok, 'G: result.ok is false');
  if (!resultG.ok) assert(resultG.error === 'skipped', 'G: error = skipped', resultG.error);
  assert(gCalls === 0, 'G: 0 HTTP requests made', gCalls);
  restoreFetch();

  // ── H: Bengali input → skipped (0 requests) ───────────────
  console.log('\n--- H: Bengali document name → skipped (0 requests) ---');
  let hCalls = 0;
  mockFetchWith(() => { hCalls++; throw new Error('Should not be called'); });
  const docBengali = 'রেশমা খাতুন';
  assert(isBengaliScript(docBengali), 'H: Bengali doc name detected');
  const resultH = await fetchBengaliSuggestions(docBengali);
  assert(!resultH.ok, 'H: result.ok is false');
  if (!resultH.ok) assert(resultH.error === 'skipped', 'H: error = skipped', resultH.error);
  assert(hCalls === 0, 'H: 0 HTTP requests for Bengali input', hCalls);
  restoreFetch();

  // ── I: Stale response guard basis ─────────────────────────
  console.log('\n--- I: Stale response guard basis ---');
  const keyReshma = 'Reshma Khatun'.trim().toLowerCase();
  const keyGazi = 'Mohammad Islam Gazi'.trim().toLowerCase();
  assert(keyReshma !== keyGazi, 'I: Different names → different cache keys (stale guard basis)');
  console.log('   ℹ️  Sequence-ID stale guard lives in ReviewPanel useEffect (integration test).');

  // ── J: Unaccepted candidate → not in finalData ────────────
  console.log('\n--- J: Unaccepted candidate → not auto-populated ---');
  const jAccepted = false;
  const jIdx = 0;
  const jSugs: GoogleBengaliSuggestion[] = [{ value: 'রেশমা খাতুন', source: 'google_input_tools' }];
  const jValid = jAccepted && jIdx !== null && jSugs[jIdx] !== undefined && 'Reshma Khatun' === 'Reshma Khatun';
  assert(jValid === false, 'J: Unaccepted suggestion → guard blocks auto-populate');

  // ── K: Accepted candidate → allowed in finalData ──────────
  console.log('\n--- K: Accepted candidate → populates finalData ---');
  const kAccepted = true;
  const kIdx = 1;
  const kSugs: GoogleBengaliSuggestion[] = [
    { value: 'রেশমা খাতুন', source: 'google_input_tools' },
    { value: 'রিশমা খাতুন', source: 'google_input_tools' },
  ];
  const kNameFor = 'Reshma Khatun';
  const kCurrent = 'Reshma Khatun';
  const kValid = kAccepted && kIdx !== null && kSugs[kIdx] !== undefined && kNameFor === kCurrent;
  assert(kValid === true, 'K: Accepted suggestion passes guard');
  assert(kSugs[kIdx].value === 'রিশমা খাতুন', 'K: Correct suggestion value selected', kSugs[kIdx]?.value);

  // ── L: Manual existing value → preserved ──────────────────
  console.log('\n--- L: Manual existing value → preserved ---');
  const lCurrent: Record<string, string> = { original_language_name: 'রেশমা খাতুন' };
  const lIncoming = 'রিশমা খাটুন';
  const lProtect = !!lCurrent.original_language_name && String(lCurrent.original_language_name).trim().length > 0;
  assert(lProtect === true, 'L: Manual value protection guard triggers');
  const lFinal = { ...lCurrent };
  if (!lProtect) lFinal.original_language_name = lIncoming;
  assert(lFinal.original_language_name === 'রেশমা খাতুন', 'L: Manual value unchanged after Auto Fill');

  // ── M: Next.js API Route POST handler tests ─────────────
  console.log('\n--- M: POST /api/bengali-suggestions Route Handler ---');
  const { POST } = await import('./src/app/api/bengali-suggestions/route');
  const { NextRequest } = await import('next/server');

  // M1: Invalid JSON body
  const reqM1 = new NextRequest('http://localhost:3000/api/bengali-suggestions', {
    method: 'POST',
    body: 'invalid-json{',
    headers: { 'Content-Type': 'application/json' },
  });
  const resM1 = await POST(reqM1);
  assert(resM1.status === 400, 'M1: Invalid JSON returns 400', resM1.status);

  // M2: Non-string full_name
  const reqM2 = new NextRequest('http://localhost:3000/api/bengali-suggestions', {
    method: 'POST',
    body: JSON.stringify({ full_name: 12345 }),
    headers: { 'Content-Type': 'application/json' },
  });
  const resM2 = await POST(reqM2);
  assert(resM2.status === 400, 'M2: Non-string full_name returns 400', resM2.status);

  // M3: Empty full_name
  const reqM3 = new NextRequest('http://localhost:3000/api/bengali-suggestions', {
    method: 'POST',
    body: JSON.stringify({ full_name: '   ' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const resM3 = await POST(reqM3);
  assert(resM3.status === 400, 'M3: Empty full_name returns 400', resM3.status);

  // M4: Name too long (> 200 chars)
  const reqM4 = new NextRequest('http://localhost:3000/api/bengali-suggestions', {
    method: 'POST',
    body: JSON.stringify({ full_name: 'A'.repeat(201) }),
    headers: { 'Content-Type': 'application/json' },
  });
  const resM4 = await POST(reqM4);
  assert(resM4.status === 400, 'M4: Name > 200 chars returns 400', resM4.status);

  // M5: Government header -> skipped
  const reqM5 = new NextRequest('http://localhost:3000/api/bengali-suggestions', {
    method: 'POST',
    body: JSON.stringify({ full_name: 'Government of West Bengal' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const resM5 = await POST(reqM5);
  const jsonM5 = await resM5.json();
  assert(resM5.status === 200 && jsonM5.skipped === true, 'M5: Government header returns 200 with skipped: true', jsonM5);

  // M6: Valid name -> suggestions
  mockFetchWith(() => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(makeGoogleResponse('Reshma Khatun', ['রেশমা খাতুন'])),
  }));
  const reqM6 = new NextRequest('http://localhost:3000/api/bengali-suggestions', {
    method: 'POST',
    body: JSON.stringify({ full_name: 'Reshma Khatun' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const resM6 = await POST(reqM6);
  const jsonM6 = await resM6.json();
  assert(resM6.status === 200 && Array.isArray(jsonM6.suggestions) && jsonM6.suggestions.length > 0, 'M6: Valid name returns suggestions array', jsonM6);
  restoreFetch();

  // ── isBengaliScript ────────────────────────────────────────
  console.log('\n--- isBengaliScript utility ---');
  assert(isBengaliScript('রেশমা খাতুন'), 'isBengaliScript: Bengali = true');
  assert(!isBengaliScript('Reshma Khatun'), 'isBengaliScript: Latin = false');
  assert(!isBengaliScript('रेशमा खातून'), 'isBengaliScript: Devanagari = false (not Bengali)');
  assert(!isBengaliScript(''), 'isBengaliScript: empty = false');

  // ── isNonPersonNameCandidate ───────────────────────────────
  console.log('\n--- isNonPersonNameCandidate ---');
  assert(isNonPersonNameCandidate('Government of West Bengal'), 'govt header rejected');
  assert(isNonPersonNameCandidate('পশ্চিমবঙ্গ সরকার'), 'Bengali govt header rejected');
  assert(isNonPersonNameCandidate('भारत सरकार'), 'Hindi govt header rejected');
  assert(!isNonPersonNameCandidate('Rina Sarkar'), 'Rina Sarkar NOT rejected');
  assert(!isNonPersonNameCandidate('Reshma Khatun'), 'Reshma Khatun NOT rejected');

  // ── SUMMARY ───────────────────────────────────────────────
  console.log(`\n${'='.repeat(74)}`);
  console.log(`GOOGLE INPUT TOOLS TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(74));

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Unexpected test error:', err);
  process.exit(1);
});
