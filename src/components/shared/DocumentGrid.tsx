"use client";

import { CustomerDocument } from "@/types/document";
import { 
  FileText, 
  Trash2, 
  ExternalLink, 
  Download, 
  ShieldCheck, 
  User, 
  Loader2,
  Calendar,
  AlertCircle
} from "lucide-react";
import { deleteCustomerDocument, getDocumentSignedUrl } from "@/app/(dashboard)/documents/actions";
import { toast } from "sonner";
import { useState } from "react";
import Link from "next/link";

interface DocumentGridProps {
  documents: CustomerDocument[];
  customerId?: string;
  showCustomerInfo?: boolean;
  onDocumentDeleted?: () => void;
}

export function DocumentGrid({
  documents,
  customerId,
  showCustomerInfo = false,
  onDocumentDeleted,
}: DocumentGridProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDelete = async (doc: CustomerDocument) => {
    const docTitle = doc.document_name || doc.document_type;
    if (!confirm(`Are you sure you want to securely delete "${docTitle}"? This will remove the file from private storage.`)) {
      return;
    }

    setIsDeleting(doc.id);
    try {
      const result = await deleteCustomerDocument(doc.id, true);
      if (result.error) throw new Error(result.error);
      toast.success("Document deleted securely from private storage");
      if (onDocumentDeleted) {
        onDocumentDeleted();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete document");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDownload = async (doc: CustomerDocument) => {
    setDownloadingId(doc.id);
    try {
      const targetFilename = doc.source_filename || `${doc.document_type.replace(/\s+/g, '_')}_${doc.id.slice(0, 6)}`;
      const result = await getDocumentSignedUrl(doc.file_url, true, targetFilename);
      if (result.error || !result.signedUrl) {
        throw new Error(result.error || "Could not generate secure download URL");
      }

      // Trigger browser download
      const link = document.createElement("a");
      link.href = result.signedUrl;
      link.download = targetFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Secure download started");
    } catch (err: any) {
      toast.error(err.message || "Failed to download document");
    } finally {
      setDownloadingId(null);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="py-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30">
        <FileText className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-600 dark:text-zinc-300 font-medium">No documents found.</p>
        <p className="text-xs text-zinc-400 mt-1">
          Upload KYC & business documents securely to store in private storage.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {documents.map((doc) => {
        const isPdf = doc.mime_type?.includes('pdf') || doc.file_url.toLowerCase().endsWith('.pdf') || (doc.source_filename && doc.source_filename.toLowerCase().endsWith('.pdf'));
        const customerName = doc.customer
          ? [doc.customer.first_name, doc.customer.middle_name, doc.customer.last_name].filter(Boolean).join(" ")
          : null;

        return (
          <div
            key={doc.id}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col group relative overflow-hidden hover:border-blue-400 dark:hover:border-blue-600 transition-all"
          >
            {/* Top Bar: Privacy Badge & Status */}
            <div className="flex items-center justify-between mb-2.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                <ShieldCheck className="h-3 w-3 mr-1 text-emerald-600 dark:text-emerald-400" /> Private
              </span>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  doc.status === 'archived'
                    ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                    : doc.status === 'superseded'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                {doc.status || 'active'}
              </span>
            </div>

            {/* Document Header */}
            <div className="mb-2">
              <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate" title={doc.document_type}>
                {doc.document_type}
              </h4>
              {doc.document_name && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate" title={doc.document_name}>
                  {doc.document_name}
                </p>
              )}
            </div>

            {/* Customer Info (Global view) */}
            {showCustomerInfo && doc.customer && (
              <div className="mb-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5 truncate">
                  <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <Link
                    href={`/customers/${doc.customer_id}`}
                    className="font-semibold text-zinc-800 dark:text-zinc-200 hover:text-blue-600 truncate"
                  >
                    {customerName}
                  </Link>
                </div>
                <span className="text-[10px] font-mono font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                  {doc.customer.customer_code}
                </span>
              </div>
            )}

            {/* Preview Box */}
            <div className="h-32 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 overflow-hidden relative flex items-center justify-center p-2 mb-3 group-hover:bg-zinc-100/70 dark:group-hover:bg-zinc-900 transition-colors">
              {isPdf ? (
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mb-1">
                    <FileText className="h-6 w-6" />
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">PDF Document</span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : 'Secured'}
                  </span>
                </div>
              ) : doc.signed_url ? (
                <img
                  src={doc.signed_url}
                  alt={doc.document_type}
                  className="w-full h-full object-cover rounded-lg"
                  loading="lazy"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-400">
                  <ShieldCheck className="h-8 w-8 mb-1" />
                  <span className="text-[11px]">Private Encrypted</span>
                </div>
              )}
            </div>

            {/* Metadata Badges */}
            <div className="space-y-1 mb-3">
              <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                <span className="truncate max-w-[140px]" title={doc.source_filename}>
                  {doc.source_filename || doc.file_url.split('/').pop()}
                </span>
                <span>
                  {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : ""}
                </span>
              </div>
              {doc.expiry_date && (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md w-fit">
                  <Calendar className="h-3 w-3" />
                  <span>Expires: {doc.expiry_date}</span>
                </div>
              )}
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-auto">
              <div className="flex items-center space-x-1.5">
                {doc.signed_url ? (
                  <a
                    href={doc.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors"
                    title="View Full Document via Signed URL"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
                  </a>
                ) : (
                  <button
                    disabled
                    className="px-2.5 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg"
                  >
                    Unavailable
                  </button>
                )}

                <button
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.id}
                  className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Download File via Signed URL"
                >
                  {downloadingId === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </>
                  )}
                </button>
              </div>

              <button
                onClick={() => handleDelete(doc)}
                disabled={isDeleting === doc.id}
                className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-50"
                title="Delete Document Securely"
              >
                {isDeleting === doc.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
