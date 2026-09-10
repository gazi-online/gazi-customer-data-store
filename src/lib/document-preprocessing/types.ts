/**
 * Document Preprocessing Abstraction Types
 * Defines the contract for text-capable document preprocessing prior to GCDS AI extraction.
 */

export const MARKITDOWN_PREPROCESSOR_VERSION = "markitdown-0.1.7-quality-v1";

export type PreprocessSource = 'markitdown' | 'existing-ocr' | 'vision' | 'none';

export type PreprocessFailureCategory =
  // Security / validation errors (NEVER fall back, MUST REJECT)
  | 'SECURITY_VALIDATION_FAILED'
  | 'INVALID_FILE_SIGNATURE'
  | 'UNSUPPORTED_EXTENSION'
  | 'UNSUPPORTED_MIME'
  | 'PAYLOAD_TOO_LARGE'
  | 'OUTPUT_TOO_LARGE'
  | 'PROTOCOL_VIOLATION'
  | 'MALFORMED_WORKER_PROTOCOL'
  // Recoverable conversion errors (MAY FALL BACK for PDF)
  | 'CONVERSION_FAILED'
  | 'NO_TEXT_LAYER'
  | 'LOW_QUALITY_TEXT'
  | 'WORKER_UNAVAILABLE'
  | 'TIMEOUT';

export function isRecoverableFallbackError(category?: PreprocessFailureCategory): boolean {
  return (
    category === 'CONVERSION_FAILED' ||
    category === 'NO_TEXT_LAYER' ||
    category === 'LOW_QUALITY_TEXT' ||
    category === 'WORKER_UNAVAILABLE' ||
    category === 'TIMEOUT'
  );
}

export interface PreprocessingMetadata {
  preprocessor: string;
  format: string;
  markdown_length: number;
  fallback_used: boolean;
  duration_ms: number;
}

export interface PreprocessResult {
  source: PreprocessSource;
  mimeType: string;
  text?: string;
  markdown?: string;
  confidence?: number;
  fallbackRequired: boolean;
  warnings: string[];
  metadata?: PreprocessingMetadata;
  error?: string;
  failureCategory?: PreprocessFailureCategory;
}

export interface QualityEvaluationResult {
  passed: boolean;
  characterCount: number;
  alphanumericCount: number;
  alphaRatio: number;
  reason?: string;
}

export interface DocumentPreprocessor {
  preprocess(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<PreprocessResult>;
}
