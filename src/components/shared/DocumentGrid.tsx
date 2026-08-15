"use client";

import { CustomerDocument } from "@/types/document";
import { FileText, Trash2, ExternalLink, ShieldCheck, CheckCircle2 } from "lucide-react";
import { deleteDocument } from "@/app/(dashboard)/documents/actions";
import { toast } from "sonner";
import { useState } from "react";

export function DocumentGrid({ documents, customerId }: { documents: CustomerDocument[], customerId: string }) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, fileUrl: string) => {
    if (!confirm("Are you sure you want to securely delete this document?")) return;
    
    setIsDeleting(id);
    try {
      const result = await deleteDocument(id, fileUrl, customerId);
      if (result.error) throw new Error(result.error);
      toast.success("Document deleted securely");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    } finally {
      setIsDeleting(null);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="py-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
        <FileText className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-500 dark:text-zinc-400 font-medium">No documents uploaded yet.</p>
        <p className="text-sm text-zinc-400 mt-1">Upload KYC documents securely to enable AI features.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {documents.map((doc) => {
        const isPdf = doc.file_url.toLowerCase().endsWith('.pdf');
        
        return (
          <div key={doc.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex flex-col group relative overflow-hidden hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            {/* Private Badge */}
            <div className="absolute top-0 right-0 bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold px-2 py-1 rounded-bl-lg text-zinc-500 flex items-center z-10">
              <ShieldCheck className="h-3 w-3 mr-1" /> Private
            </div>

            <div className="flex items-start justify-between mb-3 z-10">
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{doc.document_type}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {new Date(doc.uploaded_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center bg-zinc-50 dark:bg-zinc-950 rounded-lg p-4 mb-4 border border-zinc-100 dark:border-zinc-800 overflow-hidden relative group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900 transition-colors">
              {isPdf ? (
                <FileText className="h-12 w-12 text-red-500 mb-2" />
              ) : (
                <div className="w-full h-32 flex items-center justify-center">
                   {doc.signed_url ? (
                     <img src={doc.signed_url} alt={doc.document_type} className="w-full h-full object-cover rounded-md" />
                   ) : (
                     <span className="text-xs text-zinc-400">Preview hidden</span>
                   )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-auto z-10">
              <div className="flex items-center space-x-2">
                {doc.ai_processed ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" title="AI Extracted Data Available">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> AI JSON Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    Pending AI
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {doc.signed_url && (
                  <a 
                    href={doc.signed_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-1.5 text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 rounded-md transition-colors"
                    title="View Securely"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <button 
                  onClick={() => handleDelete(doc.id, doc.file_url)}
                  disabled={isDeleting === doc.id}
                  className="p-1.5 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 bg-zinc-100 dark:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                  title="Delete Document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
