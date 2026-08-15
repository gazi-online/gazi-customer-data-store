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

export interface CustomerDocument {
  id: string;
  customer_id: string;
  document_type: DocumentType;
  file_url: string; // The storage path
  
  // AI Extracted Data
  ai_processed: boolean;
  ai_extracted_json: Record<string, any> | null;
  verified: boolean;
  
  uploaded_at: string;
  
  // Transient fields for UI
  signed_url?: string; // Temporarily holds the preview URL
}
