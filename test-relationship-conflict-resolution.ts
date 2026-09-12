import { MergeEngine } from './src/components/AiSmartImportEngine/MergeEngine';
import { resolveRelationshipConflictPayload, resolveConflictTransition } from './src/components/AiSmartImportEngine/relationshipUtils';
import { ImportJob, NormalizedData, Conflict } from './src/components/AiSmartImportEngine/types';

console.log("==========================================================================");
console.log("🧪 RELATIONSHIP CONFLICT RESOLUTION REGRESSION TEST SUITE");
console.log("==========================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.log(`❌ [FAIL] ${testName}`, detail !== undefined ? `| Detail:` : '', detail ?? '');
    failed++;
  }
}

// -----------------------------------------------------------------------------
// GROUP 1: Conflict Detection & Structured Candidate Metadata
// -----------------------------------------------------------------------------

const ambiguousJob: ImportJob = {
  id: 'job-1',
  documentType: 'Aadhaar Card',
  provider: 'ocr-space',
  source: 'file',
  status: 'completed',
  version: 1,
  normalizedData: {
    full_name: { value: 'Sunita Sharma', confidence: 0.95 },
    father_name: { value: 'Ram Sharma', confidence: 0.9, source_document: 'Aadhaar Card', source_side: 'back' },
    spouse_name: { value: 'Ram Sharma', confidence: 0.9, source_document: 'Aadhaar Card', source_side: 'back' },
    address: { value: '123 Main Road, Kolkata', confidence: 0.9 }
  }
};

const mergeResult = MergeEngine.merge([ambiguousJob]);
const relConflict = mergeResult.conflicts.find(c => (c.field as string) === 'relationship_interpretation');

assert(
  relConflict !== undefined,
  "1. MergeEngine creates relationship_interpretation conflict when father and spouse names match",
  relConflict
);

assert(
  relConflict?.options?.[0]?.targetField === 'father_name' &&
  relConflict?.options?.[1]?.targetField === 'spouse_name',
  "2. Conflict options carry typed canonical targetField ('father_name' and 'spouse_name')",
  relConflict?.options
);

assert(
  relConflict?.options?.[0]?.candidateValue === 'Ram Sharma' &&
  relConflict?.options?.[1]?.candidateValue === 'Ram Sharma',
  "3. Conflict options carry structured candidateValue without string-parsing",
  relConflict?.options
);

// -----------------------------------------------------------------------------
// GROUP 2: Father Selection & Payload Construction
// -----------------------------------------------------------------------------

const resolvedFatherState: Record<string, any> = {
  full_name: 'Sunita Sharma',
  address: '123 Main Road, Kolkata',
  relationship_interpretation: 'Father: Ram Sharma',
  father_name: 'Ram Sharma'
};

const payloadFather = resolveRelationshipConflictPayload(
  resolvedFatherState,
  mergeResult.conflicts,
  mergeResult.data
);

assert(
  payloadFather.father_name === 'Ram Sharma',
  "4. Father selection produces the selected father value in canonical payload",
  payloadFather
);

assert(
  payloadFather.spouse_name === undefined && !('spouse_name' in payloadFather),
  "5. Father selection strictly excludes/omits ambiguous spouse value from outgoing payload",
  payloadFather
);

assert(
  payloadFather.relationship_interpretation === undefined && !('relationship_interpretation' in payloadFather),
  "6. Virtual relationship_interpretation never reaches the canonical auto-fill payload",
  payloadFather
);

// -----------------------------------------------------------------------------
// GROUP 3: Spouse Selection & Symmetric Payload Construction
// -----------------------------------------------------------------------------

const resolvedSpouseState: Record<string, any> = {
  full_name: 'Sunita Sharma',
  address: '123 Main Road, Kolkata',
  relationship_interpretation: 'Spouse: Ram Sharma',
  spouse_name: 'Ram Sharma'
};

const payloadSpouse = resolveRelationshipConflictPayload(
  resolvedSpouseState,
  mergeResult.conflicts,
  mergeResult.data
);

assert(
  payloadSpouse.spouse_name === 'Ram Sharma',
  "7. Spouse selection produces the selected spouse value in canonical payload",
  payloadSpouse
);

assert(
  payloadSpouse.father_name === undefined && !('father_name' in payloadSpouse),
  "8. Spouse selection strictly excludes/omits ambiguous father value from outgoing payload",
  payloadSpouse
);

assert(
  payloadSpouse.relationship_interpretation === undefined && !('relationship_interpretation' in payloadSpouse),
  "9. Spouse selection never passes virtual relationship_interpretation to outgoing payload",
  payloadSpouse
);

// -----------------------------------------------------------------------------
// GROUP 4: Preservation of Existing CustomerForm Manual Values
// -----------------------------------------------------------------------------

// Simulate CustomerForm.handleAutoFill mapping behavior
function simulateFormAutoFill(currentFormValues: Record<string, any>, importPayload: Record<string, any>) {
  const nextFormValues = { ...currentFormValues };
  Object.keys(importPayload).forEach(field => {
    if (importPayload[field] !== undefined && importPayload[field] !== null && importPayload[field] !== "") {
      nextFormValues[field] = importPayload[field];
    }
  });
  return nextFormValues;
}

// Scenario A: Form already has a manual spouse_name ("Vijay Sharma"). Operator selects Father ("Ram Sharma").
const existingFormWithSpouse = {
  first_name: 'Sunita',
  last_name: 'Sharma',
  father_name: '',
  spouse_name: 'Vijay Sharma'
};

const formAfterFatherImport = simulateFormAutoFill(existingFormWithSpouse, payloadFather);
assert(
  formAfterFatherImport.father_name === 'Ram Sharma' &&
  formAfterFatherImport.spouse_name === 'Vijay Sharma',
  "10. Omission of unselected spouse_name preserves existing manual spouse in CustomerForm",
  formAfterFatherImport
);

// Scenario B: Form already has a manual father_name ("Devendra Sharma"). Operator selects Spouse ("Ram Sharma").
const existingFormWithFather = {
  first_name: 'Sunita',
  last_name: 'Sharma',
  father_name: 'Devendra Sharma',
  spouse_name: ''
};

const formAfterSpouseImport = simulateFormAutoFill(existingFormWithFather, payloadSpouse);
assert(
  formAfterSpouseImport.spouse_name === 'Ram Sharma' &&
  formAfterSpouseImport.father_name === 'Devendra Sharma',
  "11. Omission of unselected father_name preserves existing manual father in CustomerForm",
  formAfterSpouseImport
);

// -----------------------------------------------------------------------------
// GROUP 5: Ordinary Non-Conflicting Import Preservation
// -----------------------------------------------------------------------------

const nonConflictingJob: ImportJob = {
  id: 'job-2',
  documentType: 'Application Form',
  provider: 'ocr-space',
  source: 'file',
  status: 'completed',
  version: 1,
  normalizedData: {
    full_name: { value: 'Ananya Roy', confidence: 0.95 },
    father_name: { value: 'Bimal Roy', confidence: 0.9 },
    spouse_name: { value: 'Debashis Roy', confidence: 0.9 }
  }
};

const nonConflictingMerge = MergeEngine.merge([nonConflictingJob]);
const nonConflictingPayload = resolveRelationshipConflictPayload(
  {
    full_name: 'Ananya Roy',
    father_name: 'Bimal Roy',
    spouse_name: 'Debashis Roy'
  },
  nonConflictingMerge.conflicts,
  nonConflictingMerge.data
);

assert(
  nonConflictingPayload.father_name === 'Bimal Roy' &&
  nonConflictingPayload.spouse_name === 'Debashis Roy',
  "12. Ordinary non-conflicting imports preserve BOTH father_name and spouse_name intact",
  nonConflictingPayload
);

// -----------------------------------------------------------------------------
// GROUP 6: Unresolved Ambiguity Defense
// -----------------------------------------------------------------------------

const unresolvedState: Record<string, any> = {
  full_name: 'Sunita Sharma',
  father_name: 'Ram Sharma',
  spouse_name: 'Ram Sharma'
  // relationship_interpretation is undefined / not selected
};

const unresolvedPayload = resolveRelationshipConflictPayload(
  unresolvedState,
  mergeResult.conflicts,
  mergeResult.data
);

assert(
  unresolvedPayload.father_name === undefined &&
  unresolvedPayload.spouse_name === undefined &&
  unresolvedPayload.relationship_interpretation === undefined,
  "13. Unresolved ambiguity defensively omits BOTH ambiguous values from the payload",
  unresolvedPayload
);

// -----------------------------------------------------------------------------
// GROUP 7: Immutability & Unrelated Fields Preservation
// -----------------------------------------------------------------------------

const originalResolvedCopy = JSON.stringify(resolvedFatherState);
const originalConflictsCopy = JSON.stringify(mergeResult.conflicts);
const originalDataCopy = JSON.stringify(mergeResult.data);

resolveRelationshipConflictPayload(resolvedFatherState, mergeResult.conflicts, mergeResult.data);

assert(
  JSON.stringify(resolvedFatherState) === originalResolvedCopy &&
  JSON.stringify(mergeResult.conflicts) === originalConflictsCopy &&
  JSON.stringify(mergeResult.data) === originalDataCopy,
  "14. resolveRelationshipConflictPayload does not mutate input resolvedData, conflicts, or data objects"
);

assert(
  payloadFather.full_name === 'Sunita Sharma' &&
  payloadFather.address === '123 Main Road, Kolkata',
  "15. Unrelated fields (full_name, address) pass through to canonical payload completely intact"
);

// -----------------------------------------------------------------------------
// GROUP 8: Candidate Names Containing Punctuation, Colons, or Special Characters
// -----------------------------------------------------------------------------

const complexNameJob: ImportJob = {
  id: 'job-3',
  documentType: 'Passport',
  provider: 'ocr-space',
  source: 'file',
  status: 'completed',
  version: 1,
  normalizedData: {
    full_name: { value: 'Priyanka Sen', confidence: 0.95 },
    father_name: { value: 'Dr. S. K. Sen: Senior (Retd.)', confidence: 0.9 },
    spouse_name: { value: 'Dr. S. K. Sen: Senior (Retd.)', confidence: 0.9 }
  }
};

const complexMerge = MergeEngine.merge([complexNameJob]);
const complexConflict = complexMerge.conflicts.find(c => (c.field as string) === 'relationship_interpretation');

assert(
  complexConflict?.options?.[0]?.candidateValue === 'Dr. S. K. Sen: Senior (Retd.)' &&
  complexConflict?.options?.[1]?.candidateValue === 'Dr. S. K. Sen: Senior (Retd.)',
  "16. Colons and punctuation in names are preserved cleanly in candidateValue without corrupting parsing",
  complexConflict?.options
);

const complexFatherSelected = resolveRelationshipConflictPayload(
  {
    relationship_interpretation: complexConflict?.options?.[0]?.value,
    father_name: 'Dr. S. K. Sen: Senior (Retd.)'
  },
  complexMerge.conflicts,
  complexMerge.data
);

assert(
  complexFatherSelected.father_name === 'Dr. S. K. Sen: Senior (Retd.)' &&
  complexFatherSelected.spouse_name === undefined,
  "17. Punctuation/colons in name do not break canonical target mapping or value extraction",
  complexFatherSelected
);

// -----------------------------------------------------------------------------
// GROUP 9: Production ReviewPanel State Transition & Selection Switching
// (Calls the exact production resolveConflictTransition function exported by relationshipUtils.ts)
// -----------------------------------------------------------------------------

// Initial state of ReviewPanel when hasRelConflict is true
const initialReviewState: Record<string, any> = {
  full_name: 'Sunita Sharma',
  address: '123 Main Road, Kolkata',
  father_name: undefined,
  spouse_name: undefined,
  relationship_interpretation: undefined
};

// Step 1: Select Father using production resolveConflictTransition
const stateAfterFatherSelect = resolveConflictTransition(
  initialReviewState,
  'relationship_interpretation',
  relConflict?.options?.[0]?.value, // 'Father: Ram Sharma'
  mergeResult.conflicts,
  mergeResult.data
);

assert(
  stateAfterFatherSelect.relationship_interpretation === relConflict?.options?.[0]?.value &&
  stateAfterFatherSelect.father_name === 'Ram Sharma' &&
  stateAfterFatherSelect.spouse_name === undefined,
  "18. Production resolveConflictTransition: Selecting Father retains selection and sets preview father_name"
);

// Step 2: Switch selection from Father to Spouse using production resolveConflictTransition
const stateAfterSwitchToSpouse = resolveConflictTransition(
  stateAfterFatherSelect,
  'relationship_interpretation',
  relConflict?.options?.[1]?.value, // 'Spouse: Ram Sharma'
  mergeResult.conflicts,
  mergeResult.data
);

assert(
  stateAfterSwitchToSpouse.relationship_interpretation === relConflict?.options?.[1]?.value &&
  stateAfterSwitchToSpouse.spouse_name === 'Ram Sharma' &&
  stateAfterSwitchToSpouse.father_name === undefined,
  "19. Production resolveConflictTransition: Switching Father -> Spouse clears father_name and sets spouse_name"
);

// Step 3: Switch back from Spouse to Father using production resolveConflictTransition
const stateAfterSwitchBackToFather = resolveConflictTransition(
  stateAfterSwitchToSpouse,
  'relationship_interpretation',
  relConflict?.options?.[0]?.value, // 'Father: Ram Sharma'
  mergeResult.conflicts,
  mergeResult.data
);

assert(
  stateAfterSwitchBackToFather.relationship_interpretation === relConflict?.options?.[0]?.value &&
  stateAfterSwitchBackToFather.father_name === 'Ram Sharma' &&
  stateAfterSwitchBackToFather.spouse_name === undefined,
  "20. Production resolveConflictTransition: Switching Spouse -> Father clears spouse_name and sets father_name"
);

// Step 4: Confirming from switched state produces canonical payload with only final choice
const finalPayloadFromSwitchedState = resolveRelationshipConflictPayload(
  stateAfterSwitchBackToFather,
  mergeResult.conflicts,
  mergeResult.data
);

assert(
  finalPayloadFromSwitchedState.father_name === 'Ram Sharma' &&
  finalPayloadFromSwitchedState.spouse_name === undefined &&
  finalPayloadFromSwitchedState.relationship_interpretation === undefined,
  "21. Confirmation after switching produces canonical payload with only the final selection and no virtual fields"
);

console.log("\n==========================================================================");
console.log(`📊 FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("==========================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL RELATIONSHIP CONFLICT RESOLUTION ASSERTIONS PASSED PERFECTLY!");
}
