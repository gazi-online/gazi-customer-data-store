"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  AlertTriangle,
  Loader2,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { RequestDrawerDocument } from "@/app/(dashboard)/requests/types";
import {
  detachDocumentFromRequest,
  toggleDocumentVerification,
} from "@/app/(dashboard)/requests/actions";
import { AttachRequestDocumentModal } from "./AttachRequestDocumentModal";

interface RequestDocumentManagerProps {
  requestId: string;
  customerId: string;
  customerName: string;
  documents: RequestDrawerDocument[];
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function RequestDocumentManager({
  requestId,
  customerId,
  customerName,
  documents,
}: RequestDocumentManagerProps) {
  const router = useRouter();

  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [detachTarget, setDetachTarget] = useState<RequestDrawerDocument | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [isDetaching, setIsDetaching] = useState(false);

  // Toggle Verification (Compare-And-Set optimistic concurrency)
  const handleVerifyToggle = async (doc: RequestDrawerDocument) => {
    if (verifyingId || isDetaching) return;
    setVerifyingId(doc.id);

    try {
      const res = await toggleDocumentVerification({
        requestId,
        associationId: doc.id,
        expectedIsVerified: doc.isVerified,
        isVerified: !doc.isVerified,
      });

      if (res.success) {
        toast.success(
          !doc.isVerified
            ? "Document association verified."
            : "Document association marked unverified."
        );
        router.refresh();
      } else if (res.errorCode === "conflict") {
        toast.error(
          "Document verification state was changed by another user. Refreshing..."
        );
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update verification status.");
      }
    } catch {
      toast.error("An unexpected error occurred while toggling verification.");
    } finally {
      setVerifyingId(null);
    }
  };

  // Confirm Detach
  const handleConfirmDetach = async () => {
    if (!detachTarget || isDetaching) return;
    setIsDetaching(true);

    try {
      const res = await detachDocumentFromRequest({
        requestId,
        associationId: detachTarget.id,
      });

      if (res.success) {
        toast.success("Document detached from request.");
        setDetachTarget(null);
        router.refresh();
      } else if (res.errorCode === "not_found") {
        toast.info("Document is no longer attached. Refreshing...");
        setDetachTarget(null);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to detach document association.");
      }
    } catch {
      toast.error("An unexpected error occurred while detaching document.");
    } finally {
      setIsDetaching(false);
    }
  };

  return (
    <section
      data-customer-id={customerId}
      className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Attached Documents</span>
          </h2>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
            {documents.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsAttachModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Attach Document</span>
        </button>
      </div>

      {/* Documents List / Empty State */}
      {documents.length === 0 ? (
        <div className="p-8 rounded-xl bg-slate-50 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-800 text-center space-y-2.5">
          <FileText className="h-8 w-8 text-slate-300 dark:text-zinc-600 mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">
              No documents attached to this service request.
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-sm mx-auto">
              Attach existing documents from the customer&apos;s vault or upload new documents required for processing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAttachModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Attach First Document</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {documents.map((doc) => {
            const isProcessingThis = verifyingId === doc.id;

            return (
              <div
                key={doc.id}
                className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs flex-wrap sm:flex-nowrap"
              >
                {/* Document details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className="font-bold text-slate-900 dark:text-zinc-100 truncate max-w-[240px] sm:max-w-md"
                      title={doc.documentName}
                    >
                      {doc.documentName}
                    </p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-200/60 dark:bg-zinc-700/60 text-slate-700 dark:text-zinc-300">
                      <Tag className="h-2.5 w-2.5" />
                      {doc.requirementTag}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 dark:text-zinc-500 flex-wrap">
                    <span className="font-medium text-slate-600 dark:text-zinc-300">
                      {doc.documentType}
                    </span>
                    {doc.fileSize && (
                      <>
                        <span>•</span>
                        <span>{formatFileSize(doc.fileSize)}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>Attached {formatDate(doc.createdAt)}</span>
                  </div>
                </div>

                {/* Actions & Verification Badge */}
                <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/50 dark:border-zinc-800">
                  {/* Verification status toggle */}
                  <button
                    type="button"
                    onClick={() => handleVerifyToggle(doc)}
                    disabled={isProcessingThis || isDetaching}
                    title={doc.isVerified ? "Click to unverify" : "Click to verify"}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer ${
                      doc.isVerified
                        ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 dark:text-emerald-300 border border-emerald-300/40 dark:border-emerald-800"
                        : "bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/80 dark:hover:bg-amber-900 dark:text-amber-300 border border-amber-300/40 dark:border-amber-800"
                    }`}
                  >
                    {isProcessingThis ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : doc.isVerified ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    )}
                    <span>{doc.isVerified ? "Verified" : "Unverified"}</span>
                  </button>

                  {/* Detach Action */}
                  <button
                    type="button"
                    onClick={() => setDetachTarget(doc)}
                    disabled={isProcessingThis || isDetaching}
                    title="Detach from request"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
                    aria-label={`Detach ${doc.documentName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Attach Document Modal */}
      <AttachRequestDocumentModal
        isOpen={isAttachModalOpen}
        onClose={() => setIsAttachModalOpen(false)}
        requestId={requestId}
        customerName={customerName}
        onSuccess={() => router.refresh()}
      />

      {/* Detach Confirmation Dialog */}
      {detachTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Detach Document Association
                </h3>
                <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Are you sure you want to detach{" "}
                  <span className="font-semibold text-slate-900 dark:text-zinc-100">
                    &ldquo;{detachTarget.documentName}&rdquo;
                  </span>{" "}
                  (Tag: {detachTarget.requirementTag}) from this service request?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-800 text-[11px] text-slate-500 dark:text-zinc-400">
              <p className="font-medium text-slate-700 dark:text-zinc-300">
                {"This removes the document from this request only. It remains in the customer's Document Vault."}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDetachTarget(null)}
                disabled={isDetaching}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDetach}
                disabled={isDetaching}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors disabled:opacity-50"
              >
                {isDetaching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirm Detach</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
