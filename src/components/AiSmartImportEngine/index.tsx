import { useState, useEffect, useRef } from "react";
import { Bot, CheckCircle2, Copy, Sparkles, ChevronDown, UserPlus } from "lucide-react";
import { ImportJob, MergedResult, AiProvider, Conflict, ConflictField } from "./types";
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
import { suggestNameComponentsFromFullName } from "./nameUtils";
import { resolveRelationshipConflictPayload } from "./relationshipUtils";
import { hasMeaningfulNativeScript } from "@/lib/names/nameSafety";

export interface SmartImportMetadata {
  sourceDocuments?: Array<{ name: string; side: DocumentSide }>;
  conflicts?: Conflict[];
  mergedResult?: MergedResult;
  candidatePhotoUrl?: string;
  candidatePhotoStoragePath?: string;
  nameSuggestion?: { first_name: string; middle_name: string; last_name: string; isReliable: boolean } | null;
  /**
   * Native-script name candidate extracted from the document.
   * MUST NOT be silently auto-filled — requires explicit operator confirmation via UI.
   */
  nativeNameCandidate?: { value: string; provenance: string } | null;
}

export interface AiSmartImportEngineProps {
  onAutoFill: (data: Record<string, unknown>, meta?: SmartImportMetadata, sessionToken?: number) => void;
  onSwitchToManual?: () => void;
  autoAdvance?: boolean;
  sessionToken?: number;
}

export function AiSmartImportEngine({ 
  onAutoFill, 
  onSwitchToManual, 
  autoAdvance = true,
  sessionToken
}: AiSmartImportEngineProps) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [mergedResult, setMergedResult] = useState<MergedResult | null>(null);
  const [inputMethod, setInputMethod] = useState<'file' | 'json'>('file');
  const [jsonText, setJsonText] = useState("");
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const moreOptionsRef = useRef<HTMLDivElement>(null);
  const moreOptionsButtonRef = useRef<HTMLButtonElement>(null);

  // Close More Options menu on click outside or Escape key
  useEffect(() => {
    if (!showMoreOptions) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (moreOptionsRef.current && !moreOptionsRef.current.contains(e.target as Node)) {
        setShowMoreOptions(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowMoreOptions(false);
        moreOptionsButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMoreOptions]);

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

      if (autoAdvance) {
        // Resolve data from merged result directly for form autofill
        const conflictFields = new Set(merged.conflicts.map(c => c.field));
        const hasRelConflict = merged.conflicts.some(c => (c.field as string) === 'relationship_interpretation');
        const flat: Record<string, unknown> = {};
        const mergedDataRecord = merged.data as Record<string, { value?: unknown } | undefined>;
        Object.keys(merged.data).forEach(key => {
          if (key !== 'profile_photo') {
            if (conflictFields.has(key as ConflictField)) {
              flat[key] = undefined;
            } else if (hasRelConflict && (key === 'father_name' || key === 'spouse_name')) {
              flat[key] = undefined;
            } else {
              flat[key] = mergedDataRecord[key]?.value;
            }
          }
        });

        // Resolve name suggestion if no explicit first/last name
        const hasExplicitNameComponents = !!(merged.data.first_name?.value && merged.data.last_name?.value);
        let nameSug = null;
        if (!hasExplicitNameComponents && flat.full_name) {
          nameSug = suggestNameComponentsFromFullName(flat.full_name as string);
          if (nameSug && nameSug.isReliable) {
            flat.first_name = nameSug.first_name;
            flat.middle_name = nameSug.middle_name;
            flat.last_name = nameSug.last_name;
          }
        }

        // Native name: extract candidate but DO NOT auto-fill — operator must explicitly confirm.
        const docNativeName: string | undefined = merged.data.original_language_name?.value;
        delete flat.original_language_name; // never silently injected
        const nativeNameCandidate = (docNativeName && hasMeaningfulNativeScript(docNativeName))
          ? { value: docNativeName, provenance: 'JSON Data' }
          : null;

        const finalData = resolveRelationshipConflictPayload(flat, merged.conflicts, merged.data);
        onAutoFill(finalData, {
          sourceDocuments: [{ name: "JSON Data", side: "Both" }],
          conflicts: merged.conflicts,
          mergedResult: merged,
          nameSuggestion: nameSug,
          nativeNameCandidate
        }, sessionToken);
        toast.success("Customer details ready for review");
      } else {
        toast.success(`Customer JSON parsed & ready for review`);
      }
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

    const currentSession = sessionToken;
    setIsExtracting(true);
    const toastId = toast.loading("Reading documents & preparing details...");

    try {
      const formData = new FormData();
      for (const sf of stagedFiles) {
        formData.append("files", sf.file);
      }

      const res = await extractDataFromDocuments(formData) as 
        | { success: true; data: Record<string, unknown>; perfSummary?: ImportJob['perfSummary']; code?: string; warning?: string }
        | { success: false; error?: string; code?: string };

      if (sessionToken !== undefined && currentSession !== undefined && sessionToken !== currentSession) {
        return; // Session changed while extraction was running — discard!
      }

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

      const recordedSources = stagedFiles.map(sf => ({ name: sf.file.name, side: sf.side }));

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

      if (autoAdvance) {
        // Resolve data from merged result directly for form autofill
        const conflictFields = new Set(merged.conflicts.map(c => c.field));
        const hasRelConflict = merged.conflicts.some(c => (c.field as string) === 'relationship_interpretation');
        const flat: Record<string, unknown> = {};
        const mergedDataRecord = merged.data as Record<string, { value?: unknown } | undefined>;
        Object.keys(merged.data).forEach(key => {
          if (key !== 'profile_photo') {
            if (conflictFields.has(key as ConflictField)) {
              flat[key] = undefined;
            } else if (hasRelConflict && (key === 'father_name' || key === 'spouse_name')) {
              flat[key] = undefined;
            } else {
              flat[key] = mergedDataRecord[key]?.value;
            }
          }
        });

        // Resolve name suggestion if no explicit first/last name
        const hasExplicitNameComponents = !!(merged.data.first_name?.value && merged.data.last_name?.value);
        let nameSug = null;
        if (!hasExplicitNameComponents && flat.full_name) {
          nameSug = suggestNameComponentsFromFullName(flat.full_name as string);
          if (nameSug && nameSug.isReliable) {
            flat.first_name = nameSug.first_name;
            flat.middle_name = nameSug.middle_name;
            flat.last_name = nameSug.last_name;
          }
        }

        // Native name: extract candidate but DO NOT auto-fill — operator must explicitly confirm.
        const docNativeName: string | undefined = merged.data.original_language_name?.value;
        delete flat.original_language_name; // never silently injected
        const nativeNameCandidate = (docNativeName && hasMeaningfulNativeScript(docNativeName))
          ? { value: docNativeName, provenance: recordedSources.map(s => s.name).join(', ') }
          : null;

        const finalData = resolveRelationshipConflictPayload(flat, merged.conflicts, merged.data);
        
        onAutoFill(finalData, {
          sourceDocuments: recordedSources,
          conflicts: merged.conflicts,
          mergedResult: merged,
          candidatePhotoStoragePath: merged.data.profile_photo?.storage_path,
          nameSuggestion: nameSug,
          nativeNameCandidate
        }, currentSession);

        if (res.warning) {
          toast.info(res.warning, { id: toastId });
        } else {
          toast.success("Documents processed — Review customer details below", { id: toastId });
        }
      } else {
        if (res.warning) {
          toast.info(res.warning, { id: toastId });
        } else {
          toast.success("Document analysis complete — Review extracted details", { id: toastId });
        }
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
    onAutoFill(finalData, undefined, sessionToken);
    toast.success("Form Auto-Filled Successfully");
  };

  return (
    <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl shadow-xs mb-6 transition-all">

      {/* Reading Documents progress */}
      {isExtracting && (
        <div className="px-5 sm:px-6 py-3.5 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 rounded-t-2xl animate-in fade-in duration-200">
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-950 dark:text-blue-200">Reading customer details...</p>
              <p className="text-[11px] text-blue-700/90 dark:text-blue-300/90 truncate">GCDS is reading the documents and preparing the customer details for you.</p>
            </div>
          </div>
        </div>
      )}

      {/* Primary Document Upload Surface */}
      {inputMethod === 'file' && (
        <div className="p-4 sm:p-6 space-y-4">
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

          {/* Secondary Action: Manual Entry & Progressive Disclosure */}
          <div className="pt-3 flex items-center justify-between gap-2.5 text-xs border-t border-zinc-100 dark:border-zinc-800/80">
            {onSwitchToManual ? (
              <button
                type="button"
                onClick={onSwitchToManual}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-[38px] rounded-xl border border-zinc-200 dark:border-zinc-700 font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                <span>Enter details manually</span>
              </button>
            ) : <div />}

            <div ref={moreOptionsRef} className="relative shrink-0">
              <button
                ref={moreOptionsButtonRef}
                type="button"
                onClick={() => setShowMoreOptions(prev => !prev)}
                aria-haspopup="menu"
                aria-expanded={showMoreOptions}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 inline-flex items-center gap-1.5 px-3 h-[38px] rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-medium cursor-pointer"
              >
                <span>More options</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showMoreOptions ? "rotate-180" : ""}`} />
              </button>

              {showMoreOptions && (
                <div
                  role="menu"
                  aria-label="More import options"
                  className="absolute bottom-full right-0 mb-2 z-30 w-56 sm:w-60 max-w-[calc(100vw-2.5rem)] animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/90 dark:border-zinc-700 shadow-lg p-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setInputMethod('json');
                        setShowMoreOptions(false);
                      }}
                      className="w-full text-left p-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 text-zinc-700 dark:text-zinc-200 transition-colors group flex items-start gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          Paste JSON data
                        </div>
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          Advanced import option
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* JSON paste area */}
      {inputMethod === 'json' && (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Paste Customer Details (JSON)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Paste a JSON block with customer data.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInputMethod('file')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
            >
              ← Back to Document Upload
            </button>
          </div>

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
            className="w-full p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[220px]"
          />
          <div className="flex justify-end space-x-3">
            {jsonText.trim() && (
              <button
                type="button"
                onClick={() => setJsonText("")}
                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 transition-colors font-semibold text-xs"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleAddJson}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-xs shadow-sm flex items-center"
            >
              <Bot className="w-4 h-4 mr-1.5" /> Read Customer Details
            </button>
          </div>
        </div>
      )}

      {/* Review Panel Overlay (for non-autoAdvance consumers) */}
      {!autoAdvance && mergedResult && (
        <ReviewPanel result={mergedResult} onConfirm={handleConfirmReview} />
      )}
    </div>
  );
}
