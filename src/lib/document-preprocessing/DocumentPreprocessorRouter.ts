import path from 'path';
import { PreprocessResult, isRecoverableFallbackError } from './types';
import { MarkItDownProvider } from './providers/MarkItDownProvider';
import { MarkdownQualityEvaluator } from './MarkdownQualityEvaluator';
import { FileSignatureValidator } from './FileSignatureValidator';

export class DocumentPreprocessorRouter {
  private static markItDownProvider = new MarkItDownProvider();

  private static readonly TEXT_CAPABLE_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx']);
  private static readonly IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

  /**
   * Evaluates server-only feature flag.
   * Never exposed to the browser.
   */
  public static isFeatureEnabled(): boolean {
    return process.env.MARKITDOWN_PREPROCESSING_ENABLED === 'true';
  }

  /**
   * Identifies whether a file extension or MIME type is text-capable for MarkItDown.
   */
  public static isTextCapable(fileName: string, mimeType?: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    if (this.TEXT_CAPABLE_EXTENSIONS.has(ext)) {
      return true;
    }
    if (mimeType) {
      const lowerMime = mimeType.toLowerCase();
      if (
        lowerMime === 'application/pdf' ||
        lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validates whether a MIME type is consistent with the declared extension.
   */
  public static isMimeExtensionMismatch(ext: string, mimeType?: string): boolean {
    if (!mimeType || mimeType === 'application/octet-stream') {
      return false;
    }
    const lowerMime = mimeType.toLowerCase().trim();

    if (ext === '.pdf') {
      return lowerMime !== 'application/pdf';
    }
    if (ext === '.docx') {
      return (
        lowerMime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        lowerMime !== 'application/msword' &&
        lowerMime !== 'application/docx'
      );
    }
    if (ext === '.xlsx') {
      return (
        lowerMime !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
        lowerMime !== 'application/vnd.ms-excel' &&
        lowerMime !== 'application/xlsx'
      );
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      return lowerMime !== 'image/jpeg' && lowerMime !== 'image/jpg';
    }
    if (ext === '.png') {
      return lowerMime !== 'image/png';
    }
    if (ext === '.webp') {
      return lowerMime !== 'image/webp';
    }

    // Cross-category mismatches for other extensions
    if (this.IMAGE_EXTENSIONS.has(ext) && !lowerMime.startsWith('image/')) return true;
    if (this.TEXT_CAPABLE_EXTENSIONS.has(ext) && lowerMime.startsWith('image/')) return true;

    return false;
  }

  /**
   * Main routing method for incoming document buffers.
   */
  public static async routeAndPreprocess(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<PreprocessResult> {
    const ext = path.extname(fileName).toLowerCase();

    // 1. Path traversal & filename hygiene check (Strict rejection, NEVER fall back)
    const baseName = path.basename(fileName);
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      if (baseName !== fileName) {
        return {
          source: 'none',
          mimeType,
          fallbackRequired: false,
          warnings: ['Invalid filename format or path traversal attempt'],
          error: 'INVALID_FILENAME',
          failureCategory: 'SECURITY_VALIDATION_FAILED'
        };
      }
    }

    // 2. MIME type & extension consistency check (Strict rejection, NEVER fall back)
    if (this.isMimeExtensionMismatch(ext, mimeType)) {
      return {
        source: 'none',
        mimeType,
        fallbackRequired: false,
        warnings: [`MIME type '${mimeType}' is inconsistent with file extension '${ext}'`],
        error: 'INVALID_MIME',
        failureCategory: 'UNSUPPORTED_MIME'
      };
    }

    // 3. Direct Bypass for Images (JPG, JPEG, PNG, WEBP)
    if (this.IMAGE_EXTENSIONS.has(ext) || mimeType.startsWith('image/')) {
      // Validate image signature before accepting
      const sig = FileSignatureValidator.validate(fileBuffer, ext);
      if (!sig.valid) {
        return {
          source: 'none',
          mimeType,
          fallbackRequired: false,
          warnings: [sig.reason || 'Invalid image header'],
          error: 'INVALID_FILE_SIGNATURE',
          failureCategory: 'INVALID_FILE_SIGNATURE'
        };
      }
      return {
        source: 'vision',
        mimeType,
        fallbackRequired: false,
        warnings: []
      };
    }

    // 3. Reject unsupported formats (TIFF, executables, etc.)
    if (!this.isTextCapable(fileName, mimeType)) {
      return {
        source: 'none',
        mimeType,
        fallbackRequired: false,
        warnings: [`Format ${ext || mimeType} is not supported.`],
        error: 'UNSUPPORTED_FORMAT',
        failureCategory: 'UNSUPPORTED_EXTENSION'
      };
    }

    // 4. File Container & Signature Validation (Strict rejection, NEVER fall back)
    const signatureCheck = FileSignatureValidator.validate(fileBuffer, ext);
    if (!signatureCheck.valid) {
      return {
        source: 'none',
        mimeType,
        fallbackRequired: false,
        warnings: [signatureCheck.reason || 'File container does not match declared extension'],
        error: 'INVALID_FILE_SIGNATURE',
        failureCategory: 'INVALID_FILE_SIGNATURE'
      };
    }

    // 5. Check Server-Only Feature Flag
    if (!this.isFeatureEnabled()) {
      if (ext === '.pdf' || mimeType === 'application/pdf') {
        return {
          source: 'existing-ocr',
          mimeType,
          fallbackRequired: true,
          warnings: ['MarkItDown disabled via feature flag. Using existing OCR/Vision pipeline.'],
          failureCategory: 'WORKER_UNAVAILABLE'
        };
      } else {
        return {
          source: 'none',
          mimeType,
          fallbackRequired: false,
          warnings: ['MarkItDown preprocessing disabled for Office documents'],
          error: "We couldn't read this document automatically. Please try another file or enter the details manually.",
          failureCategory: 'WORKER_UNAVAILABLE'
        };
      }
    }

    // 6. Text-capable formats (PDF, DOCX, XLSX) -> Execute MarkItDown
    const markitdownRes = await this.markItDownProvider.preprocess(fileBuffer, fileName, mimeType);

    // 7. PDF Routing Policy
    if (ext === '.pdf' || mimeType === 'application/pdf') {
      const rawMarkdown = markitdownRes.markdown?.trim() || '';

      if (!rawMarkdown || markitdownRes.fallbackRequired) {
        const failureCat = markitdownRes.failureCategory || (!rawMarkdown ? 'NO_TEXT_LAYER' : 'CONVERSION_FAILED');
        const isRecoverable = isRecoverableFallbackError(failureCat);
        if (!isRecoverable) {
          // Security / protocol / size violation -> MUST REJECT, NEVER fall back!
          return {
            source: 'none',
            mimeType,
            fallbackRequired: false,
            warnings: markitdownRes.warnings,
            error: markitdownRes.error || 'SECURITY_REJECTION',
            failureCategory: failureCat
          };
        }

        // Legitimate conversion error or no text layer -> Fall back to OCR/Vision
        return {
          source: 'existing-ocr',
          mimeType,
          fallbackRequired: true,
          warnings: [
            'MarkItDown found no usable text layer or conversion failed. Falling back to existing OCR/Vision pipeline.',
            ...(markitdownRes.warnings || [])
          ],
          failureCategory: failureCat,
          metadata: markitdownRes.metadata
            ? { ...markitdownRes.metadata, fallback_used: true }
            : undefined
        };
      }

      // Evaluate extracted markdown quality
      const quality = MarkdownQualityEvaluator.evaluate(markitdownRes.markdown);
      if (!quality.passed) {
        // Scanned / low-quality PDF -> Graceful fallback to OCR/Vision
        return {
          source: 'existing-ocr',
          mimeType,
          fallbackRequired: true,
          warnings: [
            `PDF produced insufficient text quality (${quality.reason}). Falling back to existing OCR/Vision pipeline.`
          ],
          failureCategory: 'LOW_QUALITY_TEXT',
          metadata: markitdownRes.metadata
            ? { ...markitdownRes.metadata, fallback_used: true }
            : undefined
        };
      }

      // Valid text PDF
      return {
        ...markitdownRes,
        source: 'markitdown',
        fallbackRequired: false
      };
    }

    // 8. DOCX / XLSX Policy (No OCR fallback available)
    if (ext === '.docx' || ext === '.xlsx') {
      if (!markitdownRes.markdown || markitdownRes.fallbackRequired) {
        return {
          source: 'none',
          mimeType,
          fallbackRequired: false,
          warnings: markitdownRes.warnings || [],
          error: "We couldn't read this document automatically. Please try another file or enter the details manually.",
          failureCategory: markitdownRes.failureCategory || 'CONVERSION_FAILED'
        };
      }

      const quality = MarkdownQualityEvaluator.evaluate(markitdownRes.markdown);
      if (!quality.passed) {
        return {
          source: 'none',
          mimeType,
          fallbackRequired: false,
          warnings: [`Office document produced unusable content (${quality.reason})`],
          error: "We couldn't read this document automatically. Please try another file or enter the details manually.",
          failureCategory: 'LOW_QUALITY_TEXT'
        };
      }

      return {
        ...markitdownRes,
        source: 'markitdown',
        fallbackRequired: false
      };
    }

    return {
      source: 'none',
      mimeType,
      fallbackRequired: false,
      warnings: ['Unhandled document route'],
      error: 'UNHANDLED_ROUTE'
    };
  }
}
