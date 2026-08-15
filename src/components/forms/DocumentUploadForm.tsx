"use client";

import { useState } from "react";
import { uploadDocument } from "@/app/(dashboard)/documents/actions";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { DocumentType } from "@/types/document";

const documentTypes: DocumentType[] = [
  'Aadhaar Card (Front)', 'Aadhaar Card (Back)', 'PAN Card', 'Passport',
  'Driving License', 'Voter ID', 'Trade License', 'GST Certificate',
  'Business Registration', 'Bank Passbook', 'Agreement', 'Photo', 'Other'
];

export function DocumentUploadForm({ customerId }: { customerId: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>('Aadhaar Card (Front)');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Please select a file");
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("customer_id", customerId);
    formData.append("document_type", docType);

    try {
      const result = await uploadDocument(formData);
      if (result.error) throw new Error(result.error);
      
      toast.success("Document uploaded securely");
      setFile(null); // Reset
      (document.getElementById("file-upload") as HTMLInputElement).value = "";
    } catch (error: any) {
      toast.error(error.message || "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleUpload} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm mb-6">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full space-y-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Document Type</label>
          <select 
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
            className="w-full p-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-transparent text-sm focus:ring-2 focus:ring-blue-500 transition-shadow"
          >
            {documentTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        
        <div className="flex-1 w-full space-y-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Select File (Max 10MB)</label>
          <input 
            id="file-upload"
            type="file" 
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full p-1.5 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm bg-transparent file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-zinc-800 dark:file:text-zinc-300 transition-colors"
          />
        </div>
        
        <button 
          type="submit" 
          disabled={!file || isUploading}
          className="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors flex items-center font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm h-11"
        >
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          Upload Securely
        </button>
      </div>
    </form>
  );
}
