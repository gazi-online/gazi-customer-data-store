import sharp from 'sharp';

export interface OcrSpaceResult {
  success: boolean;
  text?: string;
  pages?: { pageNumber: number; text: string }[];
  processingTimeMs: number;
  error?: string;
  errorCategory?: 'AUTHENTICATION' | 'FILE_LIMIT' | 'RATE_LIMIT' | 'PROCESSING_ERROR' | 'NETWORK';
  submittedSizeBytes?: number;
  wasCompressed?: boolean;
  minQualityUsed?: number;
  longEdgeResized?: boolean;
  exifRotated?: boolean;
}

export interface OcrSpaceFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class OcrSpaceProvider {
  private static getApiKey(): string | null {
    const key = process.env.OCR_SPACE_API_KEY;
    if (!key || key.trim().length === 0) return null;
    return key.trim();
  }

  public static async extractText(file: OcrSpaceFile): Promise<OcrSpaceResult> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();

    if (!apiKey) {
      return {
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: "OCR.space is not configured (OCR_SPACE_API_KEY is missing).",
        errorCategory: "AUTHENTICATION"
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

    // 1. PDF strict 1 MB check
    if (isPdf && processBuffer.length > maxFileSizeBytes) {
      const sizeMb = (processBuffer.length / (1024 * 1024)).toFixed(2);
      return {
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: `PDF file size (${sizeMb} MB) exceeds the 1 MB OCR.space free plan limit.`,
        errorCategory: "FILE_LIMIT"
      };
    }

    // 2. Server-side Image Optimization (~900 KB target) with Long-Edge Resizing & EXIF Auto-Rotation
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

          // Step 1: Quality 85, Long-edge 2048px max
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

          // Step 2: If still > 900 KB, Quality 78, Long-edge 1800px max
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

          // Step 3: If still > 900 KB, Quality 70 (floor), Long-edge 1600px max
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

      // Check if compressed image is still > 1 MB (oversized/uncompressible case)
      if (processBuffer.length > maxFileSizeBytes) {
        return {
          success: false,
          processingTimeMs: Date.now() - startTime,
          error: "This image is too large for the current OCR.space plan. Try a smaller or lower-resolution image.",
          errorCategory: "FILE_LIMIT"
        };
      }
    }

    try {
      const engine = process.env.OCR_SPACE_ENGINE || "2";
      const language = process.env.OCR_SPACE_LANGUAGE || "auto";

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(processBuffer)], { type: mimeType });
      formData.append("file", blob, filename);
      formData.append("language", language);
      formData.append("OCREngine", engine);
      formData.append("isOverlayRequired", "false");
      formData.append("isTable", "false");
      formData.append("scale", "true");
      formData.append("detectOrientation", "true");

      const response = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: {
          "apikey": apiKey
        },
        body: formData
      });

      const responseTimeMs = Date.now() - startTime;

      if (!response.ok) {
        let cat: any = "NETWORK";
        if (response.status === 401 || response.status === 403) cat = "AUTHENTICATION";
        else if (response.status === 429) cat = "RATE_LIMIT";

        return {
          success: false,
          processingTimeMs: responseTimeMs,
          error: `OCR.space API HTTP ${response.status} error.`,
          errorCategory: cat
        };
      }

      const resData = await response.json();

      if (resData.IsErroredOnProcessing) {
        const errMsg = Array.isArray(resData.ErrorMessage) 
          ? resData.ErrorMessage.join("; ") 
          : (resData.ErrorMessage || "OCR text could not be extracted.");

        let cat: any = "PROCESSING_ERROR";
        if (errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("quota") || resData.OCRExitCode === 99) {
          cat = "RATE_LIMIT";
        } else if (errMsg.toLowerCase().includes("page") || errMsg.toLowerCase().includes("pdf")) {
          cat = "FILE_LIMIT";
        }

        return {
          success: false,
          processingTimeMs: responseTimeMs,
          error: errMsg,
          errorCategory: cat
        };
      }

      const parsedResults = resData.ParsedResults || [];
      if (parsedResults.length === 0) {
        return {
          success: false,
          processingTimeMs: responseTimeMs,
          error: "No text could be read from document.",
          errorCategory: "PROCESSING_ERROR"
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
        processingTimeMs: responseTimeMs,
        submittedSizeBytes: processBuffer.length,
        wasCompressed,
        minQualityUsed,
        longEdgeResized,
        exifRotated
      };

    } catch (error: any) {
      return {
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: error.message || "OCR.space request failed.",
        errorCategory: "NETWORK"
      };
    }
  }
}
