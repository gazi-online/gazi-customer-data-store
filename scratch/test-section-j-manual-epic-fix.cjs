const assert = require('assert');
const fs = require('fs');

console.log('================================================================');
console.log('🧪 TEST: SECTION J MANUAL EPIC PERSISTENCE & ERROR RECOVERY');
console.log('================================================================\n');

const contentJs = fs.readFileSync('extension/content.js', 'utf8');

// 1. Verify safe portalValues handling in selectSectionJDropdown
assert.ok(
  contentJs.includes('const portalValues = Array.isArray(rec.portalValues) ? rec.portalValues : [rec.labelEn, relCode].filter(Boolean);'),
  'selectSectionJDropdown must safely check Array.isArray for portalValues'
);
console.log('  ✅ [PASS] portalValues iterable safety check');

// 2. Verify no document-wide cross bleed for Section C regional name in Section J
assert.ok(
  !contentJs.includes("const regNameInp = boxJ.querySelector('input#regRelatName, input[name=\"regRelatName\"]') ||\n      findElement(SELECTOR_MAP.familyMemberRegionalName);"),
  'Section J must not fallback to findElement for Section C regional name'
);
console.log('  ✅ [PASS] No cross-bleed from Section J to Section C regional inputs');

// 3. Verify manual EPIC updates familyRecords[selectedCode].epic
assert.ok(
  contentJs.includes('familyRecords[selectedCode].epic = cleanEpic;'),
  'btnFill click listener must update familyRecords[selectedCode].epic with cleanEpic'
);
console.log('  ✅ [PASS] Manual EPIC updates familyRecords[selectedCode].epic');

// 4. Verify try-catch error recovery on btnFill, btnProceed, and btnSkip
assert.ok(
  contentJs.includes("btnFill.disabled = false") && contentJs.includes("btnFill.innerHTML = '✅ Fill &amp; Proceed'"),
  'btnFill must have error recovery resetting disabled state'
);
assert.ok(
  contentJs.includes("btnProceed.disabled = false") && contentJs.includes("btnProceed.innerHTML = '➡️ Proceed to Section K'"),
  'btnProceed must have error recovery resetting disabled state'
);
assert.ok(
  contentJs.includes("btnSkip.disabled = false") && contentJs.includes("btnSkip.innerHTML = '⏭️ Skip Section J'"),
  'btnSkip must have error recovery resetting disabled state'
);
console.log('  ✅ [PASS] All Section J action buttons have try-catch error recovery');

console.log('\n================================================================');
console.log('ALL SECTION J MANUAL EPIC & ERROR RECOVERY TESTS PASSED!');
console.log('================================================================');
