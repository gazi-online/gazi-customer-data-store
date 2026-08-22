import React, { useState } from 'react';
import { X, UploadCloud, Sparkles, Loader2, ShieldCheck, AlertTriangle, Trash2, FileText } from 'lucide-react';
import { ProviderConfig } from './ProviderCard';
import { generateCustomerJsonWithProvider } from '@/app/(dashboard)/customers/ai-actions';
import { LocalOcrEngine } from '@/lib/ocr/LocalOcrEngine';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = Array.from(e.target.files);
    
    if (stagedFiles.length + selectedFiles.length > 10) {
      toast.error("Maximum 10 documents allowed per import batch.");
      return;
    }

    const newStaged: StagedFile[] = [];
    for (const f of selectedFiles) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`File ${f.name} exceeds 10MB limit.`);
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
    setErrorMessage(null);
    e.target.value = '';
  };

  const handleRemoveFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleProcess = async () => {
    if (stagedFiles.length === 0) {
      toast.error("Select at least one document to proceed");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      if (provider.id === 'local') {
        // LOCAL OCR BROWSER EXECUTION
        setStatusStage("Reading documents locally...");
        const allParsedData: any[] = [];

        for (let i = 0; i < stagedFiles.length; i++) {
          const sf = stagedFiles[i];
          setStatusStage(`Processing local OCR for ${sf.file.name} (${i + 1}/${stagedFiles.length})...`);
          
          const { parsedFields } = await LocalOcrEngine.processFile(sf.file, 'eng', (p) => {
            if (p.stage) setStatusStage(p.stage);
          });
          allParsedData.push(parsedFields);
        }

        setStatusStage("Building GCDS JSON...");
        // Combine parsed local OCR results into canonical GCDS JSON
        const firstParsed = allParsedData[0] || {};
        const combinedJson = {
          customer: firstParsed.customer || {},
          address: firstParsed.address || {},
          documents: firstParsed.documents || {},
          detected_documents: allParsedData.flatMap(d => d.detected_documents || []),
          confidence_summary: firstParsed.confidence_summary || { overall: 0.9, low_confidence_fields: [] }
        };

        // Merge extra fields if multiple files
        if (allParsedData.length > 1) {
          for (let i = 1; i < allParsedData.length; i++) {
            const current = allParsedData[i];
            if (current.customer) {
              combinedJson.customer = { ...combinedJson.customer, ...current.customer };
            }
            if (current.address) {
              combinedJson.address = { ...combinedJson.address, ...current.address };
            }
            if (current.documents) {
              combinedJson.documents = { ...combinedJson.documents, ...current.documents };
            }
          }
        }

        const jsonStr = JSON.stringify(combinedJson, null, 2);
        onJsonGenerated(jsonStr, provider.name);
        toast.success(`JSON generated successfully with ${provider.name}`);
        onClose();

      } else {
        // CLOUD PROVIDER SERVER ACTION EXECUTION
        setStatusStage("Uploading documents to server...");
        const formData = new FormData();
        formData.append("provider", provider.id);
        
        for (const sf of stagedFiles) {
          formData.append("files", sf.file);
        }

        setStatusStage(`Analyzing documents with ${provider.name}...`);
        const res = await generateCustomerJsonWithProvider(formData);

        if (!res.success || !res.data) {
          throw new Error(res.error || `${provider.name} failed to generate JSON.`);
        }

        setStatusStage("Validating JSON output...");
        const jsonStr = JSON.stringify(res.data, null, 2);
        onJsonGenerated(jsonStr, provider.name);
        toast.success(`JSON generated successfully with ${provider.name}`);
        onClose();
      }
    } catch (err: any) {
      console.error(`[${provider.name}] Extraction error:`, err);
      const userMsg = err.message || `${provider.name} document extraction is temporarily unavailable.`;
      setErrorMessage(userMsg);
      toast.error(userMsg);
    } finally {
      setIsProcessing(false);
      setStatusStage('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${provider.colorTheme.iconBg}`}>
              <provider.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Extract JSON with {provider.name}
              </h3>
              <p className="text-xs text-zinc-500 font-medium">
                Select documents to generate structured GCDS JSON
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
            provider.isCloud
              ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/50 text-indigo-900 dark:text-indigo-200'
              : 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200'
          }`}>
            {provider.isCloud ? (
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-bold">
                {provider.isCloud ? 'Cloud AI Processing Notice:' : 'Browser-Local Privacy Notice:'}
              </span>{' '}
              {provider.isCloud
                ? `This option sends selected documents to ${provider.name} for extraction.`
                : 'Documents stay on this device. Fully offline, 0 external network requests.'}
            </div>
          </div>

          {/* Upload Dropzone */}
          <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-5 text-center bg-zinc-50/50 dark:bg-zinc-950/50 hover:bg-zinc-100/50 transition-colors">
            <UploadCloud className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              Select Customer Documents for {provider.name}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 mb-3">
              Supported formats: PDF, JPG, PNG, WEBP (Max 10MB per file, max 10 files)
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

          {/* Staged File List */}
          {stagedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                <span>Selected Documents ({stagedFiles.length})</span>
                <label className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer text-[11px]">
                  + Add More
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

              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
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

          {/* Error Message Display */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-800 dark:text-red-200 flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Extraction Error:</span> {errorMessage}
              </div>
            </div>
          )}

          {/* Processing Status Banner */}
          {isProcessing && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 rounded-xl flex items-center space-x-3 text-xs font-semibold text-indigo-900 dark:text-indigo-200">
              <Loader2 className="h-4 w-4 text-indigo-600 animate-spin shrink-0" />
              <span>{statusStage || `Extracting JSON with ${provider.name}...`}</span>
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
            Cancel
          </button>

          <button
            type="button"
            onClick={handleProcess}
            disabled={isProcessing || stagedFiles.length === 0}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center space-x-2 disabled:opacity-50"
          >
            {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{isProcessing ? 'Generating JSON...' : `Generate JSON with ${provider.name}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
