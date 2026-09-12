export type AiProvider = 'gemini' | 'chatgpt' | 'claude' | 'manual' | 'ocr-space' | 'markitdown' | 'openrouter';

export type AiField<T> = {
  value: T;
  confidence: number; // 0.0 to 1.0
  source_document?: string;
  source_side?: string;
};

export interface DetectedDocument {
  detected_type: string;
  confidence: number;
  source_filename?: string;
}

export interface NormalizedData {
  full_name?: AiField<string>;
  original_language_name?: AiField<string>;
  first_name?: AiField<string>;
  middle_name?: AiField<string>;
  last_name?: AiField<string>;
  phone?: AiField<string>;
  email?: AiField<string>;
  father_name?: AiField<string>;
  mother_name?: AiField<string>;
  spouse_name?: AiField<string>;
  marital_status?: AiField<string>;
  profile_photo?: {
    available: boolean;
    storage_path?: string;
    bounding_box?: number[];
    source_document?: string;
    confidence: number;
  };
  aadhaar_number?: AiField<string>;
  pan_number?: AiField<string>;
  gst_number?: AiField<string>;
  voter_id_number?: AiField<string>;
  date_of_birth?: AiField<string>; // YYYY-MM-DD
  gender?: AiField<'male' | 'female' | 'other'>;
  address?: AiField<string>;
  city?: AiField<string>;
  district?: AiField<string>;
  state?: AiField<string>;
  pincode?: AiField<string>;
  post_office?: AiField<string>;
  country?: AiField<string>;
  internal_conflicts?: Conflict[];
  detected_documents?: DetectedDocument[];
}

export interface ImportJob {
  id: string;
  documentType: string;
  provider: AiProvider;
  source: 'file' | 'json';
  frontFile?: File;
  backFile?: File;
  jsonText?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawResponse?: any;
  normalizedData?: NormalizedData;
  error?: string;
  version: number; // For document versioning
  perfSummary?: {
    provider: string;
    model: string;
    documentCount: number;
    imagePrepTime: number;
    primaryAttemptDuration: number;
    fallbackAttemptDuration: number;
    apiTime: number;
    jsonParseTime: number;
    normalizationTime: number;
    dbLogTime: number;
    totalTime: number;
    cacheHit?: boolean;
    cacheLookupMs?: number;
    cacheWriteMs?: number;
    savedProviderMs?: number;
    extractionSource?: 'ocr-space' | 'markitdown' | 'gemini' | 'openrouter' | string;
    aiEnhancementUsed?: boolean;
    completeness?: number;
  };
}

export type RelationshipTargetField = 'father_name' | 'spouse_name';
export type ConflictField = keyof NormalizedData | 'relationship_interpretation';

export interface ConflictOption {
  jobId: string;
  documentType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  confidence: number;
  source_side?: string;
  targetField?: RelationshipTargetField;
  candidateValue?: unknown;
}

export interface Conflict {
  field: ConflictField;
  options: ConflictOption[];
}

export interface MergedResult {
  data: NormalizedData;
  conflicts: Conflict[];
  jobs: ImportJob[];
}
