export interface SmartImportFailureResult {
  success: false;
  error: string;
  code: 'TEXT_EXTRACTION_FAILED' | 'DOCUMENT_PARSE_FAILED' | 'OCR_UNAVAILABLE' | string;
}

export function countUsableFields(data: Record<string, unknown> | null | undefined): number {
  if (!data || typeof data !== 'object') return 0;
  let count = 0;
  const customer = data.customer as Record<string, unknown> | undefined;
  const address = data.address as Record<string, unknown> | undefined;
  const documents = data.documents as Record<string, unknown> | undefined;

  if (customer && typeof customer === 'object') {
    count += Object.values(customer).filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
  }
  if (address && typeof address === 'object') {
    count += Object.values(address).filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
  }
  if (documents && typeof documents === 'object') {
    for (const doc of Object.values(documents)) {
      if (doc && typeof doc === 'object' && 'number' in doc && (doc as { number?: unknown }).number) {
        count += 1;
      }
    }
  }
  return count;
}

export function getSmartImportFailure(params: {
  hasExtractedText: boolean;
  usableFieldCount?: number;
  hasOcrUnavailableImages?: boolean;
}): SmartImportFailureResult {
  if (params.hasOcrUnavailableImages && !params.hasExtractedText) {
    return {
      success: false,
      code: 'OCR_UNAVAILABLE',
      error: "Document scanning is currently unavailable. Please enter the customer details manually."
    };
  }

  if (params.hasExtractedText && (params.usableFieldCount ?? 0) === 0) {
    return {
      success: false,
      code: 'DOCUMENT_PARSE_FAILED',
      error: "We could read the document, but couldn't identify the details. Please review the document and enter the missing information manually."
    };
  }

  return {
    success: false,
    code: 'TEXT_EXTRACTION_FAILED',
    error: "We couldn't read this document automatically. Please upload a clearer copy or enter the details manually."
  };
}
