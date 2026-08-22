import sharp from 'sharp';

export interface OcrSpaceResult {
  success: boolean;
  text?: string;
  pages?: { pageNumber: number; text: string }[];
  processingTimeMs: number;
  error?: string;
  errorCategory?: 'AUTHENTICATION' | 'FILE_LIMIT' | 'RATE_LIMIT' | 'PROCESSING_ERROR' | 'NETWORK';
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

    // Handle WEBP conversion to JPEG server-side using sharp
    if (mimeType.includes("webp") || filename.toLowerCase().endsWith(".webp")) {
      try {
        processBuffer = await sharp(file.buffer).jpeg({ quality: 90 }).toBuffer();
        filename = filename.replace(/\.webp$/i, ".jpg");
        mimeType = "image/jpeg";
      } catch (e: any) {
        console.warn("[OcrSpaceProvider] WEBP to JPEG conversion warning:", e.message);
      }
    }

    if (processBuffer.length > maxFileSizeBytes) {
      const sizeMb = (processBuffer.length / (1024 * 1024)).toFixed(2);
      return {
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: `File size (${sizeMb} MB) exceeds the 1 MB OCR.space free plan limit.`,
        errorCategory: "FILE_LIMIT"
      };
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
        processingTimeMs: responseTimeMs
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
