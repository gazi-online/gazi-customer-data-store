"use client";

import { useState, useEffect } from "react";
import { uploadCustomerDocument } from "@/app/(dashboard)/documents/actions";
import { getCustomers } from "@/app/(dashboard)/customers/actions";
import { toast } from "sonner";
import { Loader2, UploadCloud, FileText, CheckCircle2, X } from "lucide-react";
import { DocumentType } from "@/types/document";

const DOCUMENT_TYPES: { label: string; value: DocumentType }[] = [
  { label: "Aadhaar Card (Front)", value: "Aadhaar Card (Front)" },
  { label: "Aadhaar Card (Back)", value: "Aadhaar Card (Back)" },
  { label: "PAN Card", value: "PAN Card" },
  { label: "Passport", value: "Passport" },
  { label: "Driving License", value: "Driving License" },
  { label: "Voter ID", value: "Voter ID" },
  { label: "Trade License", value: "Trade License" },
  { label: "GST Certificate", value: "GST Certificate" },
  { label: "Business Registration", value: "Business Registration" },
  { label: "Bank Passbook", value: "Bank Passbook" },
  { label: "Agreement", value: "Agreement" },
  { label: "Photo", value: "Photo" },
  { label: "Other", value: "Other" },
];

interface DocumentUploadFormProps {
  customerId?: string;
  customers?: Array<{
    id: string;
    customer_code: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    phone: string;
  }>;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function DocumentUploadForm({
  customerId: initialCustomerId,
  customers: initialCustomers,
  onSuccess,
  onCancel,
}: DocumentUploadFormProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || "");
  const [docType, setDocType] = useState<DocumentType>("Aadhaar Card (Front)");
  const [docName, setDocName] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [customerList, setCustomerList] = useState<any[]>(initialCustomers || []);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // If customerId is not provided and customers list is empty, fetch active customers
  useEffect(() => {
    if (!initialCustomerId && (!customerList || customerList.length === 0)) {
      setLoadingCustomers(true);
      getCustomers("", "active")
        .then((data) => {
          setCustomerList(data || []);
          if (data && data.length > 0 && !selectedCustomerId) {
            setSelectedCustomerId(data[0].id);
          }
        })
        .catch((err) => console.error("Failed to load customers for upload form:", err))
        .finally(() => setLoadingCustomers(false));
    }
  }, [initialCustomerId, customerList, selectedCustomerId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(selectedFile.type)) {
      toast.error("Unsupported file type. Please upload JPG, PNG, WEBP, or PDF.");
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit.");
      return;
    }
    setFile(selectedFile);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCustomerId = initialCustomerId || selectedCustomerId;
    
    if (!effectiveCustomerId) {
      return toast.error("Please select a customer.");
    }
    if (!file) {
      return toast.error("Please select a document file to upload.");
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("customer_id", effectiveCustomerId);
    formData.append("document_type", docType);
    if (docName.trim()) formData.append("document_name", docName.trim());
    if (docNumber.trim()) formData.append("document_number", docNumber.trim());
    if (notes.trim()) formData.append("notes", notes.trim());

    try {
      const result = await uploadCustomerDocument(formData);
      if (result.error) {
        throw new Error(result.error);
      }

      toast.success("Document uploaded securely to private storage");
      setFile(null);
      setDocName("");
      setDocNumber("");
      setNotes("");
      
      const fileInput = document.getElementById("document-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleUpload} className="space-y-4">
      {/* Customer Selection (Only if not pre-selected from profile page) */}
      {!initialCustomerId && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Select Customer <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            disabled={loadingCustomers || isUploading}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 transition-shadow disabled:opacity-50"
            required
          >
            {customerList.length === 0 ? (
              <option value="">{loadingCustomers ? "Loading customers..." : "No customers available"}</option>
            ) : (
              customerList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_code} - {[c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ")} ({c.phone || "No Phone"})
                </option>
              ))
            )}
          </select>
        </div>
      )}

      {/* Row: Document Type & Label */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Document Type <span className="text-red-500">*</span>
          </label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
            disabled={isUploading}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 transition-shadow"
            required
          >
            {DOCUMENT_TYPES.map((dt) => (
              <option key={dt.value} value={dt.value}>
                {dt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Document Label / Name (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Electricity Bill Jan 2026"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            disabled={isUploading}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
        </div>
      </div>

      {/* Row: Document Number & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Document Number (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. WB/01/2026/1234"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            disabled={isUploading}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Notes / Remarks (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Original verified at counter"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isUploading}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
        </div>
      </div>

      {/* Drag & Drop File Upload Box */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          File (JPG, PNG, WEBP, PDF - Max 10MB) <span className="text-red-500">*</span>
        </label>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-all ${
            dragActive
              ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
              : file
              ? "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10"
              : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 bg-zinc-50 dark:bg-zinc-900/50"
          }`}
        >
          <input
            id="document-file-input"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                validateAndSetFile(e.target.files[0]);
              }
            }}
            disabled={isUploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />

          {file ? (
            <div className="flex items-center justify-between text-left">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-xs md:max-w-md">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || "Document"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  const fileInput = document.getElementById("document-file-input") as HTMLInputElement;
                  if (fileInput) fileInput.value = "";
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                title="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2">
              <UploadCloud className="h-8 w-8 text-zinc-400 mb-1.5" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Click to browse or drag & drop file here
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Supported formats: JPG, PNG, WEBP, PDF (Max 10MB)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-end space-x-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!file || isUploading}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading to Private Storage...
            </>
          ) : (
            <>
              <UploadCloud className="mr-2 h-4 w-4" />
              Upload Document Securely
            </>
          )}
        </button>
      </div>
    </form>
  );
}
