"use client";

import { useState, useEffect, useRef } from "react";
import { Bot, FileImage, CheckCircle2, Copy } from "lucide-react";
import { ImportJob, MergedResult, AiProvider } from "./types";
import { DataNormalizer } from "./DataNormalizer";
import { MergeEngine } from "./MergeEngine";
import { ReviewPanel } from "./components/ReviewPanel";
import { JsonAiGenerator } from "./components/JsonAiGenerator";
import { PremiumDropzone } from "./components/PremiumDropzone";
import { 
  UPLOAD_CONSTANTS, 
  DocumentSide, 
  StagedFileItem, 
  FileValidationError, 
  validateSideAssignments,
  isOfficeDocument
} from "./uploadConstants";
import { JSONValidator } from "@/lib/ai/parser/validator";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { extractDataFromDocuments } from "@/app/(dashboard)/customers/ai-actions";

interface AiSmartImportEngineProps {
  onAutoFill: (data: Record<string, unknown>) => void;
}

export function AiSmartImportEngine({ onAutoFill }: AiSmartImportEngineProps) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [mergedResult, setMergedResult] = useState<MergedResult | null>(null);
  const [inputMethod, setInputMethod] = useState<'file' | 'json'>('file');
  const [jsonText, setJsonText] = useState("");
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  // Cleanup all allocated Object URLs on component unmount
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const handleFilesAdded = (files: File[]) => {
    if (!files || files.length === 0) return;

    const newErrors: FileValidationError[] = [];
    const validNewItems: StagedFileItem[] = [];
    let currentTotal = stagedFiles.length;

    for (const file of files) {
      if (currentTotal >= UPLOAD_CONSTANTS.MAX_FILES_PER_BATCH) {
        newErrors.push({
          id: uuidv4(),
          fileName: file.name,
          reason: `Maximum batch limit of ${UPLOAD_CONSTANTS.MAX_FILES_PER_BATCH} documents reached.`,
          type: 'batch_limit'
        });
        break;
      }

      // 1. Check duplicate
      const isDupInStaged = stagedFiles.some(
        sf => sf.file.name === file.name && sf.file.size === file.size
      );
      const isDupInNew = validNewItems.some(
        item => item.file.name === file.name && item.file.size === file.size
      );

      if (isDupInStaged || isDupInNew) {
        newErrors.push({
          id: uuidv4(),
          fileName: file.name,
          reason: `This document is already in the upload queue.`,
          type: 'duplicate'
        });
        continue;
      }

      // 2. Check format & format rejections
      const lowerName = file.name.toLowerCase();
      const isTiff = lowerName.endsWith('.tif') || lowerName.endsWith('.tiff') || file.type.includes('tiff');
      if (isTiff) {
        newErrors.push({
          id: uuidv4(),
          fileName: file.name,
          reason: `TIFF format is not supported for this release. Please convert to PDF, JPG, PNG, or WEBP.`,
          type: 'unsupported_type'
        });
        continue;
      }

      if (lowerName.endsWith('.doc')) {
        newErrors.push({
          id: uuidv4(),
          fileName: file.name,
          reason: `Legacy .doc format is not supported. Please save as modern .docx format.`,
          type: 'unsupported_type'
        });
        continue;
      }

      if (lowerName.endsWith('.xls')) {
        newErrors.push({
          id: uuidv4(),
          fileName: file.name,
          reason: `Legacy .xls format is not supported. Please save as modern .xlsx format.`,
          type: 'unsupported_type'
        });
        continue;
      }

      if (lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx') || file.type.includes('presentation') || file.type.includes('powerpoint')) {
        newErrors.push({
          id: uuidv4(),
          fileName: file.name,
          reason: `PowerPoint presentations are not supported. Please upload PDF, DOCX, XLSX, or image documents.`,
          type: 'unsupported_type'
        });
        continue;
      }

      const hasAllowedExt = UPLOAD_CONSTANTS.ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
      const hasAllowedMime = (UPLOAD_CONSTANTS.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type);

      if (!hasAllowedExt && !hasAllowedMime) {
        newErrors.push({
          id: uuidv4(),
          fileName: file.name,
          reason: `Unsupported format. Please upload PDF, DOCX, XLSX, JPG, PNG, or WEBP documents.`,
          type: 'unsupported_type'
        });
        continue;
      }

      // 3. Check file size
      if (file.size > UPLOAD_CONSTANTS.MAX_FILE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        newErrors.push({
          id: uuidv4(),
          fileName: file.name,
          reason: `File size (${sizeMb} MB) exceeds the maximum limit of ${UPLOAD_CONSTANTS.MAX_FILE_SIZE_LABEL}.`,
          type: 'size_exceeded'
        });
        continue;
      }

      // Valid file: create preview if image
      let previewUrl: string | undefined = undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);
      }

      validNewItems.push({
        id: uuidv4(),
        file,
        previewUrl,
        side: isOfficeDocument(file.name) ? 'Single' : UPLOAD_CONSTANTS.DEFAULT_SIDE // Office docs always normalized to 'Single'
      });
      currentTotal++;
    }

    if (newErrors.length > 0) {
      setValidationErrors(prev => [...newErrors, ...prev]);
    }

    if (validNewItems.length > 0) {
      setStagedFiles(prev => [...prev, ...validNewItems]);
    }
  };

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles(prev => {
      const target = prev.find(sf => sf.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter(sf => sf.id !== id);
    });
  };

  const handleSideChanged = (id: string, side: DocumentSide) => {
    setStagedFiles(prev => prev.map(sf => {
      if (sf.id !== id) return sf;
      if (isOfficeDocument(sf.file.name)) {
        return { ...sf, side: 'Single' };
      }
      return { ...sf, side };
    }));
  };

  const handleClearAll = () => {
    stagedFiles.forEach(sf => {
      if (sf.previewUrl) {
        URL.revokeObjectURL(sf.previewUrl);
        objectUrlsRef.current.delete(sf.previewUrl);
      }
    });
    setStagedFiles([]);
  };

  const handleDismissError = (id: string) => {
    setValidationErrors(prev => prev.filter(err => err.id !== id));
  };

  const handleDismissAllErrors = () => {
    setValidationErrors([]);
  };

  const handleAddJson = () => {
    if (!jsonText.trim()) return toast.error("Please paste JSON data");

    try {
      const rawData = JSON.parse(jsonText);
      const normalizedData = DataNormalizer.normalize(rawData);
      
      if (Object.keys(normalizedData).length === 0) {
        return toast.error("AI extracted a response, but no usable customer fields were found.");
      }
      
      const newJob: ImportJob = {
        id: uuidv4(),
        documentType: 'Manual JSON',
        provider: 'manual',
        source: 'json',
        jsonText,
        status: 'completed',
        rawResponse: rawData,
        normalizedData,
        version: 1
      };

      const updatedJobs = [newJob, ...jobs];
      setJobs(updatedJobs);
      setJsonText("");
      
      const merged = MergeEngine.merge(updatedJobs);
      setMergedResult(merged);
      toast.success(`Customer JSON parsed & ready for review`);
    } catch {
      toast.error("Invalid JSON format");
    }
  };

  const handleExtractMultiDocuments = async () => {
    if (stagedFiles.length === 0) return toast.error("Please select at least one document to analyze");
    if (stagedFiles.length > UPLOAD_CONSTANTS.MAX_FILES_PER_BATCH) {
      return toast.error(`Maximum ${UPLOAD_CONSTANTS.MAX_FILES_PER_BATCH} documents allowed per import batch`);
    }

    // Validate side selector edge cases
    const sideError = validateSideAssignments(stagedFiles);
    if (sideError) {
      return toast.error(sideError);
    }

    setIsExtracting(true);
    const toastId = toast.loading("Reading document & extracting information...");

    try {
      const formData = new FormData();
      for (const sf of stagedFiles) {
        formData.append("files", sf.file);
      }

      const res = await extractDataFromDocuments(formData) as 
        | { success: true; data: Record<string, unknown>; perfSummary?: ImportJob['perfSummary']; code?: string; warning?: string }
        | { success: false; error?: string; code?: string };
      if (!res.success) {
        throw new Error(res.error || "Document extraction failed.");
      }
      if (!res.data) {
        throw new Error("No data returned from document extraction.");
      }

      // Explicit side mapping:
      // Front -> frontFile
      // Back -> backFile
      // Both -> frontFile (single-document containing both sides)
      // Single -> frontFile/backFile remain undefined (Case E)
      const frontItem = stagedFiles.find(sf => sf.side === 'Front');
      const backItem = stagedFiles.find(sf => sf.side === 'Back');
      const bothItem = stagedFiles.find(sf => sf.side === 'Both');

      let jobFrontFile: File | undefined = undefined;
      let jobBackFile: File | undefined = undefined;

      if (frontItem) {
        jobFrontFile = frontItem.file;
      } else if (bothItem) {
        jobFrontFile = bothItem.file;
      }

      if (backItem) {
        jobBackFile = backItem.file;
      }

      const normalizedData = DataNormalizer.normalize(res.data);
      const detectedDocs = res.data.detected_documents as Array<{ detected_type?: string }> | undefined;
      const resolvedProvider = (res.perfSummary?.extractionSource || res.perfSummary?.provider || 'ocr-space') as AiProvider;
      const newJob: ImportJob = {
        id: uuidv4(),
        documentType: detectedDocs?.[0]?.detected_type || 'unknown',
        provider: resolvedProvider,
        source: 'file',
        frontFile: jobFrontFile,
        backFile: jobBackFile,
        status: 'completed',
        rawResponse: res.data,
        normalizedData,
        version: 1,
        perfSummary: res.perfSummary || {
          provider: resolvedProvider,
          model: 'local-deterministic',
          extractionSource: resolvedProvider,
          aiEnhancementUsed: false,
          documentCount: stagedFiles.length,
          imagePrepTime: 0,
          primaryAttemptDuration: 1000,
          fallbackAttemptDuration: 0,
          apiTime: 1000,
          jsonParseTime: 0,
          normalizationTime: 0,
          dbLogTime: 0,
          totalTime: 1000
        }
      };

      // Clean up preview URLs
      stagedFiles.forEach(sf => {
        if (sf.previewUrl) {
          URL.revokeObjectURL(sf.previewUrl);
          objectUrlsRef.current.delete(sf.previewUrl);
        }
      });

      setJobs([newJob]);
      setStagedFiles([]);

      const merged = MergeEngine.merge([newJob]);
      setMergedResult(merged);

      if (res.warning) {
        toast.info(res.warning, { id: toastId });
      } else {
        toast.success("Document analysis complete — Review extracted details", { id: toastId });
      }
    } catch (error: unknown) {
      const errObj = error as { message?: string } | null;
      let errMsg = errObj?.message || "Failed to extract information from documents";
      if (errMsg.includes("OCR_SPACE_API_KEY is missing") || errMsg.includes("OCR.space is not configured")) {
        errMsg = "OCR service is not configured. Please configure the server OCR API key.";
      }
      if (errMsg.includes(".venv") || errMsg.includes("python") || errMsg.includes("Traceback") || errMsg.includes("tools/markitdown-worker")) {
        errMsg = "Document extraction failed during preprocessing. Please try a different document or format.";
      }
      if (errMsg.includes("GEMINI_API_KEY") || errMsg.includes("OPENROUTER_API_KEY")) {
        errMsg = "Unable to read document automatically. Please enter details manually.";
      }
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsExtracting(false);
    }
  };


  const handleConfirmReview = (finalData: Record<string, unknown>) => {
    onAutoFill(finalData);
    toast.success("Form Auto-Filled Successfully");
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl shadow-sm relative overflow-hidden mb-8">
      {/* Decorative Bot */}
      <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
        <Bot className="h-48 w-48 text-indigo-600" />
      </div>

      <div className="p-6 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="bg-indigo-600 p-2.5 rounded-xl mr-4 shadow-md shadow-indigo-200 dark:shadow-none">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-indigo-950 dark:text-indigo-200 tracking-tight">AI Smart Import Engine</h2>
              <p className="text-sm text-indigo-700/80 dark:text-indigo-300/80 font-medium mt-0.5">
                Zero-Click Multi-Document AI Auto-Detection & Extraction
              </p>
            </div>
          </div>
        </div>

        {/* Input Method Tabs */}
        <div className="flex border-b border-indigo-100 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-900/20 rounded-t-xl overflow-hidden">
          <button 
            onClick={() => setInputMethod('file')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors flex justify-center items-center ${inputMethod === 'file' ? 'text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 bg-white dark:bg-zinc-900' : 'text-zinc-500 hover:text-indigo-600'}`}
          >
            <FileImage className="w-4 h-4 mr-2" /> Select Documents
          </button>
          <button 
            onClick={() => setInputMethod('json')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors flex justify-center items-center ${inputMethod === 'json' ? 'text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 bg-white dark:bg-zinc-900' : 'text-zinc-500 hover:text-indigo-600'}`}
          >
            <Bot className="w-4 h-4 mr-2" /> Paste JSON
          </button>
        </div>

        <div className="p-4 bg-white/60 dark:bg-zinc-900/60 rounded-b-xl border border-indigo-100 dark:border-indigo-800/50">
          {inputMethod === 'file' ? (
            <PremiumDropzone
              stagedFiles={stagedFiles}
              onFilesAdded={handleFilesAdded}
              onFileRemoved={handleRemoveStagedFile}
              onSideChanged={handleSideChanged}
              onClearAll={handleClearAll}
              onAnalyze={handleExtractMultiDocuments}
              isExtracting={isExtracting}
              errors={validationErrors}
              onDismissError={handleDismissError}
              onDismissAllErrors={handleDismissAllErrors}
            />
          ) : (
            <div className="space-y-4">
              <JsonAiGenerator onJsonGenerated={(jsonStr) => setJsonText(jsonStr)} />
              
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Customer Extraction JSON Editor
                </label>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (!text || !text.trim()) {
                          toast.error("Clipboard is empty.");
                          return;
                        }
                        const parsed = JSONValidator.cleanAndParse(text);
                        const canonicalJson = {
                          customer: parsed.customer || {},
                          address: parsed.address || {},
                          documents: parsed.documents || {},
                          detected_documents: parsed.detected_documents || [],
                          confidence_summary: parsed.confidence_summary || { overall: 0.9, low_confidence_fields: [] }
                        };
                        setJsonText(JSON.stringify(canonicalJson, null, 2));
                        toast.success("Valid JSON pasted and verified from clipboard!");
                      } catch {
                        toast.error("Clipboard does not contain valid JSON.");
                      }
                    }}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Paste from Clipboard
                  </button>
                  {jsonText.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(jsonText);
                        toast.success("JSON copied to clipboard!");
                      }}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copy JSON
                    </button>
                  )}
                </div>
              </div>

              <textarea 
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder={`{\n  "customer": {\n    "full_name": "Rahul Kumar",\n    "dob": "1995-01-10"\n  }\n}`}
                className="w-full p-4 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[220px]"
              />
              <div className="flex justify-end space-x-3">
                {jsonText.trim() && (
                  <button 
                    type="button" 
                    onClick={() => setJsonText("")}
                    className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 transition-colors font-semibold text-xs"
                  >
                    Clear Box
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={handleAddJson}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-xs shadow-sm flex items-center"
                >
                  <Bot className="w-4 h-4 mr-1.5" /> Parse & Review JSON
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Review Panel Overlay */}
      {mergedResult && (
        <ReviewPanel result={mergedResult} onConfirm={handleConfirmReview} />
      )}
    </div>
  );
}
