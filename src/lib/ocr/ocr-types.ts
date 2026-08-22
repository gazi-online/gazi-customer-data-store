export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OcrDocumentResult {
  filename: string;
  pages: OcrPageResult[];
  fullText: string;
  averageConfidence: number;
}

export interface OcrProgress {
  stage: string;
  currentItem?: number;
  totalItems?: number;
  percentage?: number;
  detail?: string;
}

export interface ClassificationResult {
  documentType: string;
  confidence: number;
  signals: string[];
}

export interface ParsedDocumentFields {
  customer?: {
    full_name?: string;
    dob?: string;
    gender?: 'male' | 'female' | 'other';
    father_name?: string;
    spouse_name?: string;
    mother_name?: string;
    original_language_name?: string;
  };
  address?: {
    full_address?: string;
    pincode?: string;
    district?: string;
    state?: string;
    city?: string;
    post_office?: string;
  };
  documents?: {
    aadhaar?: { number: string };
    pan?: { number: string };
    voter_id?: { number: string };
  };
  detected_documents?: Array<{
    detected_type: string;
    confidence: number;
    source_filename?: string;
  }>;
  diagnostic_data?: Record<string, any>;
  raw_text?: string;
  confidence_summary?: {
    overall: number;
    low_confidence_fields: string[];
  };
}
