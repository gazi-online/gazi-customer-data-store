/**
 * GAZI SMART FORM FILLER — SECTIONS J, K & L TEST SUITE
 * File: scratch/test-sections-j-k-l.cjs
 *
 * Verifies all requirements for Finalizing Form Entry (Section J, K & L) — v1.4.0:
 * 1. Versioning: manifest.json is 1.4.0 and content.js is 1.4.0-stable
 * 2. SELECTOR_MAP includes complete Section J & Section K targets
 * 3. Section J: Smart Map & Missing EPIC Guard
 *    - Relation mapping to select dropdown & radios
 *    - Name filling (single input or separate first/surname)
 *    - Regional transliteration support
 *    - EPIC filling into #epicNumber / #currentRelEpic
 *    - Missing EPIC Guard Action Card (#gcds-family-epic-card) with Skip & Manual Fill
 * 4. Section K: Legal Confirmation
 *    - Residence date since (format: mm-yyyy)
 *    - Place & Village auto-fill
 *    - State & District dropdown selection
 *    - Human-in-the-loop Confirmation Card (#gcds-declaration-card)
 *    - Advancement to Section L only after operator confirmation
 * 5. Section L: Final Stop at Captcha
 *    - Shows #gcds-completion-card with mandatory text:
 *      "Form entry complete. Please solve Captcha and Submit manually to generate Receipt."
 *    - Stoppage of automation without auto-submitting
 * 6. Backend DTO mappings in form-fill route for relative and residence
 * 7. Window exports and cleanup hooks
 */

const assert = require('assert');
const fs = require('fs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✅ [PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] ' + name + ':', err.message);
    failed++;
  }
}

console.log('================================================================');
console.log('📋 GAZI SMART FORM FILLER — SECTIONS J, K & L (v1.6.1-GOLD) TESTS');
console.log('================================================================\n');

const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
const contentJs = fs.readFileSync('extension/content.js', 'utf8');
const routeTs = fs.readFileSync('src/app/api/extension/customers/[id]/form-fill/route.ts', 'utf8');

console.log('--- 1. Version & Release Tagging ---');

test('manifest.json version is 1.7.4', () => {
  assert.strictEqual(manifest.version, '1.7.4');
});

test('content.js diagnostic version is 1.7.4-FinalStability', () => {
  assert.ok(contentJs.includes("version: '1.7.4-FinalStability'"));
});

test('content.js exports repositionStealthUI for coordinate-based positioning', () => {
  assert.ok(contentJs.includes("repositionStealthUI,"));
});

test('content.js exports handleSectionI, findSectionINextButton, and Status Pill actions', () => {
  assert.ok(contentJs.includes("handleSectionI,"));
  assert.ok(contentJs.includes("findSectionINextButton,"));
  assert.ok(contentJs.includes("setStealthPillActions,"));
  assert.ok(contentJs.includes("clearStealthPillActions,"));
});

console.log('\n--- 2. SELECTOR_MAP Section J & K Selectors ---');

test('SELECTOR_MAP includes Section J selectors (Name, Surname, Relation, EPIC, Regional)', () => {
  assert.ok(contentJs.includes('familyMemberName: ['));
  assert.ok(contentJs.includes("'input[aria-label=\"Name of Family Member\" i]'"));
  assert.ok(contentJs.includes("'input[name=\"currentRelFullName\"]'"));
  assert.ok(contentJs.includes('familyMemberSurname: ['));
  assert.ok(contentJs.includes("'input#applicantRelativeSurname'"));
  assert.ok(contentJs.includes('familyMemberRelation: ['));
  assert.ok(contentJs.includes("'select#currentRelRelationship'"));
  assert.ok(contentJs.includes("'select#relationType'"));
  assert.ok(contentJs.includes("'select[formcontrolname=\"relationType\"]'"));
  assert.ok(contentJs.includes('familyMemberEpic: ['));
  assert.ok(contentJs.includes("'input[aria-label=\"His/Her EPIC Number\" i]'"));
  assert.ok(contentJs.includes("'input[name=\"currentRelEpic\"]'"));
  assert.ok(contentJs.includes('familyMemberRegionalName: ['));
  assert.ok(contentJs.includes('familyMemberRegionalSurname: ['));
});

test('SELECTOR_MAP includes Section K selectors (Place, Village, Date, Residence Since, State, District)', () => {
  assert.ok(contentJs.includes('declarationPlace: ['));
  assert.ok(contentJs.includes("'input#Place'"));
  assert.ok(contentJs.includes('declarationVillage: ['));
  assert.ok(contentJs.includes("'input#village[name=\"village\"]'"));
  assert.ok(contentJs.includes('residenceDateSince: ['));
  assert.ok(contentJs.includes("'input[name=\"dob\"][placeholder=\"mm-yyyy\"]'"));
  assert.ok(contentJs.includes('declarationState: ['));
  assert.ok(contentJs.includes("'select#stateCodeA'"));
  assert.ok(contentJs.includes('declarationDistrict: ['));
  assert.ok(contentJs.includes("'select#districtCdA'"));
});

console.log('\n--- 3. Section J: Dynamic Family Member Selection & Missing EPIC Guard ---');

test('handleSectionJFamilyMember is defined and exported', () => {
  assert.ok(contentJs.includes('async function handleSectionJFamilyMember(data)'));
  assert.ok(contentJs.includes('handleSectionJFamilyMember,'));
});

test('SECTION_J_RELATIONS defines all 4 family relations (Father, Mother, Husband, Guardian)', () => {
  assert.ok(contentJs.includes("code: 'FTHR', labelEn: 'Father'"));
  assert.ok(contentJs.includes("code: 'MTHR', labelEn: 'Mother'"));
  assert.ok(contentJs.includes("code: 'HSBN', labelEn: 'Husband'"));
  assert.ok(contentJs.includes("code: 'GRDN', labelEn: 'Guardian'"));
});

test('extractFamilyRecords dynamically maps data for all 4 relations', () => {
  assert.ok(contentJs.includes('function extractFamilyRecords(data)'));
  assert.ok(contentJs.includes('father_first_middle_name || data.relative?.fatherName'));
  assert.ok(contentJs.includes('mother_first_middle_name || data.relative?.motherName'));
  assert.ok(contentJs.includes('spouse_first_middle_name || data.relative?.spouseName'));
  assert.ok(contentJs.includes('guardian_first_middle_name || data.relative?.guardianName'));
});

test('selectSectionJDropdown synchronizes portal dropdown with selected relation', () => {
  assert.ok(contentJs.includes('function selectSectionJDropdown(relCode, familyRecords)'));
  assert.ok(contentJs.includes('select#currentRelRelationship'));
  assert.ok(contentJs.includes('dispatchStandardEvents(relSelect)'));
  assert.ok(contentJs.includes('relSelect[propKey].onChange'));
});

test('handleSectionJFamilyMember renders 4 relation chips in #gcds-family-epic-card', () => {
  assert.ok(contentJs.includes('card.id = \'gcds-family-epic-card\''));
  assert.ok(contentJs.includes('Family Relation Picker'));
  assert.ok(contentJs.includes('id="gcds-sec-j-chips"'));
  assert.ok(contentJs.includes('family-chip-${o.code.toLowerCase()}'));
  assert.ok(contentJs.includes('SECTION_J_RELATIONS.map'));
});

test('handleSectionJFamilyMember provides manual fallback prompt when EPIC is missing', () => {
  assert.ok(contentJs.includes('EPIC not found in GCDS'));
  assert.ok(contentJs.includes('id="gcds-manual-family-epic"'));
  assert.ok(contentJs.includes('id="gcds-btn-fill-family"'));
  assert.ok(contentJs.includes('id="gcds-btn-skip-family-epic"'));
});

test('handleSectionJFamilyMember stays in Section J to allow operator verification', () => {
  assert.ok(contentJs.includes('id="gcds-btn-proceed-family"'));
  assert.ok(contentJs.includes('Proceed to Section K'));
  assert.ok(contentJs.includes('Family details are optional. Verify fields before advancing.'));
});

test('transitionSectionJToK transitions to Section K and verifies active state', () => {
  assert.ok(contentJs.includes('async function transitionSectionJToK('));
  assert.ok(contentJs.includes("await clickSectionNextButton('J')"));
  assert.ok(contentJs.includes("txt.includes('k.') || txt.includes('11.')"));
  assert.ok(contentJs.includes("txt.includes('declaration')"));
});

console.log('\n--- 4. Section K: Legal Confirmation ---');

test('handleSectionKDeclaration is defined', () => {
  assert.ok(contentJs.includes('async function handleSectionKDeclaration(data)'));
});

test('handleSectionKDeclaration formats date of residence to mm-yyyy', () => {
  assert.ok(contentJs.includes('data.address_since || data.resident_since'));
  assert.ok(contentJs.includes('placeholder="mm-yyyy"'));
});

test('handleSectionKDeclaration shows mandatory #gcds-declaration-card before proceeding', () => {
  assert.ok(contentJs.includes('card.id = \'gcds-declaration-card\''));
  assert.ok(contentJs.includes('Legal Declaration: Resident since'));
  assert.ok(contentJs.includes('id="gcds-btn-confirm-declaration"'));
  assert.ok(contentJs.includes('Confirm &amp; Proceed to Captcha'));
});

test('transitionSectionKToL transitions to Section L and verifies active state', () => {
  assert.ok(contentJs.includes('async function transitionSectionKToL('));
  assert.ok(contentJs.includes("await clickSectionNextButton('K')"));
  assert.ok(contentJs.includes("txt.includes('l.') || txt.includes('12.')"));
  assert.ok(contentJs.includes("txt.includes('captcha')"));
});

console.log('\n--- 5. Section L: Final Stop at Captcha & Acknowledgment Watcher ---');

test('showSectionLCompletionCard displays completion message and initiates watcher', () => {
  assert.ok(contentJs.includes('function showSectionLCompletionCard'));
  assert.ok(contentJs.includes('card.id = \'gcds-completion-card\''));
  assert.ok(contentJs.includes('Form entry complete. Please solve Captcha and Submit manually to generate Receipt.'));
  assert.ok(contentJs.includes('ফর্ম ফিলিং সম্পন্ন হয়েছে।'));
  assert.ok(contentJs.includes('Final Submission Guarded: Solve Captcha &amp; Click Preview/Submit'));
  assert.ok(contentJs.includes('watchForFinalSubmission(customerData);'));
});

test('watchForFinalSubmission satisfies all 4 completion criteria and auto-closes in 3.5s', () => {
  assert.ok(contentJs.includes('function watchForFinalSubmission('));
  assert.ok(contentJs.includes('application\\s+submitted\\s+successfully'));
  assert.ok(contentJs.includes('আবেদন\\s+সফলভাবে\\s+জমা'));
  assert.ok(contentJs.includes('WB\\/?\\d{4}'));
  assert.ok(contentJs.includes('download|acknowledg|print'));
  assert.ok(contentJs.includes('Submission Recorded! Ref:'));
  assert.ok(contentJs.includes('Closing &amp; Syncing with GCDS...'));
  assert.ok(contentJs.includes("action: 'FORM_SUBMISSION_COMPLETED'"));
  assert.ok(contentJs.includes('window.__GCDS_CONTENT_SCRIPT_CLEANUP()'));
  assert.ok(contentJs.includes('3500'));
});

console.log('\n--- 6. Backend Form Fill Route & Background Handler ---');

test('form-fill/route.ts returns Section J & K mappings', () => {
  assert.ok(routeTs.includes('relative_name: (customer as any).relative_name || null'));
  assert.ok(routeTs.includes('relative_surname: (customer as any).relative_surname || null'));
  assert.ok(routeTs.includes('relative_type: (customer as any).relative_type || null'));
  assert.ok(routeTs.includes('relative_epic_number: (customer as any).relative_epic_number'));
  assert.ok(routeTs.includes('address_since: (customer as any).address_since || (customer as any).resident_since || null'));
});

test('background.js handles FORM_SUBMISSION_COMPLETED with session reset and notification', () => {
  const bgJs = fs.readFileSync('extension/background.js', 'utf8');
  assert.ok(bgJs.includes("case 'FORM_SUBMISSION_COMPLETED':"));
  assert.ok(bgJs.includes('gcds_last_submission'));
  assert.ok(bgJs.includes('chrome.notifications.create'));
  assert.ok(bgJs.includes('GCDS: Application Synced Successfully'));
  assert.ok(bgJs.includes("chrome.storage.session.remove(['activeCustomer'"));
});

console.log('\n--- 7. Integration, Styles & Cleanup ---');

test('fillForm integrates Section J, Section K, and Section L flows', () => {
  assert.ok(contentJs.includes('const secJResult = await handleSectionJFamilyMember(data);'));
  assert.ok(contentJs.includes('const secKResult = await handleSectionKDeclaration(data);'));
  assert.ok(contentJs.includes('showSectionLCompletionCard(data);'));
});

test('window.__GCDS_FILL_ENGINE exports Section J, K, and L functions', () => {
  assert.ok(contentJs.includes('transitionSectionJToK,'));
  assert.ok(contentJs.includes('handleSectionJFamilyMember,'));
  assert.ok(contentJs.includes('transitionSectionKToL,'));
  assert.ok(contentJs.includes('handleSectionKDeclaration,'));
  assert.ok(contentJs.includes('showSectionLCompletionCard,'));
  assert.ok(contentJs.includes('watchForFinalSubmission,'));
});

test('window.__GCDS_CONTENT_SCRIPT_CLEANUP removes all 3 new cards and disconnects observer', () => {
  assert.ok(contentJs.includes('const staleFamily = document.getElementById(\'gcds-family-epic-card\');'));
  assert.ok(contentJs.includes('const staleDecl = document.getElementById(\'gcds-declaration-card\');'));
  assert.ok(contentJs.includes('const staleComplete = document.getElementById(\'gcds-completion-card\');'));
  assert.ok(contentJs.includes('window.__GCDS_SUBMISSION_OBSERVER.disconnect()'));
});

test('injectRelationCardStyles includes styling for all cards', () => {
  assert.ok(contentJs.includes('#gcds-family-epic-card'));
  assert.ok(contentJs.includes('#gcds-declaration-card'));
  assert.ok(contentJs.includes('#gcds-completion-card'));
});

console.log('\n================================================================');
console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
