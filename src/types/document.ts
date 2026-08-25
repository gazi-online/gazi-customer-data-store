export type DocumentType = 
  | 'Aadhaar Card (Front)'
  | 'Aadhaar Card (Back)'
  | 'PAN Card'
  | 'Passport'
  | 'Driving License'
  | 'Voter ID'
  | 'Trade License'
  | 'GST Certificate'
  | 'Business Registration'
  | 'Bank Passbook'
  | 'Agreement'
  | 'Photo'
  | 'Other';

export type DocumentStatus = 'active' | 'superseded' | 'archived';
export type DocumentSide = 'front' | 'back' | 'single';

export interface CustomerDocument {
  id: string;
  customer_id: string;
  document_type: DocumentType;
  file_url: string; // The storage path
  
  status?: DocumentStatus;
  side?: DocumentSide;
  source_filename?: string;
  file_size?: number;
  mime_type?: string;
  created_by?: string;
  version?: number;
  superseded_by?: string;
  archived_at?: string;
  updated_at?: string;

  // AI Extracted Data
  ai_processed: boolean;
  ai_extracted_json: Record<string, any> | null;
  verified: boolean;
  
  uploaded_at: string;
  
  // Optional metadata
  document_name?: string;
  document_number?: string;
  issue_date?: string;
  expiry_date?: string;
  notes?: string;

  // Joined Customer info (for global listing)
  customer?: {
    id: string;
    customer_code: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    phone: string;
  };

  // Transient fields for UI
  signed_url?: string;
}

export interface AiImportHistoryRecord {
  id: string;
  created_by: string;
  customer_id?: string;
  document_ids?: string[];
  original_images?: string;
  ai_raw_response?: string;
  final_json?: Record<string, any> | null;
  ai_provider?: string;
  prompt_version?: string;
  status?: string;
  processing_time_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost?: number;
  model_name?: string;
  error_message?: string | null;
  cache_hit?: boolean;
  photo_source_type?: 'manual' | 'ai_document';
  created_at: string;
}
