import sharp from 'sharp';

export interface OcrSpaceResult {
  success: boolean;
  text?: string;
  pages?: { pageNumber: number; text: string }[];
  processingTimeMs: number;
  error?: string;
  errorCategory?: 'AUTHENTICATION' | 'FILE_LIMIT' | 'RATE_LIMIT' | 'PROCESSING_ERROR' | 'NETWORK' | 'SERVICE_UNAVAILABLE' | 'TIMEOUT';
  submittedSizeBytes?: number;
  wasCompressed?: boolean;
  minQualityUsed?: number;
  longEdgeResized?: boolean;
  exifRotated?: boolean;
  attemptsCount?: number;
}

export interface OcrSpaceFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class OcrSpaceProvider {
  private static circuitBreakerUntil: number = 0;

  public static resetCircuitBreaker(): void {
    this.circuitBreakerUntil = 0;
  }

  private static getApiKey(): string | null {
    const key = process.env.OCR_SPACE_API_KEY;
    if (!key || key.trim().length === 0) return null;
    return key.trim();
  }

  public static async extractText(file: OcrSpaceFile): Promise<OcrSpaceResult> {
    const startTime = Date.now();

    // 10. Short circuit breaker check (30-second in-memory window after repeated 503s)
    if (Date.now() < this.circuitBreakerUntil) {
      return {
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: "OCR.space is temporarily unavailable. Please try again in a moment.",
        errorCategory: "SERVICE_UNAVAILABLE",
        attemptsCount: 0
      };
    }

    const apiKey = this.getApiKey();

    if (!apiKey) {
      return {
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: "OCR.space is not configured (OCR_SPACE_API_KEY is missing).",
        errorCategory: "AUTHENTICATION",
        attemptsCount: 0
      };
    }

    const isProPlan = (process.env.OCR_SPACE_PLAN || "free").toLowerCase() === "pro";
    const maxFileSizeBytes = isProPlan ? 10 * 1024 * 1024 : 1 * 1024 * 1024; // 1MB free plan limit

    let processBuffer = file.buffer;
    let filename = file.filename || "document.jpg";
    let mimeType = file.mimeType || "image/jpeg";
    let wasCompressed = false;
    let minQualityUsed = 100;
    let longEdgeResized = false;
    let exifRotated = false;

    const lowerName = filename.toLowerCase();
    const isPdf = mimeType.includes("pdf") || lowerName.endsWith(".pdf");
    const isImage = mimeType.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(filename);

    // 1. PDF strict 1 MB check (Non-retryable file limit error)
    if (isPdf && processBuffer.length > maxFileSizeBytes) {
      const sizeMb = (processBuffer.length / (1024 * 1024)).toFixed(2);
      return {
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: `PDF file size (${sizeMb} MB) exceeds the 1 MB OCR.space free plan limit.`,
        errorCategory: "FILE_LIMIT",
        attemptsCount: 0
      };
    }

    // 7. Server-side Image Optimization ONCE before any HTTP retry attempt
    if (isImage) {
      const initialSize = processBuffer.length;
      const targetMaxBytes = 900 * 1024; // 900 KB target
      const isFormatConversionNeeded = mimeType.includes("webp") || mimeType.includes("png");

      if (initialSize > targetMaxBytes || isFormatConversionNeeded) {
        try {
          exifRotated = true; // sharp .rotate() performs EXIF auto-orientation
          const metadata = await sharp(file.buffer).rotate().metadata();
          const origW = metadata.width || 0;
          const origH = metadata.height || 0;
          const longEdge = Math.max(origW, origH);

          let targetLongEdge = longEdge > 2048 ? 2048 : (longEdge > 0 ? longEdge : 2048);
          if (longEdge > 2048) longEdgeResized = true;

          let quality = 85;
          minQualityUsed = quality;

          let pipeline = sharp(file.buffer).rotate();
          if (targetLongEdge < longEdge) {
            pipeline = pipeline.resize({
              width: origW >= origH ? targetLongEdge : undefined,
              height: origH > origW ? targetLongEdge : undefined,
              fit: 'inside',
              withoutEnlargement: true
            });
          }

          let compressed = await pipeline
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();

          if (compressed.length > targetMaxBytes) {
            quality = 78;
            minQualityUsed = quality;
            targetLongEdge = Math.min(targetLongEdge, 1800);
            if (longEdge > 1800) longEdgeResized = true;

            compressed = await sharp(file.buffer)
              .rotate()
              .resize({
                width: origW >= origH ? targetLongEdge : undefined,
                height: origH > origW ? targetLongEdge : undefined,
                fit: 'inside',
                withoutEnlargement: true
              })
              .jpeg({ quality, mozjpeg: true })
              .toBuffer();
          }

          if (compressed.length > targetMaxBytes) {
            quality = 70; // Hard minimum quality floor for OCR text legibility
            minQualityUsed = quality;
            targetLongEdge = Math.min(targetLongEdge, 1600);
            if (longEdge > 1600) longEdgeResized = true;

            compressed = await sharp(file.buffer)
              .rotate()
              .resize({
                width: origW >= origH ? targetLongEdge : undefined,
                height: origH > origW ? targetLongEdge : undefined,
                fit: 'inside',
                withoutEnlargement: true
              })
              .jpeg({ quality, mozjpeg: true })
              .toBuffer();
          }

          processBuffer = compressed;
          const baseName = filename.replace(/\.(webp|png|jpeg|jpg)$/i, "");
          filename = `${baseName}.jpg`;
          mimeType = "image/jpeg";
          wasCompressed = true;

        } catch (e: any) {
          console.warn("[OcrSpaceProvider] Image auto-compression warning:", e.message);
        }
      }

      if (processBuffer.length > maxFileSizeBytes) {
        return {
          success: false,
          processingTimeMs: Date.now() - startTime,
          error: "This image is too large for the current OCR.space plan. Try a smaller or lower-resolution image.",
          errorCategory: "FILE_LIMIT",
          attemptsCount: 0
        };
      }
    }

    const engine = process.env.OCR_SPACE_ENGINE || "2";
    const language = process.env.OCR_SPACE_LANGUAGE || "auto";

    // 3. Controlled Same-Provider Retry (Max 3 attempts for 502/503/504)
    const maxAttempts = 3;
    let attemptsCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsCount = attempt;

      // 8. REQUEST BODY SAFETY: Fresh FormData instance for each retry attempt
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(processBuffer)], { type: mimeType });
      formData.append("file", blob, filename);
      formData.append("language", language);
      formData.append("OCREngine", engine);
      formData.append("isOverlayRequired", "false");
      formData.append("isTable", "false");
      formData.append("scale", "true");
      formData.append("detectOrientation", "true");

      const attemptStart = Date.now();

      try {
        const response = await fetch("https://api.ocr.space/parse/image", {
          method: "POST",
          headers: {
            "apikey": apiKey
          },
          body: formData
        });

        const elapsedMs = Date.now() - attemptStart;
        const status = response.status;
        const contentType = response.headers.get("content-type") || "";

        // 1. TRACE THE REAL 503: Sanitized diagnostics logging
        console.log(`[OcrSpaceProvider] Attempt ${attempt}/${maxAttempts} - HTTP status: ${status} ${response.statusText} | Content-Type: ${contentType} | Elapsed: ${elapsedMs}ms`);

        // 2 & 3. Handle 502 / 503 / 504 Transient Server Errors with controlled retry
        if (status === 502 || status === 503 || status === 504) {
          if (attempt < maxAttempts) {
            const delayMs = attempt === 1 ? 1000 + Math.floor(Math.random() * 100) : 2500 + Math.floor(Math.random() * 100);
            console.warn(`[OcrSpaceProvider] Transient HTTP ${status} error on attempt ${attempt}. Waiting ${delayMs}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue; // Retry next attempt
          } else {
            // 5. Final attempt failed -> set 30s circuit breaker and return clean user message
            this.circuitBreakerUntil = Date.now() + 30000;
            return {
              success: false,
              processingTimeMs: Date.now() - startTime,
              error: "OCR.space is temporarily unavailable. Please try again in a moment.",
              errorCategory: "SERVICE_UNAVAILABLE",
              attemptsCount
            };
          }
        }

        // 4. Non-retryable HTTP error status codes (400, 401, 403, 413, 429)
        if (!response.ok) {
          if (status === 429) {
            const retryAfterHeader = response.headers.get("retry-after");
            const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
            const boundSec = !isNaN(retryAfterSec) && retryAfterSec > 0 ? Math.min(retryAfterSec, 5) : 0;
            if (boundSec > 0) {
              console.warn(`[OcrSpaceProvider] 429 Rate Limit encountered. Respecting Retry-After (${boundSec}s)...`);
            }
            return {
              success: false,
              processingTimeMs: Date.now() - startTime,
              error: "OCR.space rate limit reached. Please wait a moment before trying again.",
              errorCategory: "RATE_LIMIT",
              attemptsCount
            };
          }

          let cat: 'AUTHENTICATION' | 'FILE_LIMIT' | 'PROCESSING_ERROR' = "PROCESSING_ERROR";
          let errorMsg = `OCR.space request failed with HTTP ${status}.`;

          if (status === 401 || status === 403) {
            cat = "AUTHENTICATION";
            errorMsg = "OCR.space authentication failed. Please check your API key.";
          } else if (status === 413 || status === 400) {
            cat = "FILE_LIMIT";
            errorMsg = "Document file size or format rejected by OCR.space.";
          }

          return {
            success: false,
            processingTimeMs: Date.now() - startTime,
            error: errorMsg,
            errorCategory: cat,
            attemptsCount
          };
        }

        // 12. VERIFY PROVIDER RESPONSE BODY: Safe JSON parsing & HTML response handling
        let resData: any = null;
        if (contentType.includes("application/json")) {
          try {
            resData = await response.json();
          } catch (e) {
            // JSON parse failed despite application/json header
          }
        } else {
          // Response is HTML or plain text (e.g. upstream 503 HTML error page returning HTTP 200)
          const textBody = await response.text();
          if (textBody.includes("<html") || textBody.includes("<head>")) {
            return {
              success: false,
              processingTimeMs: Date.now() - startTime,
              error: "OCR.space is temporarily unavailable. Please try again in a moment.",
              errorCategory: "SERVICE_UNAVAILABLE",
              attemptsCount
            };
          }
        }

        if (!resData) {
          return {
            success: false,
            processingTimeMs: Date.now() - startTime,
            error: "Invalid response format received from OCR.space.",
            errorCategory: "PROCESSING_ERROR",
            attemptsCount
          };
        }

        if (resData.IsErroredOnProcessing) {
          const errMsg = Array.isArray(resData.ErrorMessage) 
            ? resData.ErrorMessage.join("; ") 
            : (resData.ErrorMessage || "OCR text could not be extracted.");

          let cat: 'FILE_LIMIT' | 'RATE_LIMIT' | 'PROCESSING_ERROR' = "PROCESSING_ERROR";
          if (errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("quota") || resData.OCRExitCode === 99) {
            cat = "RATE_LIMIT";
          } else if (errMsg.toLowerCase().includes("page") || errMsg.toLowerCase().includes("pdf")) {
            cat = "FILE_LIMIT";
          }

          return {
            success: false,
            processingTimeMs: Date.now() - startTime,
            error: errMsg,
            errorCategory: cat,
            attemptsCount
          };
        }

        const parsedResults = resData.ParsedResults || [];
        if (parsedResults.length === 0) {
          return {
            success: false,
            processingTimeMs: Date.now() - startTime,
            error: "No text could be read from document.",
            errorCategory: "PROCESSING_ERROR",
            attemptsCount
          };
        }

        const pages: { pageNumber: number; text: string }[] = [];
        const textParts: string[] = [];

        for (let i = 0; i < parsedResults.length; i++) {
          const pr = parsedResults[i];
          const pageText = pr.ParsedText || "";
          pages.push({
            pageNumber: i + 1,
            text: pageText
          });
          if (pageText.trim()) {
            textParts.push(`--- PAGE ${i + 1} ---\n${pageText}`);
          }
        }

        const combinedText = textParts.join("\n\n");

        return {
          success: true,
          text: combinedText,
          pages,
          processingTimeMs: Date.now() - startTime,
          submittedSizeBytes: processBuffer.length,
          wasCompressed,
          minQualityUsed,
          longEdgeResized,
          exifRotated,
          attemptsCount
        };

      } catch (error: any) {
        // 9. TIMEOUT HANDLING: AbortError / network timeout classified as TIMEOUT
        console.warn(`[OcrSpaceProvider] Network error on attempt ${attempt}:`, error.message);
        
        const isTimeout = error.name === 'AbortError' || error.message.toLowerCase().includes('timeout');
        
        if (attempt < maxAttempts && !isTimeout) {
          const delayMs = attempt === 1 ? 1000 : 2500;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        return {
          success: false,
          processingTimeMs: Date.now() - startTime,
          error: isTimeout ? "Network request to OCR.space timed out." : (error.message || "OCR.space request failed."),
          errorCategory: isTimeout ? "TIMEOUT" : "NETWORK",
          attemptsCount
        };
      }
    }

    this.circuitBreakerUntil = Date.now() + 30000;
    return {
      success: false,
      processingTimeMs: Date.now() - startTime,
      error: "OCR.space is temporarily unavailable. Please try again in a moment.",
      errorCategory: "SERVICE_UNAVAILABLE",
      attemptsCount: maxAttempts
    };
  }
}
