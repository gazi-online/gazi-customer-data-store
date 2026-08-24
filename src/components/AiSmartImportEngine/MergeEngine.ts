import { ImportJob, MergedResult, NormalizedData, Conflict, AiField } from './types';

// The priority ranking for different documents. Lower index = Higher priority.
const FIELD_PRIORITY: Record<keyof NormalizedData, string[]> = {
  full_name: ['Aadhaar Card', 'Passport', 'PAN Card', 'Voter ID'],
  original_language_name: ['Aadhaar Card', 'Voter ID'],
  first_name: ['Aadhaar Card', 'Passport', 'PAN Card', 'Voter ID'],
  middle_name: ['Aadhaar Card', 'Passport', 'PAN Card', 'Voter ID'],
  last_name: ['Aadhaar Card', 'Passport', 'PAN Card', 'Voter ID'],
  date_of_birth: ['Aadhaar Card', 'Passport', 'PAN Card', 'Voter ID'],
  gender: ['Aadhaar Card', 'Passport', 'Voter ID'],
  
  address: ['Aadhaar Card', 'Passport', 'Voter ID', 'Driving License'],
  city: ['Aadhaar Card', 'Passport', 'Voter ID'],
  district: ['Aadhaar Card', 'Voter ID'],
  state: ['Aadhaar Card', 'Voter ID'],
  pincode: ['Aadhaar Card', 'Voter ID'],
  country: ['Passport', 'Aadhaar Card'],
  
  aadhaar_number: ['Aadhaar Card'],
  pan_number: ['PAN Card'],
  gst_number: ['GST Certificate'],
  voter_id_number: ['Voter ID'],
  
  phone: [], // No strict priority, use whatever has it
  email: [],
  father_name: ['Aadhaar Card', 'Passport', 'PAN Card', 'Voter ID'],
  mother_name: ['Aadhaar Card', 'Passport', 'Voter ID'],
  marital_status: ['Passport', 'Aadhaar Card'],
  spouse_name: ['Aadhaar Card', 'Passport', 'Voter ID'],
  post_office: ['Aadhaar Card', 'Voter ID'],
  profile_photo: [], // Handled separately
  internal_conflicts: [], // Handled separately
  detected_documents: [], // Handled separately
};

export class MergeEngine {
  
  static merge(jobs: ImportJob[]): MergedResult {
    const data: NormalizedData = {};
    const conflicts: Conflict[] = [];
    
    // Only process completed jobs that have normalized data
    const validJobs = jobs.filter(j => j.status === 'completed' && j.normalizedData);
    if (validJobs.length === 0) return { data, conflicts, jobs: validJobs };

    // Get all possible keys from all jobs
    const allKeys = new Set<keyof NormalizedData>();
    validJobs.forEach(job => {
      Object.keys(job.normalizedData!).forEach(key => allKeys.add(key as keyof NormalizedData));
    });

    allKeys.forEach(field => {
      if (field === 'profile_photo') return; // Handled separately at the end
      if (field === 'internal_conflicts') return; // Handled separately
      if (field === 'detected_documents') return; // Handled separately

      // Collect all values provided by jobs for this field
      const options = validJobs
        .filter(job => job.normalizedData![field] !== undefined)
        .map(job => {
          const fieldData = job.normalizedData![field] as any;
          let docStr = fieldData.source_document;
          let sideStr = fieldData.source_side;

          if (!docStr || docStr.toLowerCase() === 'unknown' || docStr.toLowerCase() === 'string') {
            if (job.documentType.includes('Aadhaar')) docStr = 'Aadhaar';
            else docStr = job.documentType;
          }

          if (!sideStr || sideStr.toLowerCase() === 'unknown' || sideStr.toLowerCase() === 'string') {
            if (job.documentType.toLowerCase().includes('front')) sideStr = 'front';
            else if (job.documentType.toLowerCase().includes('back')) sideStr = 'back';
            else sideStr = 'unknown';
          }

          return {
            jobId: job.id,
            documentType: job.documentType,
            value: fieldData.value,
            confidence: fieldData.confidence,
            source_document: docStr,
            source_side: sideStr,
          };
        });

      if (options.length === 0) return;
      if (options.length === 1) {
        // Only one document provided this field, no conflict
        data[field] = { 
          value: options[0].value, 
          confidence: options[0].confidence,
          source_document: (options[0] as any).source_document,
          source_side: (options[0] as any).source_side
        } as any;
        return;
      }

      // We have multiple documents providing the same field. Check for conflicts.
      // Normalize values for comparison (lowercase, trim)
      const uniqueValues = new Set(options.map(opt => String(opt.value).toLowerCase().trim()));

      if (uniqueValues.size === 1) {
        // They all agree! Pick the one with the highest confidence
        options.sort((a, b) => b.confidence - a.confidence);
        data[field] = { 
          value: options[0].value, 
          confidence: options[0].confidence,
          source_document: (options[0] as any).source_document,
          source_side: (options[0] as any).source_side
        } as any;
      } else {
        // CONFLICT DETECTED!
        // Apply Priority Rules to auto-resolve if possible
        const priorityList = FIELD_PRIORITY[field] || [];
        
        // Sort options by Document Priority, Side Priority (Back preferred for address), then Confidence
        const addressFields: (keyof NormalizedData)[] = ['address', 'city', 'district', 'state', 'pincode', 'post_office'];

        options.sort((a, b) => {
          const getRank = (docType: string) => {
            const cleanDoc = docType.toLowerCase().replace(/_/g, ' ');
            const index = priorityList.findIndex(p => {
              const cleanP = p.toLowerCase().replace(/_/g, ' ');
              return cleanDoc.includes(cleanP) || cleanP.includes(cleanDoc) ||
                (cleanDoc.includes('aadhaar') && cleanP.includes('aadhaar')) ||
                (cleanDoc.includes('voter') && cleanP.includes('voter')) ||
                (cleanDoc.includes('pan') && cleanP.includes('pan')) ||
                (cleanDoc.includes('passport') && cleanP.includes('passport')) ||
                (cleanDoc.includes('driving') && cleanP.includes('driving'));
            });
            return index !== -1 ? index : 999;
          };

          const rankA = getRank(a.documentType);
          const rankB = getRank(b.documentType);

          if (rankA !== rankB) return rankA - rankB;

          // Side priority for address-related fields (Back side preferred)
          if (addressFields.includes(field)) {
            const sideA = (a.source_side || a.documentType || '').toLowerCase();
            const sideB = (b.source_side || b.documentType || '').toLowerCase();
            const isBackA = sideA.includes('back');
            const isBackB = sideB.includes('back');
            if (isBackA && !isBackB) return -1;
            if (isBackB && !isBackA) return 1;
          }

          return b.confidence - a.confidence;
        });

        // Check if top option has clear back-side priority over non-back options for address fields
        const topIsBack = addressFields.includes(field) &&
          ((options[0].source_side || options[0].documentType || '').toLowerCase().includes('back'));
        const secondIsBack = addressFields.includes(field) &&
          ((options[1].source_side || options[1].documentType || '').toLowerCase().includes('back'));

        const hasClearBackPriority = topIsBack && !secondIsBack;

        if (!hasClearBackPriority) {
          // Register conflict so the ReviewPanel can present it
          conflicts.push({
            field,
            options
          });
        }
        
        // Auto-assign the highest priority one
        data[field] = { 
          value: options[0].value, 
          confidence: options[0].confidence,
          source_document: (options[0] as any).source_document,
          source_side: (options[0] as any).source_side
        } as any;
      }
    });

    // Handle profile_photo separately since it has a different structure
    const validPhotoJobs = validJobs.filter(j => j.normalizedData?.profile_photo?.available);
    if (validPhotoJobs.length > 0) {
      // Pick the photo from the highest priority document type
      const photoPriority = ['Passport', 'Driving Licence', 'Aadhaar Card', 'Voter ID'];
      validPhotoJobs.sort((a, b) => {
        const rankA = photoPriority.indexOf(a.documentType);
        const rankB = photoPriority.indexOf(b.documentType);
        const validRankA = rankA !== -1 ? rankA : 999;
        const validRankB = rankB !== -1 ? rankB : 999;
        return validRankA - validRankB;
      });
      data.profile_photo = validPhotoJobs[0].normalizedData!.profile_photo;
    }

    // Collect all detected documents across jobs
    const allDetectedDocs: any[] = [];
    validJobs.forEach(j => {
      if (j.normalizedData?.detected_documents) {
        allDetectedDocs.push(...j.normalizedData.detected_documents);
      }
    });
    if (allDetectedDocs.length > 0) {
      data.detected_documents = allDetectedDocs;
    }

    // Include internal conflicts from single documents (e.g. Aadhaar Front/Back discrepancies)
    validJobs.forEach(job => {
      if (job.normalizedData?.internal_conflicts) {
        job.normalizedData.internal_conflicts.forEach(ic => {
          conflicts.push({
            field: ic.field,
            options: ic.options.map(opt => ({
              jobId: job.id,
              documentType: job.documentType,
              value: opt.value,
              confidence: opt.confidence,
              source_side: opt.source_side
            }))
          });
        });
      }
    });

    // Custom Conflict: Father vs Spouse interpretation across documents
    // If different documents extract the same name but interpret the relationship differently
    if (data.father_name && data.spouse_name) {
      const fName = String(data.father_name.value).toLowerCase().replace(/\s+/g, '');
      const sName = String(data.spouse_name.value).toLowerCase().replace(/\s+/g, '');
      
      if (fName === sName && fName.length > 0) {
        // They extracted the exact same name but assigned it to both Father and Spouse.
        // This is the "Husband/Spouse vs Father/Guardian" conflict.
        conflicts.push({
          field: 'relationship_interpretation' as any,
          options: [
            {
              jobId: 'conflict',
              documentType: (data.father_name as any).source_document || 'Unknown',
              value: `Father: ${data.father_name.value}`,
              confidence: data.father_name.confidence,
              source_side: (data.father_name as any).source_side
            },
            {
              jobId: 'conflict',
              documentType: (data.spouse_name as any).source_document || 'Unknown',
              value: `Spouse: ${data.spouse_name.value}`,
              confidence: data.spouse_name.confidence,
              source_side: (data.spouse_name as any).source_side
            }
          ]
        });
        
        // We do NOT silently overwrite. We leave both in `data`, but the conflict will alert the user.
      }
    }

    return { data, conflicts, jobs: validJobs };
  }
}
