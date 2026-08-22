"use client";

import { useState } from "react";
import { Bot, Play, UploadCloud, FileImage, Loader2, Trash2, FileText, Sparkles, CheckCircle2, Copy } from "lucide-react";
import { ImportJob, MergedResult } from "./types";
import { DataNormalizer } from "./DataNormalizer";
import { MergeEngine } from "./MergeEngine";
import { ReviewPanel } from "./components/ReviewPanel";
import { JsonAiGenerator } from "./components/JsonAiGenerator";
import { JSONValidator } from "@/lib/ai/parser/validator";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { extractDataFromDocuments, processOcrSpaceDocument } from "@/app/(dashboard)/customers/ai-actions";

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
    const toastId = toast.loading("Processing documents with OCR.space...");

    try {
      const formData = new FormData();
      for (const sf of stagedFiles) {
        formData.append("files", sf.file);
      }

      const res = await processOcrSpaceDocument(formData);
      if (!res.success || !res.data) {
        throw new Error(res.error || "OCR.space document extraction failed.");
      }

      const normalizedData = DataNormalizer.normalize(res.data);
      const newJob: ImportJob = {
        id: uuidv4(),
        documentType: res.data.detected_documents?.[0]?.detected_type || 'unknown',
        provider: 'manual',
        source: 'file',
        frontFile: stagedFiles[0]?.file,
        status: 'completed',
        rawResponse: res.data,
        normalizedData,
        version: 1,
        perfSummary: {
          provider: 'OCR.space API',
          model: 'engine-2',
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

      setJobs([newJob]);
      setStagedFiles([]);

      const merged = MergeEngine.merge([newJob]);
      setMergedResult(merged);

      toast.success("OCR.space Extraction complete — Ready for review", { id: toastId });
    } catch (error: any) {
      toast.error(error.message || "Failed to process documents with OCR.space", { id: toastId });
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
                      } catch (err) {
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
