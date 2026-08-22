import { NormalizedData, AiField } from './types';

function toAiField<T>(value: any, metadata?: any, defaultConfidence: number = 0.9): AiField<T> | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  
  if (typeof value === 'object' && 'value' in value) {
    return {
      value: value.value as T,
      confidence: typeof value.confidence === 'number' ? value.confidence : (metadata?.confidence ?? defaultConfidence),
      source_document: value.source_document || metadata?.source_document,
      source_side: value.source_side || metadata?.source_side
    };
  }
  
  return {
    value: value as T,
    confidence: metadata?.confidence ?? defaultConfidence,
    source_document: metadata?.source_document,
    source_side: metadata?.source_side
  };
}

// Normalizes various date formats to YYYY-MM-DD
function normalizeDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  // Handle DD/MM/YYYY
  const parts = dateStr.split(/[\/\-.]/);
  if (parts.length === 3) {
    if (parts[0].length === 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY -> YYYY-MM-DD
    }
    if (parts[0].length === 4) {
       return `${parts[0]}-${parts[1]}-${parts[2]}`; // Already YYYY-MM-DD
    }
  }
  return dateStr;
}

export class DataNormalizer {
  static normalize(rawData: any): NormalizedData {
    if (!rawData) return {};

    if (typeof rawData === 'string') {
      try {
        rawData = JSON.parse(rawData);
      } catch {
        return {};
      }
    }

    if (typeof rawData !== 'object' || Array.isArray(rawData)) return {};

    const normalized: NormalizedData = {};
    
    // Support both flat JSON and Universal JSON Schema (where data is under 'customer' and 'address')
    const customer = rawData.customer || rawData;
    const addressObj = rawData.address || rawData;
    const profilePhoto = rawData.profile_photo;
    const conf = rawData.confidence || {};

    if (Array.isArray(rawData.conflicts) && rawData.conflicts.length > 0) {
      normalized.internal_conflicts = rawData.conflicts;
    }

    if (Array.isArray(rawData.detected_documents)) {
      normalized.detected_documents = rawData.detected_documents.map((d: any) => ({
        detected_type: d.detected_type || d.type || 'unknown',
        confidence: typeof d.confidence === 'number' ? d.confidence : 0.9,
        source_filename: d.source_filename || d.filename
      }));
    }

    if (profilePhoto && profilePhoto.available) {
      normalized.profile_photo = {
        available: profilePhoto.available,
        storage_path: profilePhoto.storage_path,
        bounding_box: profilePhoto.bounding_box,
        source_document: profilePhoto.source_document,
        confidence: profilePhoto.confidence || 1.0,
      };
    }

    // Full Name
    const fullName = customer.full_name || customer.fullName || customer.name;
    if (fullName) normalized.full_name = toAiField(fullName, conf.full_name);

    // Original Language Name
    const origLangName = customer.original_language_name || customer.originalLanguageName;
    if (origLangName) normalized.original_language_name = toAiField(origLangName, conf.original_language_name);

    // First Name
    const firstName = customer.first_name || customer.firstName;
    if (firstName) normalized.first_name = toAiField(firstName, conf.first_name);

    // Middle Name
    const middleName = customer.middle_name || customer.middleName;
    if (middleName) normalized.middle_name = toAiField(middleName, conf.middle_name);

    // Last Name
    const lastName = customer.last_name || customer.lastName;
    if (lastName) normalized.last_name = toAiField(lastName, conf.last_name);

    // Phone
    const phone = customer.phone || customer.phoneNumber || customer.mobile;
    if (phone) normalized.phone = toAiField(phone, conf.phone || conf.mobile);

    // Email
    const email = customer.email || customer.emailAddress;
    if (email) normalized.email = toAiField(email, conf.email);

    // Father Name
    const fatherName = customer.father_name || customer.fatherName || customer.guardian_name || customer.guardianName;
    if (fatherName) normalized.father_name = toAiField(fatherName, conf.father_name);

    // Mother Name
    const motherName = customer.mother_name || customer.motherName;
    if (motherName) normalized.mother_name = toAiField(motherName, conf.mother_name);

    // Spouse Name
    const spouseName = customer.spouse_name || customer.spouseName || customer.husband_name || customer.husbandName || customer.wife_name || customer.wifeName;
    if (spouseName) normalized.spouse_name = toAiField(spouseName, conf.spouse_name);

    // Marital Status
    const maritalStatus = customer.marital_status || customer.maritalStatus;
    if (maritalStatus) {
      const field = toAiField<string>(maritalStatus, conf.marital_status);
      if (field) {
        // Standardize output to match form options if possible
        const val = field.value.toLowerCase();
        if (val.includes('single') || val.includes('unmarried')) normalized.marital_status = { ...field, value: 'Single' };
        else if (val.includes('married')) normalized.marital_status = { ...field, value: 'Married' };
        else if (val.includes('widow')) normalized.marital_status = { ...field, value: 'Widowed' };
        else if (val.includes('divorce')) normalized.marital_status = { ...field, value: 'Divorced' };
        else if (val.includes('separat')) normalized.marital_status = { ...field, value: 'Separated' };
        else normalized.marital_status = field;
      }
    }

    // Aadhaar (Might be in documents.aadhaar.number)
    const aadhaar = rawData.documents?.aadhaar?.number || customer.aadhaar_number || customer.aadhaarNumber || customer.aadhaar;
    if (aadhaar) {
      const cleanAadhaar = typeof aadhaar === 'string' ? aadhaar.replace(/\s/g, '') : aadhaar.value?.replace(/\s/g, '');
      normalized.aadhaar_number = toAiField(cleanAadhaar, conf.aadhaar_number || (typeof aadhaar === 'object' ? aadhaar : undefined), 0.9);
    }

    // PAN
    const pan = rawData.documents?.pan?.number || customer.pan_number || customer.panNumber || customer.pan;
    if (pan) {
      const cleanPan = typeof pan === 'string' ? pan.toUpperCase() : pan.value?.toUpperCase();
      normalized.pan_number = toAiField(cleanPan, conf.pan_number || (typeof pan === 'object' ? pan : undefined), 0.9);
    }

    // Voter ID / EPIC Number
    const voterId = rawData.documents?.voter_id?.number || rawData.documents?.voterId?.number || customer.voter_id_number || customer.voter_id || customer.voterId || customer.epic_number;
    if (voterId) {
      const cleanVoterId = typeof voterId === 'string' ? voterId.trim().toUpperCase() : voterId.value?.trim().toUpperCase();
      normalized.voter_id_number = toAiField(cleanVoterId, conf.voter_id_number || conf.voter_id || (typeof voterId === 'object' ? voterId : undefined), 0.9);
    }

    // Date of Birth
    const dob = customer.dob || customer.date_of_birth || customer.dateOfBirth;
    if (dob) {
      const field = toAiField<string>(dob, conf.dob || conf.date_of_birth);
      if (field) {
        field.value = normalizeDate(field.value) || field.value;
        normalized.date_of_birth = field;
      }
    }

    // Gender
    const gender = customer.gender || customer.sex;
    if (gender) {
      const field = toAiField<string>(gender, conf.gender);
      if (field) {
        const val = field.value.toLowerCase();
        if (['male', 'female', 'other'].includes(val)) {
          normalized.gender = { ...field, value: val as any };
        }
      }
    }

    // Address fields
    let fullAddress = '';
    if (typeof addressObj === 'object' && addressObj !== null && !Array.isArray(addressObj) && !('confidence' in addressObj)) {
      if (addressObj.full_address) {
        fullAddress = addressObj.full_address;
      } else if (addressObj.address) {
        fullAddress = addressObj.address;
      } else if (addressObj.line1) {
        fullAddress = [addressObj.line1, addressObj.line2, addressObj.city, addressObj.state].filter(Boolean).join(', ');
      } else {
        const parts = [
          addressObj.house,
          addressObj.street,
          addressObj.landmark,
          addressObj.village,
          addressObj.post_office
        ].filter(Boolean);
        fullAddress = parts.join(', ');
      }

      if (addressObj.city) normalized.city = toAiField(addressObj.city, conf.city);
      if (addressObj.district) normalized.district = toAiField(addressObj.district, conf.district);
      if (addressObj.state) normalized.state = toAiField(addressObj.state, conf.state);
      if (addressObj.pincode) normalized.pincode = toAiField(addressObj.pincode, conf.pincode);
      if (addressObj.post_office) normalized.post_office = toAiField(addressObj.post_office, conf.post_office);
    } else if (typeof rawData.address === 'string') {
      fullAddress = rawData.address;
    } else if (rawData.fullAddress) {
      fullAddress = rawData.fullAddress;
    }

    if (fullAddress) {
      normalized.address = toAiField(fullAddress, conf.address);
    }

    // Fallbacks if city/state/post_office/pincode weren't in address object
    if (!normalized.city && rawData.city) normalized.city = toAiField(rawData.city, conf.city);
    if (!normalized.state && rawData.state) normalized.state = toAiField(rawData.state, conf.state);
    if (!normalized.post_office && (rawData.post_office || rawData.postOffice)) {
      normalized.post_office = toAiField(rawData.post_office || rawData.postOffice, conf.post_office);
    }
    if (!normalized.pincode && (rawData.pincode || rawData.pinCode || rawData.postalCode || rawData.zip || customer.pincode || customer.pinCode)) {
      normalized.pincode = toAiField(rawData.pincode || rawData.pinCode || rawData.postalCode || rawData.zip || customer.pincode || customer.pinCode, conf.pincode);
    }

    // Clean pincode digits
    if (normalized.pincode?.value) {
      const cleanPin = normalized.pincode.value.replace(/\D/g, '');
      if (cleanPin.length === 6) {
        normalized.pincode.value = cleanPin;
      }
    }

    // Default country to India if rawData is non-empty
    if (Object.keys(rawData).length > 0) {
      const countryVal = rawData.country || customer.country;
      normalized.country = toAiField(typeof countryVal === 'string' && countryVal.trim() ? countryVal.trim() : "India", conf.country, 0.95);
    }

    return normalized;
  }
}
