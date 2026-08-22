import { createWorker, Worker } from 'tesseract.js';
import { PdfRenderer } from './PdfRenderer';
import { DocumentClassifier } from './DocumentClassifier';
import { DocumentTextParser } from './DocumentTextParser';
import { OcrDocumentResult, OcrProgress, ParsedDocumentFields } from './ocr-types';

export class LocalOcrEngine {
  private static workerPromise: Promise<Worker> | null = null;
  private static activeLang: string = '';
  
  public static workerAssetLocation: 'LOCAL' | 'CDN' = 'LOCAL';
  public static coreAssetLocation: 'LOCAL' | 'CDN' = 'LOCAL';
  public static langAssetLocation: 'LOCAL' | 'CDN' = 'LOCAL';
  public static pdfWorkerLocation: 'LOCAL' | 'CDN' = 'LOCAL';
  public static isFullyOffline: boolean = true;
  public static initialWorkerLoadMs: number = 0;

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
        // Enforce STRICT local-only asset paths in browser without CDN fallback
        options.workerPath = '/ocr/worker/worker.min.js';
        options.corePath = '/ocr/core';
        options.langPath = '/ocr/lang';
        options.cachePath = '/ocr/lang';
        options.gzip = true;
      } else {
        // Node.js test environment local asset paths
        try {
          const path = require('path');
          options.langPath = path.join(process.cwd(), 'public', 'ocr', 'lang');
          options.cachePath = path.join(process.cwd(), 'public', 'ocr', 'lang');
          options.gzip = true;
        } catch {
          // fallback if path require unavailable
        }
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

    const startTime = Date.now();
    const ret = await worker.recognize(imageSource);

    const text = ret.data.text || '';
    const confidence = (ret.data.confidence || 0) / 100;

    if (onProgress) onProgress({ stage: 'Detecting document type...' });
    const classification = DocumentClassifier.classify(text);

    if (onProgress) onProgress({ stage: 'Extracting fields...' });
    const parsedFields = DocumentTextParser.parse(text, classification.documentType, filename);
    parsedFields.confidence_summary = {
      overall: confidence,
      low_confidence_fields: confidence < 0.6 ? ['all'] : []
    };

    const ocrResult: OcrDocumentResult = {
      filename,
      pages: [{ pageNumber: 1, text, confidence }],
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

    // PDF Processing: Render every page to image/canvas locally
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

    const ocrPages = [];
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

      if (page.dataUrl) {
        const ret = await worker.recognize(page.dataUrl);
        text = ret.data.text || '';
        conf = (ret.data.confidence || 0) / 100;
      } else if (page.rawTextFallback) {
        text = page.rawTextFallback;
        conf = 0.9;
      }

      ocrPages.push({
        pageNumber: page.pageNumber,
        text,
        confidence: conf
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
