export interface CompletenessEvaluation {
  completeness: number; // 0.0 to 1.0
  requiresAiEnhancement: boolean;
  isSideComplete: boolean;
  isCustomerComplete: boolean;
  missingRequiredFields: string[];
  invalidRequiredFields: string[];
  missingImportantFields: string[]; // backward-compatible union of missingRequiredFields and invalidRequiredFields
  confidenceSummary: {
    overall: number;
    low_confidence_fields: string[];
  };
}

export interface EvaluationOptions {
  scope?: 'side' | 'customer';
}

export class ExtractionCompletenessEvaluator {
  private static readonly AADHAAR_REGEX = /^\d{12}$/;
  private static readonly PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  private static readonly EPIC_REGEX = /^([A-Z]{3}[0-9]{7}|[A-Z]{2,3}\/\d{2,3}\/\d{3,4}\/\d{5,7}|[A-Z]{2,3}[0-9]{7,8})$/;
  private static readonly PINCODE_REGEX = /^[1-9][0-9]{5}$/;
  private static readonly MIN_COMPLETENESS_THRESHOLD = 0.75;

  /**
   * Evaluates the completeness and confidence of extracted canonical GCDS data.
   * Distinguishes side-level extraction completeness vs final merged customer completeness.
   * Document-type-aware: enforces strict ID and core field requirements per document type.
   * Optional fields (email, occupation, education, income, remarks) never penalize completeness.
   */
  public static evaluate(
    canonicalData: Record<string, unknown>,
    options?: EvaluationOptions
  ): CompletenessEvaluation {
    if (!canonicalData || typeof canonicalData !== 'object') {
      return {
        completeness: 0,
        requiresAiEnhancement: true,
        isSideComplete: false,
        isCustomerComplete: false,
        missingRequiredFields: ['full_name', 'id_number'],
        invalidRequiredFields: [],
        missingImportantFields: ['full_name', 'id_number'],
        confidenceSummary: { overall: 0, low_confidence_fields: ['all'] }
      };
    }

    const customer = (canonicalData.customer as Record<string, unknown>) || {};
    const address = (canonicalData.address as Record<string, unknown>) || {};
    const documents = (canonicalData.documents as Record<string, Record<string, unknown>>) || {};
    const detectedDocs = (canonicalData.detected_documents || []) as Array<{ detected_type?: string; confidence?: number }>;

    // Identify all detected document types
    const detectedTypes = detectedDocs.map(d => (d.detected_type || '').toLowerCase());
    const primaryType = detectedTypes[0] || 'unknown';

    const hasAadhaarFront = detectedTypes.some(t => t.includes('aadhaar_front') || (t.includes('aadhaar') && t.includes('front')));
    const hasAadhaarBack = detectedTypes.some(t => t.includes('aadhaar_back') || (t.includes('aadhaar') && t.includes('back')));
    const isAadhaarCombined = detectedTypes.some(t => t.includes('combined')) || (hasAadhaarFront && hasAadhaarBack);

    // Determine document category
    let category: 'aadhaar_front' | 'aadhaar_back' | 'aadhaar_combined' | 'pan' | 'voter_id' | 'generic' = 'generic';

    if (isAadhaarCombined || (primaryType.includes('aadhaar') && primaryType.includes('combined'))) {
      category = 'aadhaar_combined';
    } else if (hasAadhaarFront || primaryType.includes('aadhaar_front')) {
      category = 'aadhaar_front';
    } else if (hasAadhaarBack || primaryType.includes('aadhaar_back')) {
      category = 'aadhaar_back';
    } else if (primaryType.includes('aadhaar') || Boolean(documents.aadhaar?.number)) {
      const hasAddr = Boolean(
        address.full_address || (address.pincode && (address.state || address.district))
      );
      category = hasAddr ? 'aadhaar_combined' : 'aadhaar_front';
    } else if (primaryType.includes('pan') || Boolean(documents.pan?.number)) {
      category = 'pan';
    } else if (primaryType.includes('voter') || primaryType.includes('epic') || Boolean(documents.voter_id?.number)) {
      category = 'voter_id';
    } else {
      category = 'generic';
    }

    const missingRequiredFields: string[] = [];
    const invalidRequiredFields: string[] = [];
    const lowConfidenceFields: string[] = [];

    // Core field extractions
    const fullName = typeof customer.full_name === 'string' ? customer.full_name.trim() : '';
    const hasValidName = fullName.length >= 2;

    const dob = typeof customer.dob === 'string' ? customer.dob.trim() : '';
    const hasIsoDob = /^\d{4}-\d{2}-\d{2}$/.test(dob);
    const hasYearOnlyDob = /\b(19\d{2}|20\d{2})\b/.test(dob);
    const hasValidDobOrYob = hasIsoDob || hasYearOnlyDob;

    const gender = typeof customer.gender === 'string' ? customer.gender.trim().toLowerCase() : '';
    const hasValidGender = gender === 'male' || gender === 'female' || gender === 'other';

    const fullAddress = typeof address.full_address === 'string' ? address.full_address.trim() : '';
    const pincode = typeof address.pincode === 'string' ? address.pincode.trim() : '';
    const state = typeof address.state === 'string' ? address.state.trim() : '';
    const district = typeof address.district === 'string' ? address.district.trim() : '';
    const hasPincode = this.PINCODE_REGEX.test(pincode);
    const hasValidAddress = Boolean(fullAddress && fullAddress.length >= 10) || (hasPincode && Boolean(state || district));

    // ID Number Validations
    const rawAadhaar = documents.aadhaar?.number ? String(documents.aadhaar.number).replace(/[\s-]+/g, '') : '';
    const rawPan = documents.pan?.number ? String(documents.pan.number).toUpperCase().replace(/[\s-]+/g, '') : '';
    const rawEpic = documents.voter_id?.number ? String(documents.voter_id.number).toUpperCase().replace(/[\s-]+/g, '') : '';

    let completeness = 0;

    switch (category) {
      // -------------------------------------------------------------
      // 1. AADHAAR FRONT: requires name, aadhaar number, dob/yob, gender.
      // Address is NOT required and never penalizes front-only Aadhaar.
      // -------------------------------------------------------------
      case 'aadhaar_front': {
        let score = 0;
        const total = 100;

        if (hasValidName) {
          score += 25;
        } else {
          missingRequiredFields.push('full_name');
        }

        if (!rawAadhaar) {
          missingRequiredFields.push('aadhaar_number');
        } else if (this.AADHAAR_REGEX.test(rawAadhaar)) {
          score += 25;
        } else {
          invalidRequiredFields.push('aadhaar_number');
        }

        if (hasValidDobOrYob) {
          score += 25;
        } else {
          missingRequiredFields.push('dob');
        }

        if (hasValidGender) {
          score += 25;
        } else {
          missingRequiredFields.push('gender');
        }

        completeness = Math.round((score / total) * 100) / 100;
        break;
      }

      // -------------------------------------------------------------
      // 2. AADHAAR BACK: requires address (or pincode + state/district).
      // -------------------------------------------------------------
      case 'aadhaar_back': {
        let score = 0;
        const total = 100;

        if (hasValidAddress) {
          score += 80;
        } else {
          missingRequiredFields.push('address');
        }

        if (rawAadhaar) {
          if (this.AADHAAR_REGEX.test(rawAadhaar)) {
            score += 20;
          } else {
            invalidRequiredFields.push('aadhaar_number');
          }
        } else {
          // Aadhaar number on back is optional (often QR only)
          score += 20;
        }

        completeness = Math.round((score / total) * 100) / 100;
        break;
      }

      // -------------------------------------------------------------
      // 3. AADHAAR COMBINED / MERGED: requires name, valid number, dob/yob, gender, and address.
      // -------------------------------------------------------------
      case 'aadhaar_combined': {
        let score = 0;
        const total = 100;

        if (hasValidName) {
          score += 20;
        } else {
          missingRequiredFields.push('full_name');
        }

        if (!rawAadhaar) {
          missingRequiredFields.push('aadhaar_number');
        } else if (this.AADHAAR_REGEX.test(rawAadhaar)) {
          score += 25;
        } else {
          invalidRequiredFields.push('aadhaar_number');
        }

        if (hasValidDobOrYob) {
          score += 20;
        } else {
          missingRequiredFields.push('dob');
        }

        if (hasValidGender) {
          score += 15;
        } else {
          missingRequiredFields.push('gender');
        }

        if (hasValidAddress) {
          score += 20;
        } else {
          missingRequiredFields.push('address');
        }

        completeness = Math.round((score / total) * 100) / 100;
        break;
      }

      // -------------------------------------------------------------
      // 4. PAN CARD: requires full_name and valid PAN number.
      // Address and gender are NOT required and not on PAN cards.
      // -------------------------------------------------------------
      case 'pan': {
        let score = 0;
        const total = 100;

        if (hasValidName) {
          score += 45;
        } else {
          missingRequiredFields.push('full_name');
        }

        if (!rawPan) {
          missingRequiredFields.push('pan_number');
        } else if (this.PAN_REGEX.test(rawPan)) {
          score += 45;
        } else {
          invalidRequiredFields.push('pan_number');
        }

        // Secondary: DOB if present
        if (hasValidDobOrYob) {
          score += 10;
        }

        completeness = Math.round((score / total) * 100) / 100;
        break;
      }

      // -------------------------------------------------------------
      // 5. VOTER ID (EPIC): requires full_name and valid EPIC number.
      // -------------------------------------------------------------
      case 'voter_id': {
        let score = 0;
        const total = 100;

        if (hasValidName) {
          score += 40;
        } else {
          missingRequiredFields.push('full_name');
        }

        if (!rawEpic) {
          missingRequiredFields.push('voter_id_number');
        } else if (this.EPIC_REGEX.test(rawEpic)) {
          score += 40;
        } else {
          invalidRequiredFields.push('voter_id_number');
        }

        if (hasValidGender) {
          score += 10;
        }
        if (hasValidDobOrYob) {
          score += 10;
        }

        completeness = Math.round((score / total) * 100) / 100;
        break;
      }

      // -------------------------------------------------------------
      // 6. GENERIC / UNKNOWN: weighted model with ID validation if present.
      // -------------------------------------------------------------
      default: {
        let score = 0;
        let total = 0;

        total += 30;
        if (hasValidName) {
          score += 30;
        } else {
          missingRequiredFields.push('full_name');
        }

        total += 20;
        if (hasValidDobOrYob) {
          score += 20;
        } else {
          missingRequiredFields.push('dob');
        }

        total += 15;
        if (hasValidGender) {
          score += 15;
        }

        total += 20;
        if (hasValidAddress) {
          score += 20;
        } else {
          missingRequiredFields.push('address');
        }

        // Check if any specific ID is present and validate it
        if (rawAadhaar) {
          total += 15;
          if (this.AADHAAR_REGEX.test(rawAadhaar)) {
            score += 15;
          } else {
            invalidRequiredFields.push('aadhaar_number');
          }
        } else if (rawPan) {
          total += 15;
          if (this.PAN_REGEX.test(rawPan)) {
            score += 15;
          } else {
            invalidRequiredFields.push('pan_number');
          }
        } else if (rawEpic) {
          total += 15;
          if (this.EPIC_REGEX.test(rawEpic)) {
            score += 15;
          } else {
            invalidRequiredFields.push('voter_id_number');
          }
        }

        completeness = total > 0 ? Math.round((score / total) * 100) / 100 : 0;
        break;
      }
    }

    const isCustomerScope = options?.scope === 'customer';

    // When evaluating customer completeness (not side-level extraction):
    if (isCustomerScope) {
      if (category === 'aadhaar_back') {
        if (!hasValidName && !missingRequiredFields.includes('full_name')) {
          missingRequiredFields.push('full_name');
        }
        if (!rawAadhaar && !missingRequiredFields.includes('aadhaar_number')) {
          missingRequiredFields.push('aadhaar_number');
        }
        if (!hasValidDobOrYob && !missingRequiredFields.includes('dob')) {
          missingRequiredFields.push('dob');
        }
        if (!hasValidGender && !missingRequiredFields.includes('gender')) {
          missingRequiredFields.push('gender');
        }
        completeness = Math.round((20 / 100) * 100) / 100;
      }
    }

    const hasValidAadhaar = Boolean(rawAadhaar && this.AADHAAR_REGEX.test(rawAadhaar));
    const hasValidPan = Boolean(rawPan && this.PAN_REGEX.test(rawPan));
    const hasValidEpic = Boolean(rawEpic && this.EPIC_REGEX.test(rawEpic));
    const hasAnyValidId = hasValidAadhaar || hasValidPan || hasValidEpic;

    const isSideComplete = missingRequiredFields.length === 0 &&
                           invalidRequiredFields.length === 0 &&
                           completeness >= this.MIN_COMPLETENESS_THRESHOLD;

    // Document-type-aware customer completeness:
    // Required fields for final customer completeness derive from the document type:
    // - PAN: full_name + valid PAN number (address is NOT on PAN and never required)
    // - EPIC: full_name + valid EPIC number
    // - Aadhaar front-only: full_name + valid Aadhaar + DOB/YOB + gender (core identity complete, no AI needed for address)
    // - Aadhaar combined (front+back): full_name + valid Aadhaar + DOB/YOB + gender + address
    // - Aadhaar back-only: cannot represent a complete customer identity alone
    // - Generic: full_name + address + (valid ID or high completeness)
    let isCustomerComplete = false;

    switch (category) {
      case 'pan':
        isCustomerComplete = hasValidName && hasValidPan && invalidRequiredFields.length === 0;
        break;

      case 'voter_id':
        isCustomerComplete = hasValidName && hasValidEpic && invalidRequiredFields.length === 0;
        break;

      case 'aadhaar_front':
        isCustomerComplete = hasValidName && hasValidAadhaar && hasValidDobOrYob && hasValidGender && invalidRequiredFields.length === 0;
        break;

      case 'aadhaar_combined':
        isCustomerComplete = hasValidName && hasValidAadhaar && hasValidDobOrYob && hasValidGender && hasValidAddress && invalidRequiredFields.length === 0;
        break;

      case 'aadhaar_back':
        // Aadhaar back-only carries address/relation but lacks cardholder identity.
        // It is side-usable, but customer identity is strictly incomplete.
        isCustomerComplete = false;
        break;

      case 'generic':
      default:
        isCustomerComplete = hasValidName && hasValidAddress && (hasAnyValidId || completeness >= this.MIN_COMPLETENESS_THRESHOLD) && invalidRequiredFields.length === 0;
        break;
    }

    // A known KYC document MUST NOT be considered self-sufficient if:
    // 1. Any required field is missing (e.g. Aadhaar without aadhaar_number, PAN without pan_number)
    // 2. Any required field is invalid (e.g. malformed PAN or Aadhaar format)
    // 3. Name is missing — EXCEPT for side-level aadhaar_back which does not carry personal identity fields
    // 4. Overall completeness is sub-threshold (< 0.75)
    const hasCoreViolation = missingRequiredFields.length > 0 || invalidRequiredFields.length > 0;
    const nameCheckRequired = isCustomerScope || category !== 'aadhaar_back';
    const requiresAi = hasCoreViolation ||
                       completeness < this.MIN_COMPLETENESS_THRESHOLD ||
                       (nameCheckRequired && !hasValidName) ||
                       (isCustomerScope && !isCustomerComplete);

    if (requiresAi) {
      lowConfidenceFields.push(...missingRequiredFields, ...invalidRequiredFields);
    }

    const missingImportantFields = Array.from(
      new Set([...missingRequiredFields, ...invalidRequiredFields])
    );

    return {
      completeness,
      requiresAiEnhancement: requiresAi,
      isSideComplete,
      isCustomerComplete,
      missingRequiredFields,
      invalidRequiredFields,
      missingImportantFields,
      confidenceSummary: {
        overall: completeness,
        low_confidence_fields: lowConfidenceFields
      }
    };
  }

  /**
   * Evaluates the final merged customer data completeness across all uploaded documents.
   * A complete customer identity requires a valid full name, at least one validated official ID,
   * and a valid address.
   */
  public static evaluateMergedCustomer(canonicalData: Record<string, unknown>): CompletenessEvaluation {
    return this.evaluate(canonicalData, { scope: 'customer' });
  }
}

