"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentType } from "@/types/document";
import { EligibleVaultDocument } from "@/app/(dashboard)/requests/types";
import {
  getEligibleRequestDocuments,
  attachDocumentToRequest,
  uploadAndAttachDocumentToRequest,
} from "@/app/(dashboard)/requests/actions";

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

const SUGGESTED_TAGS = [
  "general",
  "identity",
  "address_proof",
  "income_proof",
  "photo",
];

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface AttachRequestDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  customerName: string;
  onSuccess: () => void;
}

export function AttachRequestDocumentModal({
  isOpen,
  onClose,
  requestId,
  customerName,
  onSuccess,
}: AttachRequestDocumentModalProps) {
  const [activeTab, setActiveTab] = useState<"existing" | "upload">("existing");

  // Existing Tab state
  const [eligibleDocs, setEligibleDocs] = useState<EligibleVaultDocument[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [requirementTag, setRequirementTag] = useState<string>("general");
  const [attaching, setAttaching] = useState(false);

  // Upload Tab state
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>("Aadhaar Card (Front)");
  const [docName, setDocName] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploadTag, setUploadTag] = useState("general");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Partial Failure notice
  const [partialError, setPartialError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch eligible documents whenever modal opens or tab changes to "existing"
  useEffect(() => {
    if (!isOpen || activeTab !== "existing") return;

    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        setLoadingEligible(true);
        setPartialError(null);
      }
    });

    getEligibleRequestDocuments(requestId)
      .then((res) => {
        if (ignore) return;
        if (res.data) {
          setEligibleDocs(res.data);
          if (res.data.length > 0 && !selectedDocId) {
            setSelectedDocId(res.data[0].id);
          }
        } else if (res.error) {
          toast.error(res.error);
        }
      })
      .catch(() => {
        if (!ignore) {
          toast.error("Failed to load customer documents.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingEligible(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isOpen, activeTab, requestId, selectedDocId]);

  if (!isOpen) return null;

  // Reset form states
  const handleClose = () => {
    if (attaching || uploading) return;
    setFile(null);
    setDocName("");
    setDocNumber("");
    setIssueDate("");
    setExpiryDate("");
    setRequirementTag("general");
    setUploadTag("general");
    setPartialError(null);
    onClose();
  };

  // Attach existing handler
  const handleAttachExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) {
      toast.error("Please select a document from the customer vault.");
      return;
    }

    setAttaching(true);
    setPartialError(null);

    try {
      const res = await attachDocumentToRequest({
        requestId,
        documentId: selectedDocId,
        requirementTag,
      });

      if (res.success) {
        toast.success("Document attached to service request.");
        onSuccess();
        handleClose();
      } else {
        if (res.errorCode === "already_attached") {
          toast.error(
            "This document is already attached under this tag. Choose a different tag or another document."
          );
        } else {
          toast.error(res.error || "Failed to attach document.");
        }
      }
    } catch {
      toast.error("An unexpected error occurred while attaching the document.");
    } finally {
      setAttaching(false);
    }
  };

  // Upload new handler
  const handleUploadAndAttach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file to upload.");
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error("Unsupported format. Allowed: JPG, PNG, WEBP, PDF.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File exceeds 10MB limit.");
      return;
    }

    setUploading(true);
    setPartialError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", docType);
    formData.append("document_name", docName.trim() || docType);
    if (docNumber.trim()) formData.append("document_number", docNumber.trim());
    if (issueDate) formData.append("issue_date", issueDate);
    if (expiryDate) formData.append("expiry_date", expiryDate);
    formData.append("side", "single");

    try {
      const res = await uploadAndAttachDocumentToRequest({
        requestId,
        requirementTag: uploadTag,
        formData,
      });

      if (res.success) {
        toast.success("Document uploaded and attached successfully.");
        onSuccess();
        handleClose();
      } else if (res.partialSuccess) {
        // Partial success: saved to vault, but attach failed
        setPartialError(res.error);
        toast.warning(res.error);
        onSuccess(); // Refresh to reflect any vault state updates
      } else {
        toast.error(res.error || "Failed to upload and attach document.");
      }
    } catch {
      toast.error("An unexpected error occurred during upload.");
    } finally {
      setUploading(false);
    }
  };

  // Drag & drop helpers
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
      if (ALLOWED_MIME_TYPES.includes(droppedFile.type)) {
        setFile(droppedFile);
        if (!docName) {
          setDocName(droppedFile.name.replace(/\.[^/.]+$/, ""));
        }
      } else {
        toast.error("Unsupported file type. Please upload a JPG, PNG, WEBP, or PDF.");
      }
    }
  };

  const selectedDoc = eligibleDocs.find((d) => d.id === selectedDocId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-100">
              Attach Document to Request
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Customer: <span className="font-semibold text-slate-700 dark:text-zinc-300">{customerName}</span>
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={attaching || uploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30 px-6 pt-3 gap-3">
          <button
            type="button"
            onClick={() => {
              if (!attaching && !uploading) setActiveTab("existing");
            }}
            disabled={attaching || uploading}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "existing"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Existing Vault Document</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!attaching && !uploading) setActiveTab("upload");
            }}
            disabled={attaching || uploading}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "upload"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <UploadCloud className="h-4 w-4" />
            <span>Upload New & Attach</span>
          </button>
        </div>

        {/* Partial Failure Notice */}
        {partialError && (
          <div className="m-6 mb-0 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Partial Success</span>
            </div>
            <p className="text-xs leading-relaxed">{partialError}</p>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === "existing" ? (
            /* TAB 1: EXISTING VAULT DOCUMENT */
            <form onSubmit={handleAttachExisting} className="space-y-4">
              {loadingEligible ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  <p className="text-xs text-slate-500">Loading customer documents...</p>
                </div>
              ) : eligibleDocs.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 space-y-3">
                  <FileText className="h-8 w-8 text-slate-400 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      No documents found in customer&apos;s vault
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Upload a new document directly using the Upload tab above.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("upload")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>Go to Upload</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Select Customer Document <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      disabled={attaching}
                      className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    >
                      {eligibleDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.documentName} ({doc.documentType}) — v{doc.version}
                        </option>
                      ))}
                    </select>

                    {selectedDoc && selectedDoc.existingTags.length > 0 && (
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1 mt-1">
                        <Tag className="h-3 w-3 text-slate-400" />
                        <span>Already attached to this request as:</span>
                        <span className="font-semibold text-slate-700 dark:text-zinc-300">
                          {selectedDoc.existingTags.join(", ")}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Requirement Tag <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={requirementTag}
                      onChange={(e) => setRequirementTag(e.target.value)}
                      disabled={attaching}
                      placeholder="e.g. identity, address_proof, general"
                      className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />

                    {/* Quick suggestion pills */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[11px] text-slate-400 dark:text-zinc-500">Suggestions:</span>
                      {SUGGESTED_TAGS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setRequirementTag(tag)}
                          disabled={attaching}
                          className={`text-[11px] px-2 py-0.5 rounded-md font-medium border transition-colors ${
                            requirementTag === tag
                              ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300"
                              : "bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-slate-200/60 dark:border-zinc-800 text-[11px] text-slate-500 dark:text-zinc-400 flex items-start gap-2">
                    <Shield className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      Attaching associates this document with the service request. The document remains canonical in the customer&apos;s vault.
                    </span>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={attaching}
                      className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={attaching || !selectedDocId}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors disabled:opacity-50"
                    >
                      {attaching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>Attach Document</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          ) : (
            /* TAB 2: UPLOAD NEW & ATTACH */
            <form onSubmit={handleUploadAndAttach} className="space-y-4">
              {/* File Dropzone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                    : file
                    ? "border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10"
                    : "border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-600 bg-slate-50/50 dark:bg-zinc-800/20"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const f = e.target.files[0];
                      setFile(f);
                      if (!docName) {
                        setDocName(f.name.replace(/\.[^/.]+$/, ""));
                      }
                    }
                  }}
                  className="hidden"
                />

                {file ? (
                  <div className="flex items-center justify-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="truncate max-w-[280px]">{file.name}</span>
                    <span className="text-slate-400 text-[11px]">
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <UploadCloud className="h-7 w-7 text-slate-400 mx-auto" />
                    <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                      PDF, JPG, PNG, WEBP (Max 10MB)
                    </p>
                  </div>
                )}
              </div>

              {/* Document Type & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Document Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocumentType)}
                    disabled={uploading}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    disabled={uploading}
                    placeholder="e.g. Aadhaar Card"
                    required
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Requirement Tag */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Requirement Tag <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={uploadTag}
                  onChange={(e) => setUploadTag(e.target.value)}
                  disabled={uploading}
                  placeholder="e.g. identity, address_proof, general"
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />

                {/* Quick suggestion pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500">Suggestions:</span>
                  {SUGGESTED_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setUploadTag(tag)}
                      disabled={uploading}
                      className={`text-[11px] px-2 py-0.5 rounded-md font-medium border transition-colors ${
                        uploadTag === tag
                          ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300"
                          : "bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional metadata (number, issue date, expiry date) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                    Doc Number (optional)
                  </label>
                  <input
                    type="text"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    disabled={uploading}
                    placeholder="e.g. 1234-5678-9012"
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-slate-900 dark:text-zinc-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                    Issue Date (optional)
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    disabled={uploading}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-slate-900 dark:text-zinc-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                    Expiry Date (optional)
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={uploading}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-slate-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={uploading}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors disabled:opacity-50"
                >
                  {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Upload & Attach</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
