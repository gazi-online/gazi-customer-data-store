"use client";

import { useState } from "react";
import { CustomerDocument, AiImportHistoryRecord } from "@/types/document";
import { FileText, Cpu, Clock, RefreshCw, Archive, Replace, CheckCircle2, XCircle, AlertCircle, FileCode, Layers, User, Briefcase, Activity } from "lucide-react";
import { rerunExtraction, archiveDocument } from "@/app/(dashboard)/documents/actions";
import { toast } from "sonner";
import { ReviewPanel } from "@/components/AiSmartImportEngine/components/ReviewPanel";
import { MergedResult } from "@/components/AiSmartImportEngine/types";

import { AssignServiceForm } from "@/components/forms/AssignServiceForm";
import { Service, CustomerServiceWithDetails } from "@/types/service";
import { CustomerServiceFormData } from "@/app/(dashboard)/services/schema";

interface CustomerProfileTabsProps {
  customerId: string;
  documents: CustomerDocument[];
  allDocuments: CustomerDocument[]; // Includes active, superseded, archived
  aiImports: AiImportHistoryRecord[];
  customerServices?: CustomerServiceWithDetails[];
  availableServices?: Service[];
}

export function CustomerProfileTabs({
  customerId,
  documents,
  allDocuments,
  aiImports,
  customerServices = [],
  availableServices = []
}: CustomerProfileTabsProps) {
  console.log(`[TRACE] CustomerProfileTabs activeServices: ${availableServices?.length || 0}`);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'ai-imports' | 'services' | 'activity'>('documents');
  const [filterDocStatus, setFilterDocStatus] = useState<'active' | 'all' | 'archived'>('active');
  const [runningRerunId, setRunningRerunId] = useState<string | null>(null);
  const [rerunReviewResult, setRerunReviewResult] = useState<MergedResult | null>(null);
  
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
  const [editingCustomerService, setEditingCustomerService] = useState<CustomerServiceFormData | undefined>(undefined);

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
    try {
      const res = await archiveDocument(docId, customerId);
      if (res.error) throw new Error(res.error);
      toast.success("Document archived cleanly.");
    } catch (err: any) {
      toast.error(err.message || "Failed to archive document");
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="flex space-x-8" aria-label="Tabs">
          {[
            { id: 'documents', label: 'Documents Timeline', icon: FileText, count: documents.length },
            { id: 'ai-imports', label: 'AI Imports Audit', icon: Cpu, count: aiImports.length },
            { id: 'overview', label: 'Overview', icon: User },
            { id: 'services', label: 'Services', icon: Briefcase, count: customerServices.length },
            { id: 'activity', label: 'Activity Log', icon: Activity },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 inline-flex items-center text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <Icon className="mr-2 h-4 w-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-mono ${
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
            // Form actions revalidate path, so UI will update
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
              className="text-xs text-zinc-500 hover:text-zinc-900 font-semibold"
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
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
              <Layers className="h-5 w-5 mr-2 text-indigo-600" />
              Customer Documents Timeline
            </h3>
            <div className="flex items-center space-x-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg text-xs font-medium">
              <button
                onClick={() => setFilterDocStatus('active')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  filterDocStatus === 'active' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'
                }`}
              >
                Active Only ({allDocuments.filter(d => d.status === 'active' || !d.status).length})
              </button>
              <button
                onClick={() => setFilterDocStatus('all')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  filterDocStatus === 'all' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'
                }`}
              >
                All Versions ({allDocuments.length})
              </button>
              <button
                onClick={() => setFilterDocStatus('archived')}
                className={`px-3 py-1 rounded-md transition-colors ${
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

                    <div className="flex items-center space-x-2 shrink-0">
                      {doc.signed_url && (
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Preview
                        </a>
                      )}

                      {doc.status !== 'archived' && (
                        <>
                          <button
                            onClick={() => handleRerun(doc.id)}
                            disabled={runningRerunId === doc.id}
                            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-colors flex items-center"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${runningRerunId === doc.id ? 'animate-spin' : ''}`} />
                            Re-run AI
                          </button>

                          <button
                            onClick={() => handleArchive(doc.id)}
                            className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-zinc-600 dark:text-zinc-400 rounded-lg text-xs font-semibold transition-colors flex items-center"
                          >
                            <Archive className="h-3.5 w-3.5 mr-1" />
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
              onClick={() => {
                setEditingCustomerService(undefined);
                setIsServiceFormOpen(true);
              }}
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm"
            >
              Assign Service
            </button>
          </div>

          {customerServices.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <Briefcase className="h-10 w-10 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-500">No services assigned to this customer yet.</p>
              <button
                onClick={() => {
                  setEditingCustomerService(undefined);
                  setIsServiceFormOpen(true);
                }}
                className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm"
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
                          setEditingCustomerService({
                            id: cs.id,
                            customer_id: cs.customer_id,
                            service_id: cs.service_id,
                            status: cs.status,
                            amount: cs.amount,
                            payment_status: cs.payment_status,
                            service_date: cs.service_date.split('T')[0],
                            due_date: cs.due_date ? cs.due_date.split('T')[0] : null,
                            notes: cs.notes
                          });
                          setIsServiceFormOpen(true);
                        }}
                        className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
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

      {/* ACTIVITY PLACEHOLDER TAB */}
      {activeTab === 'activity' && (
        <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
          <Activity className="h-8 w-8 text-zinc-400 mx-auto" />
          <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Customer Activity Log</h4>
          <p className="text-xs text-zinc-500">System audit trail & user actions log (Placeholder).</p>
        </div>
      )}
    </div>
  );
}
