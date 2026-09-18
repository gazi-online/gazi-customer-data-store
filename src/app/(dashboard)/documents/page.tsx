"use client";

import { useState, useEffect, useTransition, Suspense } from "react";
import { 
  FileText, 
  UploadCloud, 
  Search, 
  Filter, 
  Plus, 
  ShieldCheck, 
  HardDrive, 
  CheckCircle2, 
  Archive, 
  LayoutGrid, 
  List, 
  ExternalLink, 
  Download, 
  Trash2, 
  Loader2, 
  User, 
  X,
  RefreshCw
} from "lucide-react";
import { getAllDocuments, deleteCustomerDocument, getDocumentSignedUrl } from "./actions";
import { getCustomers } from "../customers/actions";
import { DocumentUploadForm } from "@/components/forms/DocumentUploadForm";
import { DocumentGrid } from "@/components/shared/DocumentGrid";
import { CustomerDocument, DocumentType } from "@/types/document";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const DOCUMENT_TYPES = [
  "All Types",
  "Aadhaar Card (Front)",
  "Aadhaar Card (Back)",
  "PAN Card",
  "Passport",
  "Driving License",
  "Voter ID",
  "Trade License",
  "GST Certificate",
  "Business Registration",
  "Bank Passbook",
  "Agreement",
  "Photo",
  "Other"
];

function DocumentsContent() {
  const searchParams = useSearchParams();
  const initialRenewal = searchParams.get("renewal") || "all";
  const [isPending, startTransition] = useTransition();
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    archived: 0,
    totalSizeBytes: 0
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocType, setSelectedDocType] = useState("All Types");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "archived">("active");
  const [renewalFilter, setRenewalFilter] = useState<string>(initialRenewal);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load documents and customers list
  const loadData = async () => {
    setIsLoading(true);
    try {
      const typeParam = selectedDocType === "All Types" ? "" : selectedDocType;
      const res = await getAllDocuments({
        search: searchQuery,
        documentType: typeParam,
        status: statusFilter,
        renewalWindow: renewalFilter
      });

      if ("error" in res && res.error) {
        toast.error(res.error);
      }

      setDocuments(res.documents || []);
      setStats(res.stats || { total: 0, active: 0, archived: 0, totalSizeBytes: 0 });
    } catch (err: any) {
      toast.error(err.message || "Failed to load customer documents");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery, selectedDocType, statusFilter, renewalFilter]);

  // Load customer list for upload dropdown once
  useEffect(() => {
    getCustomers("", "active")
      .then((data) => setCustomers(data || []))
      .catch((err) => console.error("Error fetching customers list:", err));
  }, []);

  const handleDeleteDocument = async (doc: CustomerDocument) => {
    const docTitle = doc.document_name || doc.document_type;
    if (!confirm(`Are you sure you want to securely delete "${docTitle}"?`)) return;

    setDeletingId(doc.id);
    try {
      const result = await deleteCustomerDocument(doc.id, true);
      if (result.error) throw new Error(result.error);
      toast.success("Document deleted securely from private storage");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadDocument = async (doc: CustomerDocument) => {
    setDownloadingId(doc.id);
    try {
      const targetFilename = doc.source_filename || `${doc.document_type.replace(/\s+/g, '_')}_${doc.id.slice(0, 6)}`;
      const result = await getDocumentSignedUrl(doc.file_url, true, targetFilename);
      if (result.error || !result.signedUrl) {
        throw new Error(result.error || "Could not generate download link");
      }

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

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-150 pb-12 w-full max-w-full overflow-x-hidden">
      {/* Page Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-xs">
            <FileText className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Documents Vault
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Manage, view, and store private KYC and customer documents securely.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <button
            onClick={() => loadData()}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 rounded-xl text-sm font-medium transition-colors shadow-xs"
            title="Refresh documents list"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex-1 sm:flex-initial px-4 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center shadow-xs"
          >
            <Plus className="h-4 w-4 mr-1.5 shrink-0" /> Upload Document
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Documents</span>
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5 sm:mt-2">{stats.total}</p>
          <span className="text-[10px] sm:text-xs text-zinc-400">Across all customers</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider">Active Files</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5 sm:mt-2">{stats.active}</p>
          <span className="text-[10px] sm:text-xs text-emerald-600 font-medium">Ready for verification</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider">Archived Files</span>
            <Archive className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5 sm:mt-2">{stats.archived}</p>
          <span className="text-[10px] sm:text-xs text-zinc-400">Superseded / History</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider">Private Storage</span>
            <HardDrive className="h-4 w-4 text-purple-600" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5 sm:mt-2">
            {(stats.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB
          </p>
          <span className="text-[10px] sm:text-xs text-purple-600 font-medium">Encrypted bucket</span>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by customer, document type, or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs sm:text-sm bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto">
            {/* Document Type Dropdown */}
            <div className="w-full sm:w-56">
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="w-full px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs sm:text-sm bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
              {/* Status Segmented Control */}
              <div className="flex items-center space-x-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl text-xs font-semibold flex-1 sm:flex-initial">
                <button
                  onClick={() => setStatusFilter("active")}
                  className={`px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[36px] sm:min-h-0 rounded-lg transition-all flex-1 sm:flex-initial text-center ${
                    statusFilter === "active"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  Active ({stats.active})
                </button>
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[36px] sm:min-h-0 rounded-lg transition-all flex-1 sm:flex-initial text-center ${
                    statusFilter === "all"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  All ({stats.total})
                </button>
                <button
                  onClick={() => setStatusFilter("archived")}
                  className={`px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[36px] sm:min-h-0 rounded-lg transition-all flex-1 sm:flex-initial text-center ${
                    statusFilter === "archived"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  Archived ({stats.archived})
                </button>
              </div>

              {/* View Mode Toggle (Grid vs Table) */}
              <div className="flex items-center space-x-1 border border-zinc-200 dark:border-zinc-700 p-1 rounded-xl bg-zinc-50 dark:bg-zinc-800 shrink-0">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 sm:p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-all ${
                    viewMode === "grid"
                      ? "bg-white dark:bg-zinc-700 text-blue-600 shadow-xs"
                      : "text-zinc-400 hover:text-zinc-600"
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-2 sm:p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-all ${
                    viewMode === "table"
                      ? "bg-white dark:bg-zinc-700 text-blue-600 shadow-xs"
                      : "text-zinc-400 hover:text-zinc-600"
                  }`}
                  title="Table View"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Renewal Operations Quick Filters */}
        <div className="flex items-center gap-1.5 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs overflow-x-auto scrollbar-none py-1 -mx-3.5 sm:mx-0 px-3.5 sm:px-0">
          <span className="font-bold text-zinc-500 shrink-0 uppercase text-[10px] tracking-wider pl-1">Renewal Window:</span>
          {[
            { label: "All Documents", value: "all" },
            { label: "Expired", value: "expired" },
            { label: "Due in 7 Days", value: "7d" },
            { label: "Due in 30 Days", value: "30d" },
            { label: "Due in 60 Days", value: "60d" },
          ].map((btn) => (
            <button
              key={btn.value}
              type="button"
              onClick={() => setRenewalFilter(btn.value)}
              className={`px-3 py-1.5 min-h-[36px] sm:min-h-0 rounded-lg font-medium transition-all shrink-0 whitespace-nowrap ${
                renewalFilter === btn.value
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">Loading secure documents...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900">
          <FileText className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">No documents found</h3>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
            {searchQuery || selectedDocType !== "All Types" || statusFilter !== "active"
              ? "No customer documents match your filter criteria. Try adjusting your search."
              : "Start by uploading Aadhaar, PAN, Voter ID, or other customer documents securely."}
          </p>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors inline-flex items-center shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Upload Document
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <DocumentGrid
          documents={documents}
          showCustomerInfo={true}
          onDocumentDeleted={loadData}
        />
      ) : (
        /* Table View */
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-600 dark:text-zinc-400">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-xs uppercase font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 sm:px-5 py-3.5">Document</th>
                  <th className="px-4 sm:px-5 py-3.5">Customer</th>
                  <th className="px-4 sm:px-5 py-3.5">Format & Size</th>
                  <th className="px-4 sm:px-5 py-3.5">Status</th>
                  <th className="px-4 sm:px-5 py-3.5">Uploaded</th>
                  <th className="px-4 sm:px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {documents.map((doc) => {
                  const isPdf = doc.mime_type?.includes("pdf") || doc.file_url.toLowerCase().endsWith(".pdf");
                  const customerName = doc.customer
                    ? [doc.customer.first_name, doc.customer.middle_name, doc.customer.last_name].filter(Boolean).join(" ")
                    : "Unknown Customer";

                  return (
                    <tr key={doc.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 sm:px-5 py-4">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                              isPdf
                                ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30"
                                : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30"
                            }`}
                          >
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="truncate max-w-[180px] sm:max-w-[220px]">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm truncate">
                              {doc.document_type}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">
                              {doc.document_name || doc.source_filename || doc.file_url.split("/").pop()}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 sm:px-5 py-4">
                        {doc.customer ? (
                          <div>
                            <Link
                              href={`/customers/${doc.customer_id}`}
                              className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-blue-600 text-sm flex items-center"
                            >
                              <User className="h-3.5 w-3.5 mr-1 text-blue-500 shrink-0" />
                              <span className="truncate max-w-[140px]">{customerName}</span>
                            </Link>
                            <p className="text-xs font-mono text-zinc-400">{doc.customer.customer_code}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400">N/A</span>
                        )}
                      </td>

                      <td className="px-4 sm:px-5 py-4">
                        <div className="text-xs font-mono">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {isPdf ? "PDF" : doc.mime_type?.split("/")[1]?.toUpperCase() || "IMAGE"}
                          </span>
                          <p className="text-zinc-400">
                            {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : "—"}
                          </p>
                        </div>
                      </td>

                      <td className="px-4 sm:px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            doc.status === "archived"
                              ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              : doc.status === "superseded"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          }`}
                        >
                          {doc.status || "active"}
                        </span>
                      </td>

                      <td className="px-4 sm:px-5 py-4 text-xs font-mono text-zinc-500">
                        {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : "—"}
                      </td>

                      <td className="px-4 sm:px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 sm:space-x-1.5">
                          {doc.signed_url && (
                            <a
                              href={doc.signed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl transition-colors"
                              title="View Document via Signed URL"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}

                          <button
                            onClick={() => handleDownloadDocument(doc)}
                            disabled={downloadingId === doc.id}
                            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
                            title="Download Document"
                          >
                            {downloadingId === doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteDocument(doc)}
                            disabled={deletingId === doc.id}
                            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors disabled:opacity-50"
                            title="Delete Document"
                          >
                            {deletingId === doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Modal Dialog */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 truncate">Upload Document</h3>
                  <p className="text-[11px] sm:text-xs text-zinc-500 truncate">Saved in private Supabase storage</p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <DocumentUploadForm
              customers={customers}
              onSuccess={() => {
                setIsUploadModalOpen(false);
                loadData();
              }}
              onCancel={() => setIsUploadModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          <p className="text-sm">Loading document vault...</p>
        </div>
      }
    >
      <DocumentsContent />
    </Suspense>
  );
}
