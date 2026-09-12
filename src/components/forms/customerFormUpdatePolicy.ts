export type FieldOrigin = 'initial' | 'user' | 'import' | 'lookup';
export type FieldOrigins = Record<string, FieldOrigin>;

export const VALID_FORM_FIELDS = new Set<string>([
  'customer_code',
  'first_name',
  'middle_name',
  'last_name',
  'original_language_name',
  'phone',
  'whatsapp',
  'email',
  'date_of_birth',
  'gender',
  'father_name',
  'mother_name',
  'marital_status',
  'spouse_name',
  'aadhaar_number',
  'pan_number',
  'gst_number',
  'voter_id_number',
  'address',
  'city',
  'district',
  'state',
  'pincode',
  'post_office',
  'country',
  'photo_url',
  'photo_source',
  'status',
]);

export const ADDRESS_FIELDS = [
  'pincode',
  'address',
  'state',
  'district',
  'city',
  'post_office',
  'country',
] as const;

export type AddressFieldName = (typeof ADDRESS_FIELDS)[number];

export function isAddressField(field: string): field is AddressFieldName {
  return (ADDRESS_FIELDS as readonly string[]).includes(field);
}

/**
 * Initialize field origins once from actual mapped form defaults and valid form fields.
 */
export function initializeFieldOrigins(
  defaultValues: Record<string, unknown>,
  isEditing: boolean
): FieldOrigins {
  const origins: FieldOrigins = {};
  for (const [key, val] of Object.entries(defaultValues)) {
    if (!VALID_FORM_FIELDS.has(key)) continue;
    if (isEditing && val !== undefined && val !== null && val !== '') {
      origins[key] = 'initial';
    }
  }
  return origins;
}

/**
 * Predicate determining whether an incoming reviewed import value can overwrite a field.
 */
export function canImportOverwriteField(
  field: string,
  incomingVal: unknown,
  currentVal: unknown,
  origin: FieldOrigin | undefined
): boolean {
  // Empty incoming values never erase existing data
  if (incomingVal === undefined || incomingVal === null || incomingVal === '') {
    return false;
  }

  // Domain protection: photo_source
  if (field === 'photo_source' && currentVal && String(currentVal).trim().length > 0) {
    return false;
  }

  // Domain protection: original_language_name
  if (
    field === 'original_language_name' &&
    currentVal &&
    String(currentVal).trim().length > 0
  ) {
    return false;
  }

  // IMPORTANT PHONE CORRECTION: Any existing non-empty phone remains protected regardless of origin.
  if (field === 'phone' && currentVal && String(currentVal).trim().length > 0) {
    return false;
  }

  // Manual values and deliberate clears ("") are strictly protected
  if (origin === 'user') {
    return false;
  }

  // Populated initial customer values are strictly protected in edit mode
  if (origin === 'initial') {
    return false;
  }

  // Eligible overwrites: 'import', 'lookup', or undefined (untouched default)
  return true;
}

/**
 * Predicate determining whether an asynchronous PIN lookup result can overwrite a field.
 */
export function canLookupOverwriteField(
  field: 'state' | 'district' | 'country' | 'post_office',
  incomingVal: unknown,
  origin: FieldOrigin | undefined,
  isManualAddressEdit: boolean
): boolean {
  if (incomingVal === undefined || incomingVal === null || String(incomingVal).trim() === '') {
    return false;
  }

  if (isManualAddressEdit) {
    return false;
  }

  // Protected: manual user input or deliberate clear
  if (origin === 'user') {
    return false;
  }

  // Protected: loaded initial customer values
  if (origin === 'initial') {
    return false;
  }

  // Protected: reviewed import values remain protected against subsequent PIN lookup
  if (origin === 'import') {
    return false;
  }

  // Only eligible if previous lookup or untouched default
  return origin === 'lookup' || origin === undefined;
}

export interface AddressBatchResult {
  acceptedAddressFields: Record<string, unknown>;
  skippedReason: string | null;
}

/**
 * Resolves address fields as a cohesive cluster during reviewed import with comprehensive preflight conflict detection.
 */
export function resolveAddressBatchImport(
  currentValues: Record<string, unknown>,
  incomingData: Record<string, unknown>,
  fieldOrigins: FieldOrigins
): AddressBatchResult {
  const currentPin = String(currentValues.pincode || '').replace(/\D/g, '').trim();
  const incomingPin = incomingData.pincode !== undefined && incomingData.pincode !== null
    ? String(incomingData.pincode).replace(/\D/g, '').trim()
    : '';

  const isCurrentPinProtected =
    fieldOrigins.pincode === 'user' || fieldOrigins.pincode === 'initial';
  const isCurrentPinDeliberatelyCleared =
    fieldOrigins.pincode === 'user' && currentPin === '';

  // Identify protected address fields and populated protected details (ignoring default "India" country)
  const protectedAddressFields: string[] = [];
  for (const f of ADDRESS_FIELDS) {
    if (f === 'country') {
      const val = String(currentValues.country || '').trim().toLowerCase();
      if ((fieldOrigins.country === 'user' || fieldOrigins.country === 'initial') && val && val !== 'india') {
        protectedAddressFields.push(f);
      }
      continue;
    }
    if (fieldOrigins[f] === 'user' || fieldOrigins[f] === 'initial') {
      const val = currentValues[f];
      if (val !== undefined && val !== null && String(val).trim().length > 0) {
        protectedAddressFields.push(f);
      }
    }
  }

  // --- PREFLIGHT CONFLICT DETECTION ---

  // 1. PIN conflict:
  if (isCurrentPinProtected && incomingPin.length > 0) {
    if (isCurrentPinDeliberatelyCleared) {
      return {
        acceptedAddressFields: {},
        skippedReason: 'Imported address skipped: PIN was deliberately cleared by user.',
      };
    }
    if (currentPin.length > 0 && currentPin !== incomingPin) {
      return {
        acceptedAddressFields: {},
        skippedReason: `Imported address for PIN ${incomingPin} skipped: current PIN ${currentPin} is protected.`,
      };
    }
  }

  // 2. Concrete field-level conflicts across all address fields:
  // pincode, address, state, district, city, post_office, country
  for (const f of ADDRESS_FIELDS) {
    const incRaw = incomingData[f];
    if (incRaw === undefined || incRaw === null) continue;
    const incStr = String(incRaw).trim();
    if (incStr.length === 0) continue; // Empty incoming values are not conflicts

    const isFieldProtected = fieldOrigins[f] === 'user' || fieldOrigins[f] === 'initial';
    if (!isFieldProtected) continue;

    const curRaw = currentValues[f];
    const curStr = String(curRaw ?? '').trim();
    if (curStr.length === 0) continue;

    if (f === 'country' && curStr.toLowerCase() === 'india' && fieldOrigins.country !== 'user') {
      continue; // Default country alone is not evidence of a conflict
    }

    if (f === 'pincode') {
      const cleanIncPin = incStr.replace(/\D/g, '');
      const cleanCurPin = curStr.replace(/\D/g, '');
      if (cleanIncPin.length > 0 && cleanCurPin.length > 0 && cleanIncPin !== cleanCurPin) {
        return {
          acceptedAddressFields: {},
          skippedReason: `Imported address skipped: PIN ${cleanIncPin} conflicts with protected PIN ${cleanCurPin}.`,
        };
      }
    } else {
      if (curStr.toLowerCase() !== incStr.toLowerCase()) {
        return {
          acceptedAddressFields: {},
          skippedReason: `Imported address skipped: incoming ${f} (${incStr}) conflicts with protected ${f} (${curStr}).`,
        };
      }
    }
  }

  // 3. New PIN offered while retaining incompatible protected address details:
  if (
    incomingPin.length > 0 &&
    currentPin !== incomingPin &&
    protectedAddressFields.length > 0
  ) {
    return {
      acceptedAddressFields: {},
      skippedReason: 'Imported address skipped to preserve manually entered address details.',
    };
  }

  // --- RESOLUTION ---

  // Case A: Missing incoming PIN (incomingPin === '')
  if (!incomingPin) {
    const accepted: Record<string, unknown> = {};
    for (const f of ADDRESS_FIELDS) {
      if (f === 'pincode') continue; // Preserve current PIN
      const incRaw = incomingData[f];
      if (incRaw === undefined || incRaw === null) continue;
      const incStr = String(incRaw).trim();
      if (incStr.length === 0) continue;

      const curRaw = currentValues[f];
      const curStr = String(curRaw ?? '').trim();
      const isPopulated = curStr.length > 0 && !(f === 'country' && curStr.toLowerCase() === 'india');

      // Check if equal/equivalent value to an existing populated field
      const isEqualValue = isPopulated && curStr.toLowerCase() === incStr.toLowerCase();

      if (isEqualValue) {
        // Permit eligible equal reviewed address value to be accepted for ownership promotion
        // while preserving its displayed value.
        if (canImportOverwriteField(f, incRaw, curRaw, fieldOrigins[f])) {
          accepted[f] = curRaw; // preserve displayed value
        }
        continue;
      }

      // Preserve existing populated address values when compatibility is unresolved
      if (isPopulated) continue;

      // Allow filling unprotected blank address fields
      if (canImportOverwriteField(f, incRaw, curRaw, fieldOrigins[f])) {
        accepted[f] = incRaw;
      }
    }

    return {
      acceptedAddressFields: accepted,
      skippedReason: null,
    };
  }

  // Case B: Incoming PIN is provided and no conflict detected
  const accepted: Record<string, unknown> = {};
  for (const f of ADDRESS_FIELDS) {
    const incRaw = incomingData[f];
    if (incRaw === undefined || incRaw === null) continue;
    const incStr = String(incRaw).trim();
    if (incStr.length === 0) continue;

    const curRaw = currentValues[f];
    if (canImportOverwriteField(f, incRaw, curRaw, fieldOrigins[f])) {
      accepted[f] = incRaw;
    }
  }

  return {
    acceptedAddressFields: accepted,
    skippedReason: null,
  };
}

export interface AutoFillResolutionResult {
  fieldsToUpdate: Record<string, unknown>;
  fieldOriginsToUpdate: Record<string, FieldOrigin>;
  skippedNotice: string | null;
  resolvedPrimaryPhone: string;
  shouldLinkWhatsapp: boolean;
}

/**
 * Resolves entire reviewed import payload respecting field ownership and address cluster rules.
 */
export function resolveAutoFillPayload(
  currentValues: Record<string, unknown>,
  incomingData: Record<string, unknown>,
  fieldOrigins: FieldOrigins
): AutoFillResolutionResult {
  const fieldsToUpdate: Record<string, unknown> = {};
  const fieldOriginsToUpdate: Record<string, FieldOrigin> = {};

  // 1. Resolve Address cluster atomically
  const { acceptedAddressFields, skippedReason } = resolveAddressBatchImport(
    currentValues,
    incomingData,
    fieldOrigins
  );

  for (const [key, val] of Object.entries(acceptedAddressFields)) {
    fieldsToUpdate[key] = val;
    // An accepted reviewed import promotes eligible lookup-owned or unowned fields
    // to import ownership even when the value is identical.
    fieldOriginsToUpdate[key] = 'import';
  }

  // 2. Resolve non-address fields (including explicit incoming WhatsApp)
  let phoneWasAccepted = false;
  for (const [field, incomingVal] of Object.entries(incomingData)) {
    if (isAddressField(field)) continue; // already handled by address cluster
    if (!VALID_FORM_FIELDS.has(field)) continue;

    const currentVal = currentValues[field];
    if (canImportOverwriteField(field, incomingVal, currentVal, fieldOrigins[field])) {
      fieldsToUpdate[field] = incomingVal;
      // An accepted reviewed import promotes eligible lookup-owned or unowned fields
      // to import ownership even when the value is identical.
      fieldOriginsToUpdate[field] = 'import';

      if (field === 'phone') {
        phoneWasAccepted = true;
      }
    }
  }

  // 3. WhatsApp derivation logic:
  // Resolve explicit incoming WhatsApp before deciding whether phone-based derivation is needed.
  // Never replace an accepted explicit WhatsApp value merely because the pre-import form value was empty.
  const postResolutionWhatsapp = fieldsToUpdate.whatsapp !== undefined
    ? String(fieldsToUpdate.whatsapp).trim()
    : (currentValues.whatsapp ? String(currentValues.whatsapp).trim() : '');

  const isWhatsappEmpty = postResolutionWhatsapp.length === 0;

  // Determine final active primary phone:
  // ANY existing non-empty phone is protected regardless of origin.
  // A rejected incoming phone MUST NOT influence finalPrimaryPhone.
  const currentPhone = currentValues.phone ? String(currentValues.phone).trim() : '';
  let finalPrimaryPhone = '';

  if (currentPhone.length > 0) {
    finalPrimaryPhone = currentPhone;
  } else if (phoneWasAccepted && fieldsToUpdate.phone) {
    finalPrimaryPhone = String(fieldsToUpdate.phone).trim();
  }

  // Derive WhatsApp ONLY when post-resolution WhatsApp remains empty,
  // final primary phone exists, and WhatsApp ownership permits the write (e.g. not user-cleared).
  let shouldLinkWhatsapp = false;
  if (isWhatsappEmpty && finalPrimaryPhone.length > 0) {
    const canDeriveWhatsapp = canImportOverwriteField(
      'whatsapp',
      finalPrimaryPhone,
      currentValues.whatsapp,
      fieldOrigins.whatsapp
    );
    if (canDeriveWhatsapp) {
      fieldsToUpdate.whatsapp = finalPrimaryPhone;
      fieldOriginsToUpdate.whatsapp = 'import';
      shouldLinkWhatsapp = true;
    }
  }

  return {
    fieldsToUpdate,
    fieldOriginsToUpdate,
    skippedNotice: skippedReason,
    resolvedPrimaryPhone: finalPrimaryPhone,
    shouldLinkWhatsapp,
  };
}

/**
 * Freshness guard for asynchronous responses.
 */
export function checkLookupFreshness(
  livePin: string | undefined,
  reqPin: string,
  currentReqId: number,
  activeReqId: number
): boolean {
  if (currentReqId !== activeReqId) return false;
  const cleanLivePin = (livePin || '').replace(/\D/g, '').trim();
  return cleanLivePin === reqPin;
}
