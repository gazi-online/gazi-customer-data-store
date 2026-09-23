"use client";

import { useState, useEffect } from "react";
import { CustomerDocument, AiImportHistoryRecord } from "@/types/document";
import { FileText, Cpu, RefreshCw, Archive, Replace, CheckCircle2, XCircle, Layers, User, Briefcase, Activity, Receipt, Download, Loader2, MessageSquare } from "lucide-react";
import { rerunExtraction, archiveDocument, getDocumentSignedUrl } from "@/app/(dashboard)/documents/actions";
import { toast } from "sonner";
import { ReviewPanel } from "@/components/AiSmartImportEngine/components/ReviewPanel";
import { MergedResult } from "@/components/AiSmartImportEngine/types";

import { AssignServiceForm } from "@/components/forms/AssignServiceForm";
import { Service, CustomerServiceWithDetails } from "@/types/service";
import { CustomerServiceFormData } from "@/app/(dashboard)/services/schema";
import { CustomerBillingTab } from "./CustomerBillingTab";
import { CustomerCommunicationsTimeline } from "./CustomerCommunicationsTimeline";
import { CustomerActivityTimelineTab } from "./CustomerActivityTimelineTab";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";
import { getActiveServices } from "@/app/(dashboard)/services/actions";
import { getCustomerBillingSummary } from "@/app/(dashboard)/invoices/actions";
import { useRouter, useSearchParams } from "next/navigation";

interface CustomerProfileTabsProps {
  customerId: string;
  customerName?: string;
  documents: CustomerDocument[];
  allDocuments: CustomerDocument[]; // Includes active, superseded, archived
  aiImports: AiImportHistoryRecord[];
  customerServices?: CustomerServiceWithDetails[];
}

type ProfileTab = 'overview' | 'documents' | 'ai-imports' | 'services' | 'billing' | 'communications' | 'activity';

export function CustomerProfileTabs({
  customerId,
  customerName = "Customer",
  documents,
  allDocuments,
  aiImports,
  customerServices = [],
}: CustomerProfileTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  
  const tabParam = searchParams.get("tab") as ProfileTab | null;
  const validTabs: ProfileTab[] = ['overview', 'documents', 'ai-imports', 'services', 'billing', 'communications', 'activity'];
  const initialTab: ProfileTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'documents';

  const [activeTab, setActiveTabState] = useState<ProfileTab>(initialTab);

  const setActiveTab = (tab: ProfileTab) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };
  const [filterDocStatus, setFilterDocStatus] = useState<'active' | 'all' | 'archived'>('active');
  const [runningRerunId, setRunningRerunId] = useState<string | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [rerunReviewResult, setRerunReviewResult] = useState<MergedResult | null>(null);
  
  // Transactional on-demand active services (never cached in TanStack Query)
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
  const [editingCustomerService, setEditingCustomerService] = useState<CustomerServiceFormData | undefined>(undefined);

  // Authoritative on-demand billing summary (never cached in TanStack Query)
  const [billingSummary, setBillingSummary] = useState<{
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
    overdue: number;
    invoices: any[];
    payments: any[];
  } | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const fetchBillingSummary = async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const res = await getCustomerBillingSummary(customerId);
      if (res.success && res.data) {
        setBillingSummary(res.data);
      } else {
        setBillingError(res.error || "Failed to load customer billing history.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load billing history.";
      setBillingError(message);
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    if (activeTab === 'billing' && !billingSummary) {
      void (async () => {
        await Promise.resolve();
        if (isCancelled) return;
        setBillingLoading(true);
        try {
          const res = await getCustomerBillingSummary(customerId);
          if (!isCancelled) {
            if (res.success && res.data) {
              setBillingSummary(res.data);
            } else {
              setBillingError(res.error || "Failed to load customer billing history.");
            }
          }
        } catch (err: unknown) {
          if (!isCancelled) {
            setBillingError(err instanceof Error ? err.message : "Failed to load billing history.");
          }
        } finally {
          if (!isCancelled) {
            setBillingLoading(false);
          }
        }
      })();
    }
    return () => {
      isCancelled = true;
    };
  }, [activeTab, customerId, billingSummary]);

  const handleOpenAssignService = async (serviceData?: CustomerServiceFormData) => {
    setIsLoadingServices(true);
    try {
      const services = await getActiveServices();
      if (!services || services.length === 0) {
        toast.error("No active services currently available in catalog");
        return;
      }
      setAvailableServices(services);
      setEditingCustomerService(serviceData);
      setIsServiceFormOpen(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load active services";
      toast.error(message);
    } finally {
      setIsLoadingServices(false);
    }
  };

  const displayedDocs = allDocuments.filter(doc => {
    if (filterDocStatus === 'active') return doc.status === 'active' || !doc.status;
    if (filterDocStatus === 'archived') return doc.status === 'archived';
    return true; // 'all'
  });

  const handleRerun = async (docId: string) => {
    try {
      setRunningRerunId(docId);
      toast.info("Triggering AI extraction re-run...");
      
      const result = await rerunExtraction(docId, customerId);
      if (result.error) throw new Error(result.error);
      
      toast.success(result.cacheHit ? "⚡ Re-run completed via AI Cache!" : "Re-run completed via AI Engine.");
      
      if (result.data) {
        // Construct MergedResult for ReviewPanel
        const mockResult: MergedResult = {
          data: result.data,
          conflicts: [],
          jobs: [{
            id: docId,
            documentType: "Document Re-run",
            provider: "gemini",
            source: "file",
            status: "completed",
            version: 1,
            perfSummary: {
              provider: "gemini",
              model: "gemini-flash-latest",
              documentCount: 1,
              imagePrepTime: 10,
              primaryAttemptDuration: 100,
              fallbackAttemptDuration: 0,
              apiTime: 100,
              jsonParseTime: 5,
              normalizationTime: 10,
              dbLogTime: 15,
              totalTime: 140,
              cacheHit: result.cacheHit
            }
          }]
        };
        setRerunReviewResult(mockResult);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to re-run extraction");
    } finally {
      setRunningRerunId(null);
    }
  };

  const handleArchive = async (docId: string) => {
    if (!confirm("Are you sure you want to archive this document?")) return;
    try {
      const res = await archiveDocument(docId, customerId);
      if (res.error) throw new Error(res.error);
      toast.success("Document archived cleanly.");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.documents.vaultLists(DASHBOARD_MEMORY_SCOPE),
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to archive document");
    }
  };

  const handleDownloadDoc = async (doc: CustomerDocument) => {
    setDownloadingDocId(doc.id);
    try {
      const targetFilename = doc.source_filename || `${doc.document_type.replace(/\s+/g, '_')}_${doc.id.slice(0, 6)}`;
      // Security: pass doc.id (server resolves storage path and validates authorization)
      const result = await getDocumentSignedUrl(doc.id, true, targetFilename);
      if (result.error || !result.signedUrl) {
        throw new Error(result.error || "Failed to generate download URL");
      }
      const link = document.createElement("a");
      link.href = result.signedUrl;
      link.download = targetFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Secure download started");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download document";
      toast.error(msg);
    } finally {
      setDownloadingDocId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 -mx-4 sm:mx-0 px-4 sm:px-0">
        <nav className="flex space-x-2 sm:space-x-8 overflow-x-auto scrollbar-none py-1" aria-label="Tabs">
          {[
            { id: 'documents', label: 'Documents Timeline', icon: FileText, count: documents.length },
            { id: 'ai-imports', label: 'AI Imports Audit', icon: Cpu, count: aiImports.length },
            { id: 'overview', label: 'Overview', icon: User },
            { id: 'services', label: 'Services', icon: Briefcase, count: customerServices.length },
            { id: 'billing', label: 'Billing & History', icon: Receipt, count: billingSummary?.invoices?.length },
            { id: 'communications', label: 'Communications', icon: MessageSquare },
            { id: 'activity', label: 'Activity Log', icon: Activity },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (tab.id === 'billing') {
                    fetchBillingSummary();
                  }
                }}
                className={`py-3 sm:py-4 px-2 sm:px-1 inline-flex items-center text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 min-h-[44px] ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <Icon className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-1.5 sm:ml-2 px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-mono ${
                    isActive
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {isServiceFormOpen && (
        <AssignServiceForm
          customerId={customerId}
          availableServices={availableServices}
          customerService={editingCustomerService}
          onClose={() => setIsServiceFormOpen(false)}
          onSuccess={() => {
            setIsServiceFormOpen(false);
            router.refresh();
          }}
        />
      )}

      {/* Rerun Review Modal Panel */}
      {rerunReviewResult && (
        <div className="mb-6 p-4 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center">
              <RefreshCw className="h-4 w-4 mr-2 text-indigo-600 animate-spin" />
              Re-run Extraction Review Result
            </h4>
            <button 
              onClick={() => setRerunReviewResult(null)}
              className="text-xs text-zinc-500 hover:text-zinc-900 font-semibold p-1 min-h-[36px]"
            >
              Close Review
            </button>
          </div>
          <ReviewPanel 
            result={rerunReviewResult} 
            onConfirm={(data) => {
              toast.success("Re-run reviewed! Copy data or update form manually.");
              setRerunReviewResult(null);
            }} 
          />
        </div>
      )}

      {/* DOCUMENTS TIMELINE TAB */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
              <Layers className="h-5 w-5 mr-2 text-indigo-600 shrink-0" />
              Customer Documents Timeline
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg text-xs font-medium">
              <button
                onClick={() => setFilterDocStatus('active')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md transition-colors min-h-[36px] sm:min-h-0 ${
                  filterDocStatus === 'active' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'
                }`}
              >
                Active ({allDocuments.filter(d => d.status === 'active' || !d.status).length})
              </button>
              <button
                onClick={() => setFilterDocStatus('all')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md transition-colors min-h-[36px] sm:min-h-0 ${
                  filterDocStatus === 'all' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'
                }`}
              >
                All ({allDocuments.length})
              </button>
              <button
                onClick={() => setFilterDocStatus('archived')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md transition-colors min-h-[36px] sm:min-h-0 ${
                  filterDocStatus === 'archived' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'
                }`}
              >
                Archived ({allDocuments.filter(d => d.status === 'archived').length})
              </button>
            </div>
          </div>

          {displayedDocs.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <FileText className="h-10 w-10 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-500">No documents found matching current filter.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedDocs.map(doc => (
                <div 
                  key={doc.id}
                  className={`p-5 rounded-xl border transition-all ${
                    doc.status === 'archived'
                      ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 opacity-60'
                      : doc.status === 'superseded'
                      ? 'bg-amber-50/40 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/30'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start space-x-4">
                      <div className="h-12 w-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">{doc.document_type}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                            doc.status === 'archived' ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' :
                            doc.status === 'superseded' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                            'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                          }`}>
                            {doc.status || 'active'}
                          </span>
                          {doc.version && doc.version > 1 && (
                            <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              v{doc.version}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-zinc-500 font-mono">
                          <span>File: {doc.source_filename || doc.file_url.split('/').pop()}</span>
                          {doc.file_size && <span>Size: {(doc.file_size / 1024).toFixed(1)} KB</span>}
                          <span>Side: {doc.side || 'single'}</span>
                          <span>Uploaded: {new Date(doc.uploaded_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800">
                      {doc.signed_url && (
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-semibold transition-colors min-h-[38px] inline-flex items-center"
                        >
                          Preview
                        </a>
                      )}

                      <button
                        onClick={() => handleDownloadDoc(doc)}
                        disabled={downloadingDocId === doc.id}
                        className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-semibold transition-colors flex items-center disabled:opacity-50 min-h-[38px]"
                        title="Download Document"
                      >
                        {downloadingDocId === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Download
                      </button>

                      {doc.status !== 'archived' && (
                        <>
                          <button
                            onClick={() => handleRerun(doc.id)}
                            disabled={runningRerunId === doc.id}
                            className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-colors flex items-center min-h-[38px]"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runningRerunId === doc.id ? 'animate-spin' : ''}`} />
                            Re-run AI
                          </button>

                          <button
                            onClick={() => handleArchive(doc.id)}
                            className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-zinc-600 dark:text-zinc-400 rounded-lg text-xs font-semibold transition-colors flex items-center min-h-[38px]"
                          >
                            <Archive className="h-3.5 w-3.5 mr-1.5" />
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI IMPORTS AUDIT TAB */}
      {activeTab === 'ai-imports' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
              <Cpu className="h-5 w-5 mr-2 text-indigo-600" />
              AI Extraction Import Audit Logs ({aiImports.length})
            </h3>
          </div>

          {aiImports.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <Cpu className="h-10 w-10 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-500">No AI import history records linked to this customer profile yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {aiImports.map(imp => (
                <div key={imp.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center ${
                        imp.status === 'success'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        {imp.status === 'success' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {imp.status}
                      </span>
                      {imp.cache_hit && (
                        <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          ⚡ CACHE HIT
                        </span>
                      )}
                    </div>
                    <span className="text-zinc-400">{new Date(imp.created_at).toLocaleString()}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-zinc-700 dark:text-zinc-300">
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase font-sans">Provider</p>
                      <p className="font-bold">{imp.ai_provider || 'gemini'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase font-sans">Model</p>
                      <p className="font-bold">{imp.model_name || 'gemini-flash-latest'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase font-sans">Prompt Version</p>
                      <p className="font-bold">{imp.prompt_version || 'v1'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase font-sans">Duration</p>
                      <p className="font-bold">{imp.processing_time_ms || 0} ms</p>
                    </div>
                  </div>

                  {imp.error_message && (
                    <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded text-red-700 dark:text-red-300">
                      Error: {imp.error_message}
                    </div>
                  )}

                  {imp.final_json && (
                    <details className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                      <summary className="cursor-pointer font-bold hover:text-indigo-600 dark:hover:text-indigo-400">
                        View Validated Structured Result
                      </summary>
                      <pre className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded overflow-x-auto text-[10px]">
                        {JSON.stringify(imp.final_json, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Profile Overview</h3>
          <p className="text-xs text-zinc-500">Summary metrics, document count ({documents.length}), and AI extraction history linked to customer ID.</p>
        </div>
      )}

      {/* SERVICES TAB */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
                <Briefcase className="h-5 w-5 mr-2 text-indigo-600" />
                Subscribed Services
              </h3>
              <p className="text-sm text-zinc-500">Manage services and subscriptions assigned to this customer.</p>
            </div>
            <button
              onClick={() => handleOpenAssignService(undefined)}
              disabled={isLoadingServices}
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
            >
              {isLoadingServices ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Loading Catalog...
                </>
              ) : (
                "Assign Service"
              )}
            </button>
          </div>

          {customerServices.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <Briefcase className="h-10 w-10 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-500">No services assigned to this customer yet.</p>
              <button
                onClick={() => handleOpenAssignService(undefined)}
                disabled={isLoadingServices}
                className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm disabled:opacity-50"
              >
                + Assign their first service
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {customerServices.map(cs => (
                <div key={cs.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <span className="font-mono text-xs font-semibold px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded border border-zinc-200 dark:border-zinc-700">
                          {cs.service?.service_code}
                        </span>
                        <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-lg">
                          {cs.service?.service_name}
                        </h4>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3">
                        <div>
                          <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">Status</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                            cs.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            cs.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            cs.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {cs.status.replace('_', ' ')}
                          </span>
                        </div>
                        
                        <div>
                          <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">Payment</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                            cs.payment_status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            cs.payment_status === 'unpaid' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            {cs.payment_status}
                          </span>
                        </div>

                        <div>
                          <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">Amount</p>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            ₹{Number(cs.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">Service Date</p>
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            {new Date(cs.service_date).toLocaleDateString()}
                          </p>
                        </div>
                        
                        {cs.completed_at && (
                          <div>
                            <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">Completed On</p>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              {new Date(cs.completed_at).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {cs.notes && (
                        <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-lg text-sm text-zinc-600 dark:text-zinc-400">
                          {cs.notes}
                        </div>
                      )}
                    </div>
                    
                    <div className="shrink-0">
                      <button
                        onClick={() => {
                          handleOpenAssignService({
                            id: cs.id,
                            customer_id: cs.customer_id,
                            service_id: cs.service_id,
                            status: cs.status,
                            amount: cs.amount,
                            payment_status: cs.payment_status,
                            service_date: cs.service_date.split('T')[0],
                            due_date: cs.due_date ? cs.due_date.split('T')[0] : null,
                            notes: cs.notes,
                            priority: cs.priority || 'normal',
                            request_number: cs.request_number || null,
                            application_reference: cs.application_reference || null,
                            portal_name: cs.portal_name || null,
                            rejection_reason: cs.rejection_reason || null,
                            delivered_at: cs.delivered_at || null,
                          });
                        }}
                        disabled={isLoadingServices}
                        className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50"
                        title="Update Service Details"
                      >
                        <Replace className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BILLING TAB */}
      {activeTab === 'billing' && (
        billingLoading ? (
          <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-4 animate-pulse">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="flex gap-2">
                <div className="h-8 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
                <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
              ))}
            </div>
            <div className="h-48 bg-zinc-100 dark:bg-zinc-800/40 rounded-xl" />
          </div>
        ) : (
          <CustomerBillingTab
            customerId={customerId}
            customerName={customerName}
            billingSummary={billingSummary || { totalBilled: 0, totalPaid: 0, outstanding: 0, overdue: 0, invoices: [], payments: [] }}
            error={billingError}
            onBillingChanged={fetchBillingSummary}
          />
        )
      )}

      {/* COMMUNICATIONS TAB */}
      {activeTab === 'communications' && (
        <CustomerCommunicationsTimeline
          customerId={customerId}
          customerName={customerName}
        />
      )}

      {/* ACTIVITY TIMELINE TAB */}
      {activeTab === 'activity' && (
        <CustomerActivityTimelineTab
          customerId={customerId}
          customerName={customerName}
        />
      )}
    </div>
  );
}
