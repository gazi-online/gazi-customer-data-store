import { createWorker, Worker } from 'tesseract.js';
import { PdfRenderer } from './PdfRenderer';
import { DocumentClassifier } from './DocumentClassifier';
import { DocumentTextParser } from './DocumentTextParser';
import { ImagePreprocessor } from './ImagePreprocessor';
import { OcrDocumentResult, OcrProgress, ParsedDocumentFields, OcrPageResult } from './ocr-types';

export interface OcrVariantEvaluation {
  variant: 'ORIGINAL' | 'CONTRAST' | 'THRESHOLD';
  text: string;
  confidence: number;
  qualityScore: number;
  classification: ReturnType<typeof DocumentClassifier.classify>;
  parsedFields: ReturnType<typeof DocumentTextParser.parse>;
}

export class LocalOcrEngine {
  private static workerPromise: Promise<Worker> | null = null;
  private static activeLang: string = '';
  
  public static workerAssetLocation: 'LOCAL' | 'CDN' = 'LOCAL';
  public static coreAssetLocation: 'LOCAL' | 'CDN' = 'LOCAL';
  public static langAssetLocation: 'LOCAL' | 'CDN' = 'LOCAL';
  public static pdfWorkerLocation: 'LOCAL' | 'CDN' = 'LOCAL';
  public static isFullyOffline: boolean = true;
  public static initialWorkerLoadMs: number = 0;

  public static evaluateVariant(
    variant: 'ORIGINAL' | 'CONTRAST' | 'THRESHOLD',
    text: string,
    confidence: number,
    filename: string
  ): OcrVariantEvaluation {
    const cleanText = text || '';
    const classification = DocumentClassifier.classify(cleanText);
    const parsedFields = DocumentTextParser.parse(cleanText, classification.documentType, filename);

    let qualityScore = confidence * 30; // Max 30 points from raw confidence

    // Document type classification bonus (30 points)
    if (classification.documentType !== 'unknown') {
      qualityScore += classification.confidence * 30;
    }

    // Extracted identity fields bonus (15 points per field)
    let extractedFieldCount = 0;
    if (parsedFields.documents?.aadhaar?.number) extractedFieldCount++;
    if (parsedFields.documents?.pan?.number) extractedFieldCount++;
    if (parsedFields.documents?.voter_id?.number) extractedFieldCount++;
    if (parsedFields.customer?.full_name) extractedFieldCount++;
    if (parsedFields.customer?.dob) extractedFieldCount++;
    if (parsedFields.customer?.father_name) extractedFieldCount++;
    if (parsedFields.customer?.spouse_name) extractedFieldCount++;
    if (parsedFields.address?.pincode) extractedFieldCount++;

    qualityScore += extractedFieldCount * 15;

    // Alphanumeric density bonus (up to 15 points)
    const totalChars = cleanText.length;
    if (totalChars > 10) {
      const alphaNumChars = cleanText.replace(/[^A-Za-z0-9]/g, '').length;
      const density = alphaNumChars / totalChars;
      qualityScore += density * 15;
    }

    return {
      variant,
      text: cleanText,
      confidence,
      qualityScore,
      classification,
      parsedFields
    };
  }

  public static async getWorker(lang: string = 'eng', onProgress?: (status: string) => void): Promise<Worker> {
    if (this.workerPromise && this.activeLang === lang) {
      return this.workerPromise;
    }

    const startTime = Date.now();

    if (this.workerPromise && this.activeLang !== lang) {
      const oldWorker = await this.workerPromise;
      await oldWorker.terminate();
      this.workerPromise = null;
    }

    this.activeLang = lang;
    if (onProgress) onProgress(`Initializing Local Tesseract Worker (${lang})...`);

    this.workerPromise = (async () => {
      const isBrowser = typeof window !== 'undefined';
      
      const options: any = {
        logger: (m: any) => {
          if (onProgress && m.status) {
            const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
            onProgress(`${m.status} (${pct}%)`);
          }
        }
      };

      if (isBrowser) {
        options.workerPath = '/ocr/worker/worker.min.js';
        options.corePath = '/ocr/core';
        options.langPath = '/ocr/lang';
        options.cachePath = '/ocr/lang';
        options.gzip = true;
      } else {
        try {
          const path = require('path');
          options.langPath = path.join(process.cwd(), 'public', 'ocr', 'lang');
          options.cachePath = path.join(process.cwd(), 'public', 'ocr', 'lang');
          options.gzip = true;
        } catch {}
      }

      try {
        const worker = await createWorker(lang, 1, options);
        this.initialWorkerLoadMs = Date.now() - startTime;
        return worker;
      } catch (err: any) {
        const errorDetail = (err && (typeof err === 'string' ? err : err.message || (typeof err === 'object' && Object.keys(err).length > 0 ? JSON.stringify(err) : ''))) || '';
        const cleanMessage = (errorDetail && errorDetail !== 'undefined' && errorDetail !== '[object Object]' && errorDetail !== '{}')
          ? errorDetail
          : "A required offline OCR asset is missing or failed to initialize.";
        console.error("Local OCR Worker initialization failed:", cleanMessage);
        throw new Error(`Local OCR could not start: ${cleanMessage}`);
      }
    })();

    return this.workerPromise;
  }

  public static async processSingleImage(
    imageSource: any,
    filename: string = 'image.jpg',
    lang: string = 'eng',
    onProgress?: (progress: OcrProgress) => void
  ): Promise<{ ocrResult: OcrDocumentResult; parsedFields: ParsedDocumentFields }> {
    const worker = await this.getWorker(lang, (msg) => {
      if (onProgress) onProgress({ stage: 'Initializing Local OCR worker...', detail: msg });
    });

    if (onProgress) onProgress({ stage: `Reading document text (${filename})...` });

    // PASS 1: Original Image
    const retA = await worker.recognize(imageSource);
    const textA = retA.data.text || '';
    const confA = (retA.data.confidence || 0) / 100;
    const evalA = this.evaluateVariant('ORIGINAL', textA, confA, filename);

    let bestEval = evalA;

    // Fast-path: If Original Image is already good (classified & confidence >= 0.55 & quality >= 45), skip preprocessing!
    const isOriginalGood = evalA.classification.documentType !== 'unknown' && evalA.confidence >= 0.55 && evalA.qualityScore >= 45;

    if (!isOriginalGood) {
      // PASS 2: Adaptive Contrast + Grayscale Preprocessing
      if (onProgress) onProgress({ stage: `Enhancing image contrast for local OCR (${filename})...` });
      try {
        const processedSrcB = await ImagePreprocessor.processVariantB(imageSource);
        const retB = await worker.recognize(processedSrcB);
        const textB = retB.data.text || '';
        const confB = (retB.data.confidence || 0) / 100;
        const evalB = this.evaluateVariant('CONTRAST', textB, confB, filename);

        if (evalB.qualityScore > bestEval.qualityScore) {
          bestEval = evalB;
        }
      } catch (err) {
        // Fallback gracefully to Original if canvas preprocessing is unavailable
      }

      // PASS 3: Threshold Binarization ONLY IF B is still poor (unclassified & quality score < 30)
      if (bestEval.classification.documentType === 'unknown' && bestEval.qualityScore < 30) {
        if (onProgress) onProgress({ stage: `Applying adaptive thresholding (${filename})...` });
        try {
          const processedSrcC = await ImagePreprocessor.processVariantC(imageSource);
          const retC = await worker.recognize(processedSrcC);
          const textC = retC.data.text || '';
          const confC = (retC.data.confidence || 0) / 100;
          const evalC = this.evaluateVariant('THRESHOLD', textC, confC, filename);

          if (evalC.qualityScore > bestEval.qualityScore) {
            bestEval = evalC;
          }
        } catch (err) {
          // Fallback gracefully
        }
      }
    }

    const { text, confidence, variant, parsedFields } = bestEval;
    parsedFields.confidence_summary = {
      overall: confidence,
      low_confidence_fields: confidence < 0.6 ? ['all'] : []
    };

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      text,
      confidence,
      selectedVariant: variant,
      originalConfidence: confA,
      processedConfidence: confidence,
      qualityScore: bestEval.qualityScore
    };

    const ocrResult: OcrDocumentResult = {
      filename,
      pages: [pageResult],
      fullText: text,
      averageConfidence: confidence
    };

    return { ocrResult, parsedFields };
  }

  public static async processFile(
    fileInput: any,
    lang: string = 'eng',
    onProgress?: (progress: OcrProgress) => void
  ): Promise<{ ocrResult: OcrDocumentResult; parsedFields: ParsedDocumentFields }> {
    let filename = 'document.jpg';
    if (typeof fileInput === 'string') {
      filename = fileInput.split(/[\/\\]/).pop() || fileInput;
    } else if (fileInput && fileInput.name) {
      filename = fileInput.name;
    }

    const isPdf = filename.toLowerCase().endsWith('.pdf') || (fileInput && fileInput.type && fileInput.type.includes('pdf'));

    if (!isPdf) {
      let sourceToProcess = fileInput;
      if (fileInput && fileInput.path) {
        sourceToProcess = fileInput.path;
      }
      return this.processSingleImage(sourceToProcess, filename, lang, onProgress);
    }

    // PDF Processing: Render each page locally and apply adaptive OCR
    if (onProgress) onProgress({ stage: 'Rendering PDF pages locally...' });

    let buffer: ArrayBuffer;
    if (fileInput && typeof fileInput.arrayBuffer === 'function') {
      buffer = await fileInput.arrayBuffer();
    } else if (fileInput instanceof ArrayBuffer) {
      buffer = fileInput;
    } else if (fileInput && fileInput.buffer instanceof ArrayBuffer) {
      buffer = fileInput.buffer;
    } else {
      buffer = new ArrayBuffer(0);
    }

    const pages = await PdfRenderer.renderPdfPages(buffer);

    const worker = await this.getWorker(lang, (msg) => {
      if (onProgress) onProgress({ stage: 'Initializing Local OCR worker...', detail: msg });
    });

    const ocrPages: OcrPageResult[] = [];
    let fullText = '';
    let totalConf = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (onProgress) {
        onProgress({
          stage: `Reading page ${page.pageNumber} of ${pages.length} (${filename})…`,
          currentItem: i + 1,
          totalItems: pages.length
        });
      }

      let text = '';
      let conf = 0.85;
      let selectedVariant: 'ORIGINAL' | 'CONTRAST' | 'THRESHOLD' = 'ORIGINAL';

      if (page.dataUrl) {
        const retA = await worker.recognize(page.dataUrl);
        const textA = retA.data.text || '';
        const confA = (retA.data.confidence || 0) / 100;
        const evalA = this.evaluateVariant('ORIGINAL', textA, confA, filename);

        let bestEval = evalA;
        const isOriginalGood = evalA.classification.documentType !== 'unknown' && evalA.confidence >= 0.55 && evalA.qualityScore >= 45;

        if (!isOriginalGood) {
          try {
            const processedSrcB = await ImagePreprocessor.processVariantB(page.dataUrl);
            const retB = await worker.recognize(processedSrcB);
            const textB = retB.data.text || '';
            const confB = (retB.data.confidence || 0) / 100;
            const evalB = this.evaluateVariant('CONTRAST', textB, confB, filename);

            if (evalB.qualityScore > bestEval.qualityScore) {
              bestEval = evalB;
            }
          } catch {}

          if (bestEval.classification.documentType === 'unknown' && bestEval.qualityScore < 30) {
            try {
              const processedSrcC = await ImagePreprocessor.processVariantC(page.dataUrl);
              const retC = await worker.recognize(processedSrcC);
              const textC = retC.data.text || '';
              const confC = (retC.data.confidence || 0) / 100;
              const evalC = this.evaluateVariant('THRESHOLD', textC, confC, filename);

              if (evalC.qualityScore > bestEval.qualityScore) {
                bestEval = evalC;
              }
            } catch {}
          }
        }

        text = bestEval.text;
        conf = bestEval.confidence;
        selectedVariant = bestEval.variant;
      } else if (page.rawTextFallback) {
        text = page.rawTextFallback;
        conf = 0.9;
      }

      ocrPages.push({
        pageNumber: page.pageNumber,
        text,
        confidence: conf,
        selectedVariant
      });
      fullText += `--- Page ${page.pageNumber} ---\n` + text + '\n';
      totalConf += conf;
    }

    const avgConf = pages.length > 0 ? totalConf / pages.length : 0;

    if (onProgress) onProgress({ stage: 'Detecting document type...' });
    const classification = DocumentClassifier.classify(fullText);

    if (onProgress) onProgress({ stage: 'Extracting fields...' });
    const parsedFields = DocumentTextParser.parse(fullText, classification.documentType, filename);
    parsedFields.confidence_summary = {
      overall: avgConf,
      low_confidence_fields: avgConf < 0.6 ? ['all'] : []
    };

    const ocrResult: OcrDocumentResult = {
      filename,
      pages: ocrPages,
      fullText,
      averageConfidence: avgConf
    };

    return { ocrResult, parsedFields };
  }

  public static async terminate(): Promise<void> {
    if (this.workerPromise) {
      const worker = await this.workerPromise;
      await worker.terminate();
      this.workerPromise = null;
      this.activeLang = '';
    }
  }
}
