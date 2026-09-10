export type DocumentSide = 'Front' | 'Back' | 'Both' | 'Single';

export interface StagedFileItem {
  id: string;
  file: File;
  previewUrl?: string;
  side: DocumentSide;
}

export interface FileValidationError {
  id: string;
  fileName: string;
  reason: string;
  type: 'unsupported_type' | 'size_exceeded' | 'duplicate' | 'batch_limit';
}

export const UPLOAD_CONSTANTS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_FILE_SIZE_LABEL: "10 MB",
  MAX_FILES_PER_BATCH: 10,
  ALLOWED_EXTENSIONS: ['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png', '.webp'] as const,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp'
  ] as const,
  ACCEPT_STRING: '.pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp',
  SUPPORTED_FORMATS_LABEL: 'PDF, DOCX, XLSX, JPG, PNG, WEBP',
  DEFAULT_SIDE: 'Single' as DocumentSide,
  SIDE_OPTIONS: ['Front', 'Back', 'Both', 'Single'] as const satisfies readonly DocumentSide[],
};

export function isOfficeDocument(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.docx') || lower.endsWith('.xlsx');
}

export function validateSideAssignments(stagedFiles: StagedFileItem[]): string | null {
  // Office documents cannot be assigned Front/Back/Both
  for (const sf of stagedFiles) {
    if (isOfficeDocument(sf.file.name) && sf.side !== 'Single') {
      return "Office documents are processed as a single document.";
    }
  }

  const frontFiles = stagedFiles.filter(sf => sf.side === 'Front');
  const backFiles = stagedFiles.filter(sf => sf.side === 'Back');
  const bothFiles = stagedFiles.filter(sf => sf.side === 'Both');

  // Case B: 2 files both marked Front
  if (frontFiles.length > 1) {
    return "Only one Front file can be assigned per document pair.";
  }

  // Case C: 2 files both marked Back
  if (backFiles.length > 1) {
    return "Only one Back file can be assigned per document pair.";
  }

  // Case D: 1 file marked Both + another file marked Front or Back
  if (bothFiles.length > 0 && (frontFiles.length > 0 || backFiles.length > 0)) {
    return "A document marked 'Both' cannot be paired with separate Front or Back documents in the same extraction.";
  }

  if (bothFiles.length > 1) {
    return "Only one document can be marked 'Both' per document extraction batch.";
  }

  return null;
}

