import React, { useState } from 'react';
import { X, UploadCloud, Sparkles, Loader2, ShieldCheck, ExternalLink, Copy, ClipboardCheck, Trash2, FileText, CheckCircle2 } from 'lucide-react';
import { ProviderConfig } from './ProviderCard';
import { processOcrSpaceDocument } from '@/app/(dashboard)/customers/ai-actions';
import { CANONICAL_GCDS_EXTRACTION_PROMPT } from '@/lib/ai/prompts/canonicalPrompt';
import { JSONValidator } from '@/lib/ai/parser/validator';
import { toast } from 'sonner';

interface StagedFile {
  id: string;
  file: File;
  previewUrl?: string;
}

interface ProviderDocumentModalProps {
  provider: ProviderConfig;
  isOpen: boolean;
  onClose: () => void;
  onJsonGenerated: (jsonString: string, providerName: string) => void;
}

export const ProviderDocumentModal: React.FC<ProviderDocumentModalProps> = ({
  provider,
  isOpen,
  onClose,
  onJsonGenerated,
}) => {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusStage, setStatusStage] = useState<string>('');
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(CANONICAL_GCDS_EXTRACTION_PROMPT);
    setCopiedPrompt(true);
    toast.success("GCDS Extraction Prompt copied to clipboard!");
    setTimeout(() => setCopiedPrompt(false), 3000);
  };

  const handleOpenWeb = () => {
    if (provider.webUrl) {
      window.open(provider.webUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        toast.error("Clipboard is empty. Copy the JSON response from your AI tab first.");
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

      const jsonStr = JSON.stringify(canonicalJson, null, 2);
      onJsonGenerated(jsonStr, provider.name);
      toast.success(`Valid JSON parsed from clipboard!`);
      onClose();
    } catch (err: any) {
      toast.error("Clipboard does not contain valid JSON. Please copy the JSON output and try again.");
    }
  };

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = Array.from(e.target.files);
    
    if (stagedFiles.length + selectedFiles.length > 10) {
      toast.error("Maximum 10 documents allowed per import batch.");
      return;
    }

    setErrorMessage(null);
    const newStaged: StagedFile[] = [];
    for (const f of selectedFiles) {
      const lower = f.name.toLowerCase();
      const isPdf = f.type === 'application/pdf' || lower.endsWith('.pdf');

      if (isPdf && f.size > 1 * 1024 * 1024) {
        toast.error(`PDF ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 1 MB OCR.space free plan limit.`);
        continue;
      }
      if (!isPdf && f.size > 10 * 1024 * 1024) {
        toast.error(`Image ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 10 MB maximum upload limit.`);
        continue;
      }
      let previewUrl: string | undefined = undefined;
      if (f.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(f);
      }
      newStaged.push({
        id: Math.random().toString(36).substring(7),
        file: f,
        previewUrl
      });
    }

    setStagedFiles((prev) => [...prev, ...newStaged]);
    e.target.value = '';
  };

  const handleRemoveFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleProcessOcrSpace = async () => {
    if (stagedFiles.length === 0) {
      toast.error("Select at least one document to proceed");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusStage("Uploading document to server…");

    try {
      const formData = new FormData();
      for (const sf of stagedFiles) {
        formData.append("files", sf.file);
      }

      setStatusStage("Reading document text with OCR.space…");
      const res = await processOcrSpaceDocument(formData);

      if (!res.success || !res.data) {
        throw new Error(res.error || "OCR.space document extraction failed.");
      }

      setStatusStage("Detecting document type & extracting customer fields…");
      const jsonStr = JSON.stringify(res.data, null, 2);
      onJsonGenerated(jsonStr, provider.name);
      toast.success("Document text extracted successfully via OCR.space!");
      onClose();

    } catch (err: any) {
      console.error("[OCR.space] Processing error:", err);
      const msg = err.message || "OCR.space document extraction failed.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
      setStatusStage('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${provider.colorTheme.iconBg}`}>
              <provider.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {provider.name} Assistant
              </h3>
              <p className="text-xs text-zinc-500 font-medium">
                {provider.isWeb ? 'Browser-assisted document extraction' : 'Dedicated hosted OCR text extraction'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Privacy Banner */}
          <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-start space-x-2.5 ${
            provider.isWeb
              ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/50 text-indigo-900 dark:text-indigo-200'
              : 'bg-sky-50/60 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/50 text-sky-900 dark:text-sky-200'
          }`}>
            {provider.isWeb ? (
              <ExternalLink className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-bold">
                {provider.isWeb ? 'Direct Browser Assistant:' : 'Hosted OCR Notice:'}
              </span>{' '}
              {provider.isWeb
                ? `Documents are uploaded by you directly to ${provider.name} website. GCDS uses 0 API keys and makes 0 background API calls.`
                : 'Selected documents are sent securely to OCR.space for text extraction.'}
            </div>
          </div>

          {/* Web AI Guided Steps */}
          {provider.isWeb ? (
            <div className="space-y-3 pt-1">
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Step 1: Copy Extraction Prompt</p>
                  <p className="text-[11px] text-zinc-500">Includes canonical GCDS schema and rules</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm"
                >
                  {copiedPrompt ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedPrompt ? 'Copied!' : 'Copy Prompt'}</span>
                </button>
              </div>

              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Step 2: Open {provider.name}</p>
                  <p className="text-[11px] text-zinc-500">Opens {provider.webUrl} in new tab</p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenWeb}
                  className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Website</span>
                </button>
              </div>

              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Step 3 & 4: Upload Documents & Copy JSON</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Upload customer documents (PDF/JPG/PNG) into {provider.name}, paste the prompt, and copy the JSON output.
                </p>
              </div>

              <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-950 dark:text-emerald-200">Step 5: Paste JSON to GCDS</p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Validates & pretty-prints automatically</p>
                </div>
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Paste JSON</span>
                </button>
              </div>
            </div>
          ) : (
            /* OCR.space Document Dropzone */
            <div className="space-y-4">
              <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-5 text-center bg-zinc-50/50 dark:bg-zinc-950/50 hover:bg-zinc-100/50 transition-colors">
                <UploadCloud className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  Select Customer Documents for OCR.space Extraction
                </p>
                <p className="text-[11px] text-zinc-500 mt-1 mb-3">
                  Supported: JPG, PNG, WEBP, PDF (PDF Max 1 MB, Images auto-optimized &lt; 1 MB)
                </p>
                <label className="inline-flex items-center px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-lg cursor-pointer hover:opacity-90 transition-opacity">
                  <span>Choose Files…</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleSelectFiles}
                    disabled={isProcessing}
                    className="hidden"
                  />
                </label>
              </div>

              {stagedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    <span>Selected Documents ({stagedFiles.length})</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                    {stagedFiles.map((sf) => (
                      <div key={sf.id} className="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700">
                        <div className="flex items-center space-x-2.5 truncate">
                          {sf.previewUrl ? (
                            <img src={sf.previewUrl} alt={sf.file.name} className="h-7 w-7 rounded object-cover border shrink-0" />
                          ) : (
                            <FileText className="h-7 w-7 text-zinc-400 shrink-0" />
                          )}
                          <div className="truncate">
                            <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                              {sf.file.name}
                            </p>
                            <p className="text-[10px] text-zinc-500">
                              {(sf.file.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(sf.id)}
                          disabled={isProcessing}
                          className="text-zinc-400 hover:text-red-600 p-1 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {errorMessage && !isProcessing && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                  <div className="pr-2">
                    <p className="font-bold">Extraction Error</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">{errorMessage}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleProcessOcrSpace}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center space-x-1 shadow-sm"
                  >
                    <span>Try Again</span>
                  </button>
                </div>
              )}

              {isProcessing && (
                <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/50 rounded-xl flex items-center space-x-3 text-xs font-semibold text-sky-900 dark:text-sky-200">
                  <Loader2 className="h-4 w-4 text-sky-600 animate-spin shrink-0" />
                  <span>{statusStage || "Processing with OCR.space..."}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Close
          </button>

          {!provider.isWeb && (
            <button
              type="button"
              onClick={handleProcessOcrSpace}
              disabled={isProcessing || stagedFiles.length === 0}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center space-x-2 disabled:opacity-50"
            >
              {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{isProcessing ? 'Extracting Text…' : 'Extract with OCR.space'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
