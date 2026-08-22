"use client";

import { useState } from "react";
import { Bot, Play, UploadCloud, FileImage, Loader2, Trash2, FileText, Sparkles, CheckCircle2 } from "lucide-react";
import { ImportJob, MergedResult } from "./types";
import { DataNormalizer } from "./DataNormalizer";
import { MergeEngine } from "./MergeEngine";
import { ReviewPanel } from "./components/ReviewPanel";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { extractDataFromDocuments } from "@/app/(dashboard)/customers/ai-actions";
import { LocalOcrEngine } from "@/lib/ocr/LocalOcrEngine";

interface AiSmartImportEngineProps {
  onAutoFill: (data: Record<string, any>) => void;
}

export function AiSmartImportEngine({ onAutoFill }: AiSmartImportEngineProps) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [mergedResult, setMergedResult] = useState<MergedResult | null>(null);
  const [inputMethod, setInputMethod] = useState<'file' | 'json'>('file');
  const [jsonText, setJsonText] = useState("");
  const [stagedFiles, setStagedFiles] = useState<{ id: string; file: File; previewUrl?: string }[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const newFiles: { id: string; file: File; previewUrl?: string }[] = [];

    Array.from(fileList).forEach(file => {
      // Check duplicate in stagedFiles by filename and size
      const isDup = stagedFiles.some(sf => sf.file.name === file.name && sf.file.size === file.size);
      if (isDup) return;

      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.tif') || lowerName.endsWith('.tiff') || file.type.includes('tiff')) {
        toast.error(`File ${file.name}: TIFF format is not supported for this release. Please convert to PDF, JPG, PNG, or WEBP.`);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error(`File ${file.name} exceeds 10MB limit`);
        return;
      }

      let previewUrl: string | undefined = undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      newFiles.push({
        id: uuidv4(),
        file,
        previewUrl
      });
    });

    if (newFiles.length > 0) {
      setStagedFiles(prev => [...prev, ...newFiles]);
    }
    // Reset file input value
    e.target.value = "";
  };

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles(prev => prev.filter(sf => sf.id !== id));
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
    } catch (e) {
      toast.error("Invalid JSON format");
    }
  };

  const handleExtractMultiDocuments = async () => {
    if (stagedFiles.length === 0) return toast.error("Please select at least one document to extract");
    if (stagedFiles.length > 10) return toast.error("Maximum 10 documents allowed per import batch");

    setIsExtracting(true);
    const toastId = toast.loading("Preparing documents...");

    try {
      const newJobs: ImportJob[] = [];

      for (let i = 0; i < stagedFiles.length; i++) {
        const sf = stagedFiles[i];
        toast.loading(`Processing file ${i + 1} of ${stagedFiles.length} (${sf.file.name})…`, { id: toastId });

        const startTime = Date.now();
        const { parsedFields } = await LocalOcrEngine.processFile(sf.file, 'eng', (progress) => {
          if (progress.detail) {
            toast.loading(`[${sf.file.name}] ${progress.stage} - ${progress.detail}`, { id: toastId });
          } else {
            toast.loading(`[${sf.file.name}] ${progress.stage}`, { id: toastId });
          }
        });

        const elapsed = Date.now() - startTime;

        const rawData = {
          customer: parsedFields.customer,
          address: parsedFields.address,
          documents: parsedFields.documents,
          detected_documents: parsedFields.detected_documents,
          diagnostic_data: parsedFields.diagnostic_data
        };

        const normalizedData = DataNormalizer.normalize(rawData);
        const docType = parsedFields.detected_documents?.[0]?.detected_type || 'unknown';

        newJobs.push({
          id: uuidv4(),
          documentType: docType,
          provider: 'manual',
          source: 'file',
          frontFile: sf.file,
          status: 'completed',
          rawResponse: rawData,
          normalizedData,
          version: 1,
          perfSummary: {
            provider: 'Local Tesseract.js OCR',
            model: 'browser-wasm-v5',
            documentCount: 1,
            imagePrepTime: 0,
            primaryAttemptDuration: elapsed,
            fallbackAttemptDuration: 0,
            apiTime: elapsed,
            jsonParseTime: 0,
            normalizationTime: 0,
            dbLogTime: 0,
            totalTime: elapsed
          }
        });
      }

      if (newJobs.length === 0) {
        toast.error("No valid document data extracted", { id: toastId });
        return;
      }

      toast.loading("Merging customer data...", { id: toastId });
      const updatedJobs = [...newJobs, ...jobs];
      setJobs(updatedJobs);
      setStagedFiles([]);

      const merged = MergeEngine.merge(updatedJobs);
      setMergedResult(merged);

      toast.success("Local OCR Extraction complete — Ready for review", { id: toastId });
    } catch (error: any) {
      toast.error(error.message || "Failed to process documents locally", { id: toastId });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmReview = (finalData: Record<string, any>) => {
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
            <div className="space-y-4">
              <div className="border-2 border-dashed border-indigo-200 dark:border-indigo-800/50 rounded-xl bg-white dark:bg-zinc-900 p-6 text-center">
                <UploadCloud className="h-10 w-10 text-indigo-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Select Customer Documents
                </h3>
                <p className="text-xs text-zinc-500 mt-1 mb-4">
                  Select one or multiple files (Aadhaar, PAN, Voter ID, Ration Card, Bank Passbook, etc.).
                  <br />
                  Supported: PDF, JPG, PNG, WEBP (Max 10MB per file, max 10 files per import batch).
                </p>

                <label className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg cursor-pointer transition-colors shadow-sm">
                  <span>Browse Documents…</span>
                  <input 
                    type="file" 
                    multiple 
                    accept=".pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleSelectFiles}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Staged File Queue */}
              {stagedFiles.length > 0 ? (
                <div className="bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800/50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider flex items-center">
                      <Sparkles className="h-4 w-4 mr-1.5 text-indigo-500" />
                      Documents Ready for Extraction ({stagedFiles.length})
                    </h4>
                    <label className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer">
                      + Add More Files
                      <input 
                        type="file" 
                        multiple 
                        accept=".pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleSelectFiles}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {stagedFiles.map((sf) => {
                      const ext = sf.file.name.split('.').pop()?.toUpperCase() || 'FILE';
                      const sizeMb = (sf.file.size / (1024 * 1024)).toFixed(2);

                      return (
                        <div key={sf.id} className="flex items-center justify-between bg-white dark:bg-zinc-900 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
                          <div className="flex items-center space-x-3 truncate">
                            {sf.previewUrl ? (
                              <img src={sf.previewUrl} alt={sf.file.name} className="h-9 w-9 rounded object-cover border border-zinc-200 dark:border-zinc-700 shrink-0" />
                            ) : (
                              <div className="h-9 w-9 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                                {ext}
                              </div>
                            )}
                            <div className="truncate">
                              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate" title={sf.file.name}>
                                {sf.file.name}
                              </p>
                              <p className="text-[10px] text-zinc-500">
                                {ext} • {sizeMb} MB
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveStagedFile(sf.id)}
                            className="p-1 text-zinc-400 hover:text-red-600 transition-colors shrink-0 ml-2"
                            title="Remove file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 pt-3 border-t border-indigo-100 dark:border-indigo-800/50 flex justify-end">
                    <button 
                      type="button" 
                      onClick={handleExtractMultiDocuments} 
                      disabled={isExtracting}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all font-bold text-sm shadow-md flex items-center justify-center disabled:opacity-50"
                    >
                      {isExtracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                      {isExtracting ? "Extracting Batch..." : "Extract Data with AI"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-indigo-100 bg-indigo-50/30 dark:bg-indigo-950/20 text-center">
                  <p className="text-xs font-medium text-indigo-800 dark:text-indigo-300">
                    No documents staged. Select your customer documents to begin extraction.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <textarea 
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder={`{\n  "full_name": "Rahul Kumar",\n  "date_of_birth": "1995-01-10"\n}`}
                className="w-full p-4 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[160px]"
              />
              <div className="flex justify-end">
                <button 
                  type="button" 
                  onClick={handleAddJson}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-xs shadow-sm"
                >
                  Parse Manual JSON
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
