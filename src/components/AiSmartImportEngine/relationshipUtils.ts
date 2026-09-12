import { Conflict, NormalizedData } from './types';

/**
 * Resolves relationship conflict in the auto-fill payload based on operator selection.
 *
 * Rules:
 * 1. If an operator selected Father (targetField: 'father_name'):
 *    - father_name is included with the candidate value.
 *    - spouse_name is omitted (deleted) from the outgoing payload.
 * 2. If an operator selected Spouse (targetField: 'spouse_name'):
 *    - spouse_name is included with the candidate value.
 *    - father_name is omitted (deleted) from the outgoing payload.
 * 3. Never send empty/null clearing values for the unselected relation (omission preserves existing form data).
 * 4. Never pass the virtual 'relationship_interpretation' field into canonical form data.
 * 5. If ambiguity is unresolved, omit BOTH ambiguous values from the payload.
 * 6. For ordinary non-conflicting imports, preserve both father_name and spouse_name intact.
 * 7. Do NOT mutate incoming resolvedData, conflicts, or sourceData objects.
 */
export function resolveRelationshipConflictPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolvedData: Record<string, any>,
  conflicts?: Conflict[],
  sourceData?: NormalizedData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = { ...resolvedData };

  // Virtual review field must never reach the customer form payload
  delete payload.relationship_interpretation;

  const relConflict = conflicts?.find(
    c => (c.field as string) === 'relationship_interpretation'
  );

  // If no relationship conflict exists, return ordinary non-conflicting payload unchanged
  if (!relConflict) {
    return payload;
  }

  const selectedValue = resolvedData['relationship_interpretation'];
  const selectedOpt = relConflict.options?.find(opt => opt.value === selectedValue);

  if (!selectedOpt) {
    // Unresolved ambiguity: omit both ambiguous values from outgoing payload
    delete payload.father_name;
    delete payload.spouse_name;
    return payload;
  }

  const targetField = selectedOpt.targetField;
  const candidateName = selectedOpt.candidateValue ?? 
    (targetField === 'father_name' ? sourceData?.father_name?.value : sourceData?.spouse_name?.value) ??
    (targetField === 'father_name' ? payload.father_name : payload.spouse_name);

  if (targetField === 'father_name') {
    payload.father_name = candidateName;
    delete payload.spouse_name;
  } else if (targetField === 'spouse_name') {
    payload.spouse_name = candidateName;
    delete payload.father_name;
  } else {
    // Unrecognized target field fallback: omit both
    delete payload.father_name;
    delete payload.spouse_name;
  }

  return payload;
}

/**
 * Pure transition function for ReviewPanel conflict resolution.
 * Updates the state with the newly resolved field value, and if the field is
 * 'relationship_interpretation', synchronizes father_name / spouse_name preview state.
 *
 * Preserves:
 * - Immutable previous state (creates and returns a new object).
 * - Retains the relationship_interpretation key for review radio binding until confirmation.
 * - Symmetrically switches between Father and Spouse.
 */
export function resolveConflictTransition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevState: Record<string, any>,
  field: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any,
  conflicts?: Conflict[],
  sourceData?: NormalizedData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const next: Record<string, any> = {
    ...prevState,
    [field]: value
  };

  if (field === 'relationship_interpretation') {
    const relConflict = conflicts?.find(c => (c.field as string) === 'relationship_interpretation');
    const opt = relConflict?.options?.find(o => o.value === value);
    if (opt?.targetField === 'father_name') {
      next.father_name = opt.candidateValue ?? sourceData?.father_name?.value;
      delete next.spouse_name;
    } else if (opt?.targetField === 'spouse_name') {
      next.spouse_name = opt.candidateValue ?? sourceData?.spouse_name?.value;
      delete next.father_name;
    }
  }

  return next;
}

