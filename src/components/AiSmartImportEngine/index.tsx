"use client";

import { useState } from "react";
import { Bot, Play, Settings, UploadCloud, FileImage, Loader2 } from "lucide-react";
import { ImportJob, AiProvider, MergedResult } from "./types";
import { DataNormalizer } from "./DataNormalizer";
import { MergeEngine } from "./MergeEngine";
import { QueuePanel } from "./components/QueuePanel";
import { ReviewPanel } from "./components/ReviewPanel";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { extractDataFromDocuments, testGeminiConnection } from "@/app/(dashboard)/customers/ai-actions";

interface AiSmartImportEngineProps {
  onAutoFill: (data: Record<string, any>) => void;
}

const DOCUMENT_TYPES = [
  'Aadhaar Front', 'Aadhaar Back', 'PAN Card', 'Passport', 'Driving License', 'Voter ID', 'Trade License', 'GST Certificate', 'Bank Passbook', 'Other'
];

export function AiSmartImportEngine({ onAutoFill }: AiSmartImportEngineProps) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [mergedResult, setMergedResult] = useState<MergedResult | null>(null);
  
  // Current Form State
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0]);
  const [provider, setProvider] = useState<AiProvider>('gemini');
  
  const [inputMethod, setInputMethod] = useState<'file' | 'json'>('file');
  const [jsonText, setJsonText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stagedFiles, setStagedFiles] = useState<{ file: File; docType: string }[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isTestingGemini, setIsTestingGemini] = useState(false);

  const handleTestGemini = async () => {
    setIsTestingGemini(true);
    const toastId = toast.loading("Testing Gemini Connection...");
    try {
      const result = await testGeminiConnection();
      if (result.success) {
        toast.success(result.message, { id: toastId });
      } else {
        toast.error(result.error || "Failed to connect", { id: toastId });
      }
    } catch (error: any) {
      toast.error(error.message || "Connection failed", { id: toastId });
    } finally {
      setIsTestingGemini(false);
    }
  };

  const handleAddJson = () => {
    if (!jsonText.trim()) return toast.error("Please paste JSON data");

    try {
      const rawData = JSON.parse(jsonText);
      const normalizedData = DataNormalizer.normalize(rawData);
      
      // Check versioning (if this doc type already exists in queue)
      const existingVersions = jobs.filter(j => j.documentType === docType).length;
      
      const newJob: ImportJob = {
        id: uuidv4(),
        documentType: docType,
        provider,
        source: 'json',
        jsonText,
        status: 'completed', // Instantly completed since it's JSON
        rawResponse: rawData,
        normalizedData,
        version: existingVersions + 1
      };

      setJobs(prev => [newJob, ...prev]);
      setJsonText(""); // Reset
      toast.success(`${docType} added to queue (Manual JSON)`);
    } catch (e) {
      toast.error("Invalid JSON format");
    }
  };

  const handleAddStagedFile = () => {
    if (!selectedFile) return toast.error("Please select a file to add");
    if (stagedFiles.some(sf => sf.docType === docType)) {
      return toast.error(`${docType} is already added. Remove it first to re-add.`);
    }
    setStagedFiles([...stagedFiles, { file: selectedFile, docType }]);
    setSelectedFile(null);
  };

  const handleRemoveStagedFile = (docTypeToRemove: string) => {
    setStagedFiles(stagedFiles.filter(sf => sf.docType !== docTypeToRemove));
  };

  const handleFileUpload = async () => {
    if (stagedFiles.length === 0) return toast.error("Please add at least one document to stage");
    
    setIsExtracting(true);
    const toastId = toast.loading(`Preparing document...`);
    
    try {
      const formData = new FormData();
      const docTypesForExtraction: string[] = [];
      
      for (const sf of stagedFiles) {
        formData.append('files', sf.file);
        docTypesForExtraction.push(sf.docType);
      }
      formData.append('documentTypes', JSON.stringify(docTypesForExtraction));
      
      toast.loading(`Extracting with ${provider === 'gemini' ? 'Gemini' : provider}...`, { id: toastId });
      const result = await extractDataFromDocuments(formData);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to extract data");
      }

      toast.loading(`Finalizing result...`, { id: toastId });
      const rawData = result.data;
      const normalizedData = DataNormalizer.normalize(rawData);
      
      const combinedDocType = docTypesForExtraction.join(" + ");
      const existingVersions = jobs.filter(j => j.documentType === combinedDocType).length;
      
      const frontFile = stagedFiles.find(sf => sf.docType === 'Aadhaar Front')?.file || stagedFiles[0]?.file;
      const backFile = stagedFiles.find(sf => sf.docType === 'Aadhaar Back')?.file;
      
      const newJob: ImportJob = {
        id: uuidv4(),
        documentType: combinedDocType,
        provider,
        source: 'file',
        frontFile: frontFile,
        backFile: backFile,
        status: 'completed',
        rawResponse: rawData,
        normalizedData,
        version: existingVersions + 1,
        perfSummary: result.perfSummary
      };

      setJobs(prev => [newJob, ...prev]);
      setStagedFiles([]);
      toast.success(`Ready for review`, { id: toastId });
    } catch (error: any) {
      toast.error(error.message || "Failed to extract data", { id: toastId });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRemoveJob = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
    setMergedResult(null); // Clear result if queue changes
  };

  const handleProcessEngine = () => {
    if (jobs.length === 0) return toast.error("Queue is empty");
    
    // Process Merge Engine
    const result = MergeEngine.merge(jobs);
    if (Object.keys(result.data).length === 0) {
      return toast.error("No valid data found to merge");
    }
    
    setMergedResult(result);
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
              <p className="text-sm text-indigo-700/80 dark:text-indigo-300/80 font-medium mt-0.5">Multi-Document AI Merge & Auto-fill System</p>
            </div>
          </div>
        </div>

        {/* Input Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">Document Type</label>
              <select 
                value={docType} onChange={e => setDocType(e.target.value)}
                className="w-full p-2.5 border border-indigo-200 dark:border-indigo-800 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider flex items-center justify-between">
                AI Provider
                <Settings className="h-3 w-3 text-indigo-400" />
              </label>
              <select 
                value={provider} onChange={e => setProvider(e.target.value as AiProvider)}
                className="w-full p-2.5 border border-indigo-200 dark:border-indigo-800 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="gemini">Google Gemini 1.5 Pro</option>
                <option value="chatgpt">OpenAI GPT-4o</option>
                <option value="claude">Anthropic Claude 3.5</option>
                <option value="manual">Manual Paste</option>
              </select>
              {provider === 'gemini' && (
                <button
                  type="button"
                  onClick={handleTestGemini}
                  disabled={isTestingGemini}
                  className="w-full mt-2 py-2 px-3 text-sm font-medium rounded-lg border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  {isTestingGemini ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                  Test Gemini Connection
                </button>
              )}
            </div>

            <QueuePanel jobs={jobs} onRemoveJob={handleRemoveJob} />
          </div>

          <div className="md:col-span-8 flex flex-col h-full bg-white/50 dark:bg-zinc-900/50 rounded-xl border border-indigo-100 dark:border-indigo-800/50 overflow-hidden">
             
             {/* Input Method Tabs */}
             <div className="flex border-b border-indigo-100 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-900/20">
               <button 
                 onClick={() => setInputMethod('file')}
                 className={`flex-1 py-3 text-sm font-semibold transition-colors flex justify-center items-center ${inputMethod === 'file' ? 'text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 bg-white dark:bg-zinc-900' : 'text-zinc-500 hover:text-indigo-600'}`}
               >
                 <FileImage className="w-4 h-4 mr-2" /> Upload Document
               </button>
               <button 
                 onClick={() => setInputMethod('json')}
                 className={`flex-1 py-3 text-sm font-semibold transition-colors flex justify-center items-center ${inputMethod === 'json' ? 'text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 bg-white dark:bg-zinc-900' : 'text-zinc-500 hover:text-indigo-600'}`}
               >
                 <Bot className="w-4 h-4 mr-2" /> Paste JSON
               </button>
             </div>

             <div className="p-4 flex-1 flex flex-col">
               {inputMethod === 'file' ? (
                 <div className="flex-1 flex flex-col">
                   <div className="flex-1 border-2 border-dashed border-indigo-200 dark:border-indigo-800/50 rounded-xl bg-white dark:bg-zinc-900 flex flex-col items-center justify-center p-6 text-center">
                     <UploadCloud className="h-10 w-10 text-indigo-400 mb-3" />
                     <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Upload Image or PDF</p>
                     <p className="text-xs text-zinc-500 mt-1 mb-4">Max 10MB. JPG, PNG, WEBP, PDF.</p>
                     <div className="flex items-center space-x-2">
                       <input 
                         type="file" 
                         accept="image/*,application/pdf"
                         onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                         className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer max-w-[250px] mx-auto"
                       />
                       <button
                         type="button"
                         onClick={handleAddStagedFile}
                         disabled={!selectedFile}
                         className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap shadow-sm"
                       >
                         Add Document
                       </button>
                     </div>
                   </div>
                   
                   {/* Staging Area Preview */}
                   {stagedFiles.length > 0 ? (
                     <div className="mt-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800/50">
                       <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider mb-3">Documents Ready</h3>
                       <div className="space-y-2">
                         {stagedFiles.map((sf, index) => (
                           <div key={index} className="flex items-center justify-between bg-white dark:bg-zinc-800 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
                             <div className="flex items-center">
                               <span className="text-green-500 mr-2 font-bold">✓</span>
                               <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{sf.docType}</span>
                               <span className="text-xs text-zinc-500 ml-2 truncate max-w-[150px]">({sf.file.name})</span>
                             </div>
                             <button
                               type="button"
                               onClick={() => handleRemoveStagedFile(sf.docType)}
                               className="text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-2 py-1"
                             >
                               [Remove]
                             </button>
                           </div>
                         ))}
                       </div>
                     </div>
                   ) : (
                     <div className="mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800/50 text-center">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No documents staged. Select a file and click "Add Document".</p>
                     </div>
                   )}
                   
                   <div className="mt-4 flex justify-between items-center">
                     <button 
                       type="button" onClick={handleFileUpload} disabled={stagedFiles.length === 0 || isExtracting}
                       className="w-full px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-bold text-sm shadow-md flex items-center justify-center disabled:opacity-50"
                     >
                       {isExtracting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Bot className="w-5 h-5 mr-2" />}
                       {isExtracting ? "Extracting..." : "Extract Data with AI"}
                     </button>
                   </div>
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col">
                   <textarea 
                     value={jsonText}
                     onChange={(e) => setJsonText(e.target.value)}
                     placeholder={`{\n  "first_name": "Rahul",\n  "date_of_birth": "10/01/1995"\n}`}
                     className="w-full flex-1 p-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner resize-none min-h-[200px]"
                   />
                   <div className="mt-4 flex">
                     <button 
                       type="button" onClick={handleAddJson}
                       className="px-5 py-2.5 bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/50 transition-colors font-semibold text-sm shadow-sm"
                     >
                       + Add Manual JSON
                     </button>
                   </div>
                 </div>
               )}
             </div>

             <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-4 border-t border-indigo-100 dark:border-indigo-800/50 flex justify-end">
               <button 
                 type="button" onClick={handleProcessEngine} disabled={jobs.length === 0}
                 className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:shadow-none flex items-center font-bold text-sm group"
               >
                 <Play className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                 Run Smart Merge Engine
               </button>
             </div>
          </div>
        </div>
      </div>

      {/* Review Panel Overlay */}
      {mergedResult && (
        <ReviewPanel result={mergedResult} onConfirm={handleConfirmReview} />
      )}
    </div>
  );
}
