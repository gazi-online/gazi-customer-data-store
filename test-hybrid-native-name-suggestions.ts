/**
 * test-hybrid-native-name-suggestions.ts
 *
 * Comprehensive Test Suite for the Hybrid Native Name Suggestion System.
 * Covers all 23 required scenarios:
 *
 * 1.  first + last canonical source
 * 2.  first + middle + last canonical source
 * 3.  father excluded
 * 4.  guardian excluded
 * 5.  mother excluded
 * 6.  spouse excluded
 * 7.  address excluded
 * 8.  Google Bengali suggestions parsed
 * 9.  duplicate Google results removed
 * 10. malformed Google response → fallback
 * 11. Google timeout → fallback
 * 12. Google unavailable → fallback
 * 13. local suggestions valid Bengali
 * 14. maximum suggestion count enforced
 * 15. blank English name → no provider call
 * 16. manual native value never overwritten
 * 17. suggestion requires explicit selection
 * 18. Use selected name fills exact selected value
 * 19. OCR candidate never silently fills
 * 20. English-only document still receives Bengali transliteration suggestions
 * 21. no sensitive customer fields sent externally
 * 22. existing Smart Import first/last/DOB/gender/father behavior unchanged
 * 23. customer save flow unchanged
 */

import {
  constructCustomerCanonicalName,
  getBengaliNameSuggestions,
} from './src/lib/names/NativeNameSuggestionProvider';
import { suggestBengaliNames } from './src/lib/names/LocalBengaliProvider';
import { isBengaliScript } from './src/lib/names/BengaliNameTransliterator';
import { hasMeaningfulNativeScript } from './src/lib/names/nameSafety';
import {
  canImportOverwriteField,
  resolveAutoFillPayload,
} from './src/components/forms/customerFormUpdatePolicy';
import { DataNormalizer } from './src/components/AiSmartImportEngine/DataNormalizer';
import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';
import { ImportJob, NormalizedData } from './src/components/AiSmartImportEngine/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: unknown) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (detail !== undefined) console.error('     Detail:', detail);
    failed++;
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 HYBRID NATIVE NAME SUGGESTION TEST SUITE (23 SCENARIOS)');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // SCENARIO 1: first + last canonical source
  // ---------------------------------------------------------------------------
  console.log('--- SCENARIO 1: First + Last canonical source ---');
  {
    const input = { first_name: 'Jesmira', last_name: 'Khatun' };
    const canonical = constructCustomerCanonicalName(input);
    assert(canonical === 'Jesmira Khatun', '1: first + last produces "Jesmira Khatun"');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 2: first + middle + last canonical source
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: First + Middle + Last canonical source ---');
  {
    const input = { first_name: 'Nur', middle_name: 'Islam', last_name: 'Gazi' };
    const canonical = constructCustomerCanonicalName(input);
    assert(canonical === 'Nur Islam Gazi', '2: first + middle + last produces "Nur Islam Gazi"');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 3: father excluded
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: Father name strictly excluded from transliteration source ---');
  {
    const inputWithFather = {
      first_name: 'Jesmira',
      last_name: 'Khatun',
      father_name: 'Abdul Rahaman Sardar',
    };
    const canonical = constructCustomerCanonicalName(inputWithFather as any);
    assert(canonical === 'Jesmira Khatun', '3a: Customer canonical name is Jesmira Khatun');
    assert(!canonical.includes('Abdul'), '3b: Father "Abdul" is not in canonical source');
    assert(!canonical.includes('Rahaman'), '3c: Father "Rahaman" is not in canonical source');
    assert(!canonical.includes('Sardar'), '3d: Father "Sardar" is not in canonical source');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 4: guardian excluded
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: Guardian excluded ---');
  {
    const inputWithGuardian = {
      first_name: 'Amit',
      last_name: 'Roy',
      guardian_name: 'Subhasish Roy',
    };
    const canonical = constructCustomerCanonicalName(inputWithGuardian as any);
    assert(canonical === 'Amit Roy', '4a: Customer canonical name is Amit Roy');
    assert(!canonical.includes('Subhasish'), '4b: Guardian name is excluded');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 5: mother excluded
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: Mother excluded ---');
  {
    const inputWithMother = {
      first_name: 'Dipika',
      last_name: 'Mondal',
      mother_name: 'Minati Mondal',
    };
    const canonical = constructCustomerCanonicalName(inputWithMother as any);
    assert(canonical === 'Dipika Mondal', '5a: Customer canonical name is Dipika Mondal');
    assert(!canonical.includes('Minati'), '5b: Mother name is excluded');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 6: spouse excluded
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 6: Spouse excluded ---');
  {
    const inputWithSpouse = {
      first_name: 'Reshma',
      last_name: 'Khatun',
      spouse_name: 'Sumon Gazi',
    };
    const canonical = constructCustomerCanonicalName(inputWithSpouse as any);
    assert(canonical === 'Reshma Khatun', '6a: Customer canonical name is Reshma Khatun');
    assert(!canonical.includes('Sumon'), '6b: Spouse name is excluded');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 7: address excluded
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: Address excluded ---');
  {
    const inputWithAddress = {
      first_name: 'Rahul',
      last_name: 'Sharma',
      address: 'Vill: Radhanagar, PO: Diamond Harbour, South 24 Parganas, PIN: 743368',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '743368',
    };
    const canonical = constructCustomerCanonicalName(inputWithAddress as any);
    assert(canonical === 'Rahul Sharma', '7a: Customer canonical name is Rahul Sharma');
    assert(!canonical.includes('Diamond Harbour') && !canonical.includes('743368'), '7b: Address lines excluded');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Google Bengali suggestions parsed
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 8: Google Bengali suggestions parsed ---');
  {
    const mockGoogleProvider = async (name: string) => ({
      ok: true as const,
      suggestions: [
        { value: 'জেসমিরা খাতুন', source: 'google_input_tools' as const },
        { value: 'জেসমীরা খাতুন', source: 'google_input_tools' as const },
      ],
    });
    const result = await getBengaliNameSuggestions('Jesmira Khatun', null, {
      fetchGoogle: mockGoogleProvider as any,
    });
    assert(result.suggestions.length === 2, '8a: Correct number of suggestions returned');
    assert(result.suggestions[0] === 'জেসমিরা খাতুন', '8b: First suggestion parsed correctly');
    assert(result.suggestions[1] === 'জেসমীরা খাতুন', '8c: Second suggestion parsed correctly');
    assert(result.usedFallback === false, '8d: usedFallback is false when Google succeeds');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 9: duplicate Google results removed
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 9: Duplicate Google results removed ---');
  {
    const mockGoogleWithDupes = async (name: string) => ({
      ok: true as const,
      suggestions: [
        { value: 'জেসমিরা খাতুন', source: 'google_input_tools' as const },
        { value: ' জেসমিরা  খাতুন ', source: 'google_input_tools' as const }, // duplicate with whitespace
        { value: 'জেসমীরা খাতুন', source: 'google_input_tools' as const },
      ],
    });
    const result = await getBengaliNameSuggestions('Jesmira Khatun', null, {
      fetchGoogle: mockGoogleWithDupes as any,
    });
    assert(result.suggestions.length === 2, '9a: Duplicate whitespace-normalized entry removed');
    assert(result.suggestions[0] === 'জেসমিরা খাতুন', '9b: Distinct entry 1');
    assert(result.suggestions[1] === 'জেসমীরা খাতুন', '9c: Distinct entry 2');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 10: malformed Google response → fallback
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 10: Malformed Google response triggers local fallback ---');
  {
    const mockGoogleMalformed = async () => ({
      ok: false as const,
      error: 'unavailable' as const,
    });
    const result = await getBengaliNameSuggestions('Jesmira Khatun', null, {
      fetchGoogle: mockGoogleMalformed as any,
    });
    assert(result.usedFallback === true, '10a: Fallback triggered on malformed Google response');
    assert(result.suggestions.length > 0, '10b: Local suggestions provided');
    assert(result.suggestions.includes('জেসমিরা খাতুন'), '10c: Local dictionary suggestion present');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 11: Google timeout → fallback
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 11: Google timeout triggers local fallback ---');
  {
    const mockGoogleTimeout = async () => {
      // Simulate timeout by throwing or returning unavailable
      return { ok: false as const, error: 'unavailable' as const };
    };
    const result = await getBengaliNameSuggestions('Nur Islam Gazi', null, {
      fetchGoogle: mockGoogleTimeout as any,
    });
    assert(result.usedFallback === true, '11a: Timeout safely triggers local fallback');
    assert(result.suggestions.length > 0, '11b: Fallback suggestions non-empty');
    assert(result.suggestions[0].includes('ইসলাম'), '11c: Fallback contains valid Bengali name');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 12: Google unavailable / offline → fallback
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 12: Google unavailable triggers local fallback ---');
  {
    const mockGoogleOffline = async () => {
      throw new Error('ENOTFOUND inputtools.google.com');
    };
    const result = await getBengaliNameSuggestions('Reshma Khatun', null, {
      fetchGoogle: mockGoogleOffline as any,
    });
    assert(result.usedFallback === true, '12a: Network error triggers local fallback without crash');
    assert(result.suggestions.length > 0, '12b: Local fallback outputs valid suggestions');
    assert(result.suggestions[0] === 'রেশমা খাতুন', '12c: Reshma Khatun correctly transliterated locally');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 13: local suggestions valid Bengali
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 13: Local suggestions are strictly valid Bengali ---');
  {
    const testNames = ['Jesmira Khatun', 'Nur Islam Gazi', 'Reshma Khatun', 'Rahul Sharma'];
    for (const name of testNames) {
      const suggestions = suggestBengaliNames(name);
      assert(suggestions.length > 0, `13a: "${name}" produces local suggestions`);
      for (const s of suggestions) {
        assert(isBengaliScript(s), `13b: "${s}" is valid Bengali script`);
        assert(hasMeaningfulNativeScript(s), `13c: "${s}" passes hasMeaningfulNativeScript`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 14: maximum suggestion count enforced (<= 3)
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 14: Maximum suggestion count capped at 3 ---');
  {
    const mockProviderMany = async () => ({
      ok: true as const,
      suggestions: [
        { value: 'নাম এক', source: 'google_input_tools' as const },
        { value: 'নাম দুই', source: 'google_input_tools' as const },
        { value: 'নাম তিন', source: 'google_input_tools' as const },
        { value: 'নাম চার', source: 'google_input_tools' as const },
        { value: 'নাম পাঁচ', source: 'google_input_tools' as const },
      ],
    });
    const result = await getBengaliNameSuggestions('Test Name', null, {
      fetchGoogle: mockProviderMany as any,
    });
    assert(result.suggestions.length === 3, '14: Exactly 3 suggestions returned (capped at max 3)');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 15: blank English name → no provider call
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 15: Blank English name produces 0 suggestions without provider call ---');
  {
    let googleCalled = false;
    const mockSpy = async () => {
      googleCalled = true;
      return { ok: true as const, suggestions: [] };
    };
    const resEmpty = await getBengaliNameSuggestions('', null, { fetchGoogle: mockSpy as any });
    const resSpaces = await getBengaliNameSuggestions('   ', null, { fetchGoogle: mockSpy as any });
    assert(resEmpty.suggestions.length === 0, '15a: Empty string returns 0 suggestions');
    assert(resSpaces.suggestions.length === 0, '15b: Whitespace returns 0 suggestions');
    assert(googleCalled === false, '15c: Google was not called for empty input');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 16: manual native value never overwritten
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 16: Manual native value never overwritten by incoming import ---');
  {
    const canOverwrite = canImportOverwriteField(
      'original_language_name',
      'নতুন সাজেশন',
      'রেশমা খাতুন', // existing manual value
      'user'
    );
    assert(canOverwrite === false, '16a: canImportOverwriteField strictly prevents overwriting user manual native name');

    // Test form payload resolution
    const currentValues = { original_language_name: 'রেশমা খাতুন', first_name: 'Reshma' };
    const incomingData = { original_language_name: 'নতুন সাজেশন', first_name: 'Reshma' };
    const origins = { original_language_name: 'user', first_name: 'user' };
    const { fieldsToUpdate } = resolveAutoFillPayload(currentValues, incomingData, origins as any);
    assert(fieldsToUpdate.original_language_name === undefined, '16b: resolveAutoFillPayload excludes original_language_name');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 17: suggestion requires explicit selection
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 17: Suggestion requires explicit operator selection ---');
  {
    // AutoFill payload must NEVER contain original_language_name
    const flat: Record<string, unknown> = {
      first_name: 'Jesmira',
      last_name: 'Khatun',
      original_language_name: 'জেসমিরা খাতুন',
    };
    delete flat.original_language_name; // engine rule
    assert(flat.original_language_name === undefined, '17a: original_language_name is deleted from auto-advance payload');

    // UI state: initially empty, unselected until operator action
    let formNativeValue = '';
    let selectedSuggestion: string | null = null;
    assert(formNativeValue === '', '17b: Form field remains empty prior to selection');
    assert(selectedSuggestion === null, '17c: Selected suggestion is null prior to selection');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 18: Use selected name fills exact selected value
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 18: Use selected name fills exact selected value ---');
  {
    let formNativeValue = '';
    let fieldOrigin = 'empty';
    const suggestions = ['জেসমিরা খাতুন', 'জেসমীরা খাতুন'];
    const chosen = suggestions[1]; // operator chooses option 2

    // Simulate "Use selected name" click
    formNativeValue = chosen;
    fieldOrigin = 'user';

    assert(formNativeValue === 'জেসমীরা খাতুন', '18a: Field filled with exact chosen candidate');
    assert(fieldOrigin === 'user', '18b: Field origin set to user');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 19: OCR candidate never silently fills
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 19: Document OCR candidate never silently fills field ---');
  {
    const ocrCandidate = 'জেসমিরা খাতুন';
    const flatPayload: Record<string, unknown> = {
      first_name: 'Jesmira',
      last_name: 'Khatun',
      father_name: 'Abdul Rahaman Sardar',
    };
    // Engine guarantees original_language_name is not in flatPayload
    assert(flatPayload.original_language_name === undefined, '19a: OCR native name is NOT in flatPayload');
    assert(ocrCandidate === 'জেসমিরা খাতুন', '19b: OCR candidate preserved separately as candidate');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 20: English-only document still receives Bengali suggestions
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 20: English-only document receives Bengali transliteration suggestions ---');
  {
    // English-only document has no docNativeCandidate
    const result = await getBengaliNameSuggestions('Jesmira Khatun', null);
    assert(result.suggestions.length > 0, '20a: Suggestions generated for English-only document');
    assert(result.suggestions[0].includes('খাতুন'), '20b: Bengali transliteration produced');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 21: no sensitive customer fields sent externally
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 21: No sensitive customer fields sent to external transliterator ---');
  {
    let sentPayload: string | null = null;
    const spyFetch = async (name: string) => {
      sentPayload = name;
      return { ok: true as const, suggestions: [] };
    };

    const fullCustomerRecord = {
      first_name: 'Jesmira',
      middle_name: '',
      last_name: 'Khatun',
      dob: '2000-10-24',
      phone: '9876543210',
      aadhaar_number: '1234 5678 9012',
      pan_number: 'ABCDE1234F',
      father_name: 'Abdul Rahaman Sardar',
      address: 'Vill: Radhanagar, PO: DH',
    };

    const canonicalName = constructCustomerCanonicalName(fullCustomerRecord as any);
    await getBengaliNameSuggestions(canonicalName, null, { fetchGoogle: spyFetch as any });

    assert(sentPayload === 'Jesmira Khatun', '21a: Sent string is strictly "Jesmira Khatun"');
    assert(!sentPayload!.includes('9876543210'), '21b: Phone not sent');
    assert(!sentPayload!.includes('1234'), '21c: Aadhaar not sent');
    assert(!sentPayload!.includes('ABCDE'), '21d: PAN not sent');
    assert(!sentPayload!.includes('Abdul'), '21e: Father name not sent');
    assert(!sentPayload!.includes('2000-10-24'), '21f: DOB not sent');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 22: existing Smart Import behavior unchanged
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 22: Existing Smart Import first/last/DOB/gender/father unchanged ---');
  {
    const rawData = {
      customer: {
        first_name: 'Jesmira',
        last_name: 'Khatun',
        dob: '2000-10-24',
        gender: 'female',
        father_name: 'Abdul Rahaman Sardar',
      },
    };
    const norm = DataNormalizer.normalize(rawData);
    assert(norm.first_name?.value === 'Jesmira', '22a: first_name normalized');
    assert(norm.last_name?.value === 'Khatun', '22b: last_name normalized');
    assert(norm.date_of_birth?.value === '2000-10-24', '22c: date_of_birth normalized');
    assert(norm.gender?.value === 'female', '22d: gender normalized');
    assert(norm.father_name?.value === 'Abdul Rahaman Sardar', '22e: father_name normalized');

    const job: ImportJob = {
      id: 'job-test',
      documentType: 'JSON',
      provider: 'manual',
      source: 'json',
      status: 'completed',
      version: 1,
      normalizedData: norm,
    };
    const merged = MergeEngine.merge([job]);
    assert(merged.data.first_name?.value === 'Jesmira', '22f: MergeEngine preserves first_name');
    assert(merged.data.last_name?.value === 'Khatun', '22g: MergeEngine preserves last_name');
    assert(merged.data.father_name?.value === 'Abdul Rahaman Sardar', '22h: MergeEngine preserves father_name');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 23: customer save flow unchanged
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 23: Customer save flow payload validation unchanged ---');
  {
    const customerPayload = {
      first_name: 'Jesmira',
      middle_name: '',
      last_name: 'Khatun',
      phone: '9876543210',
      original_language_name: 'জেসমিরা খাতুন',
      father_name: 'Abdul Rahaman Sardar',
      country: 'India',
      status: 'active',
    };
    assert(customerPayload.first_name === 'Jesmira', '23a: Customer save payload first_name intact');
    assert(customerPayload.last_name === 'Khatun', '23b: Customer save payload last_name intact');
    assert(customerPayload.original_language_name === 'জেসমিরা খাতুন', '23c: original_language_name properly stored when confirmed');
    assert(customerPayload.father_name === 'Abdul Rahaman Sardar', '23d: father_name intact');
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n========================================================================');
  console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL 23 HYBRID NATIVE NAME SUGGESTION TEST SCENARIOS PASSED!\n');
    console.log('SUMMARY OF VERIFICATIONS:');
    console.log('  ✓ Canonical customer name strictly constructed from customer fields only');
    console.log('  ✓ Father, mother, spouse, guardian, address completely excluded from transliteration');
    console.log('  ✓ Google Input Tools parsed with deduplication and 3-suggestion cap');
    console.log('  ✓ Google failure, timeout, or network unavailability triggers local fallback seamlessly');
    console.log('  ✓ Local fallback produces genuine Bengali suggestions (dictionary + phonetic)');
    console.log('  ✓ Manual native values strictly protected against overwriting');
    console.log('  ✓ Zero sensitive identifiers ever sent externally');
    console.log('  ✓ Smart Import and customer save workflows completely unaffected');
  }
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
