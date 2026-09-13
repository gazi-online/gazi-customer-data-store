"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ServiceRequestDeskRow,
  ServiceRequestsSummaryMetrics,
  PERSISTED_STATUSES,
  VALID_PRIORITIES,
  VALID_PAYMENT_STATUSES,
  ALLOWED_LIMITS,
} from "@/app/(dashboard)/requests/types";
import { RequestsTable } from "./RequestsTable";
import {
  Search,
  Filter,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Inbox,
  AlertTriangle,
  FileSearch,
  ArrowUpDown
} from "lucide-react";
import { getServiceRequestStatusLabel } from "@/lib/services/serviceRequestWorkflow";

interface RequestsDeskViewProps {
  initialRequests: ServiceRequestDeskRow[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  metrics: ServiceRequestsSummaryMetrics;
  catalogServices: Array<{ id: string; service_name: string; service_code: string }>;
  searchTooBroad?: boolean;
  error?: string | null;
}

export function RequestsDeskView({
  initialRequests,
  totalCount,
  page,
  limit,
  totalPages,
  metrics,
  catalogServices,
  searchTooBroad = false,
  error = null,
}: RequestsDeskViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Local state for search bar
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");

  // Current active parameters from URL
  const currentQ = searchParams.get("q") || "";
  const currentStatus = searchParams.get("status") || "active";
  const currentPriority = searchParams.get("priority") || "all";
  const currentService = searchParams.get("service") || "all";
  const currentPayment = searchParams.get("payment") || "all";
  const currentOverdue = searchParams.get("overdue") || "all";
  const currentSort = searchParams.get("sort") || "oldest";

  const hasActiveFilters =
    Boolean(currentQ) ||
    currentStatus !== "active" ||
    currentPriority !== "all" ||
    currentService !== "all" ||
    currentPayment !== "all" ||
    currentOverdue !== "all" ||
    currentSort !== "oldest";

  const updateUrlParams = (updates: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    // Whenever a filter or search changes (not page), reset page to 1
    if (!updates.page) {
      params.delete("page");
    }

    startTransition(() => {
      router.push(`/requests?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlParams({ q: searchInput.trim() });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    updateUrlParams({ q: null });
  };

  const handleResetFilters = () => {
    setSearchInput("");
    startTransition(() => {
      router.push("/requests");
    });
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    startTransition(() => {
      router.push(`/requests?${params.toString()}`);
    });
  };

  const fromRecord = totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const toRecord = Math.min(page * limit, totalCount);

  return (
    <div className="space-y-6">
      {/* 1. TOP SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Queue Card */}
        <button
          type="button"
          onClick={() => updateUrlParams({ status: "active", overdue: null })}
          className={`p-4 rounded-2xl border text-left transition-all ${
            currentStatus === "active" && currentOverdue !== "overdue_only"
              ? "bg-violet-50/80 border-violet-300 ring-2 ring-violet-500/20 shadow-xs dark:bg-violet-950/20 dark:border-violet-800"
              : "bg-white border-slate-200/80 hover:border-slate-300 dark:bg-zinc-900 dark:border-zinc-800 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Active Queue
            </span>
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center text-violet-600 dark:text-violet-400">
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-zinc-50">
              {metrics.activeCount}
            </span>
            <span className="text-[11px] text-slate-400">requests in-flight</span>
          </div>
        </button>

        {/* Action Required Card */}
        <button
          type="button"
          onClick={() => updateUrlParams({ status: "action_required", overdue: null })}
          className={`p-4 rounded-2xl border text-left transition-all ${
            currentStatus === "action_required"
              ? "bg-rose-50/90 border-rose-300 ring-2 ring-rose-500/20 shadow-xs dark:bg-rose-950/30 dark:border-rose-800"
              : "bg-white border-slate-200/80 hover:border-slate-300 dark:bg-zinc-900 dark:border-zinc-800 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Action Required
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {metrics.actionRequiredCount}
            </span>
            <span className="text-[11px] text-slate-400">needs staff action</span>
          </div>
        </button>

        {/* Documents Pending Card */}
        <button
          type="button"
          onClick={() => updateUrlParams({ status: "documents_pending", overdue: null })}
          className={`p-4 rounded-2xl border text-left transition-all ${
            currentStatus === "documents_pending"
              ? "bg-purple-50/80 border-purple-300 ring-2 ring-purple-500/20 shadow-xs dark:bg-purple-950/30 dark:border-purple-800"
              : "bg-white border-slate-200/80 hover:border-slate-300 dark:bg-zinc-900 dark:border-zinc-800 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Docs Pending
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <FileSearch className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-zinc-50">
              {metrics.docsPendingCount}
            </span>
            <span className="text-[11px] text-slate-400">awaiting uploads</span>
          </div>
        </button>

        {/* Overdue Card */}
        <button
          type="button"
          onClick={() => updateUrlParams({ overdue: "overdue_only", status: "active" })}
          className={`p-4 rounded-2xl border text-left transition-all ${
            currentOverdue === "overdue_only"
              ? "bg-amber-50/90 border-amber-300 ring-2 ring-amber-500/20 shadow-xs dark:bg-amber-950/30 dark:border-amber-800"
              : "bg-white border-slate-200/80 hover:border-slate-300 dark:bg-zinc-900 dark:border-zinc-800 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Overdue
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {metrics.overdueCount}
            </span>
            <span className="text-[11px] text-slate-400">past due date</span>
          </div>
        </button>
      </div>

      {/* 2. SEARCH & FILTER TOOLBAR */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
        {/* Row 1: Search Form + Sort Selector */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search request #, app ref, customer name, phone, service..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 bg-slate-50/80 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-slate-900 dark:text-zinc-100"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-full"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <ArrowUpDown className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Sort:</span>
            <select
              value={currentSort}
              onChange={(e) => updateUrlParams({ sort: e.target.value })}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 dark:text-zinc-200 cursor-pointer"
            >
              <option value="oldest">Oldest Pending (FIFO)</option>
              <option value="newest">Newest First</option>
              <option value="due_date">Due Date (Earliest)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Filter Selectors */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Filters:</span>
          </div>

          {/* Status Dropdown */}
          <select
            value={currentStatus}
            onChange={(e) => updateUrlParams({ status: e.target.value })}
            className="px-3 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 dark:text-zinc-200 cursor-pointer"
          >
            <option value="active">Active Queue (Default)</option>
            <option value="attention">Attention Queue (Action Req / Overdue)</option>
            <option value="all">All Records (Inc. Archived/Delivered)</option>
            <optgroup label="Specific Workflow Status">
              {PERSISTED_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {getServiceRequestStatusLabel(st)}
                </option>
              ))}
            </optgroup>
          </select>

          {/* Priority Dropdown */}
          <select
            value={currentPriority}
            onChange={(e) => updateUrlParams({ priority: e.target.value })}
            className="px-3 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 dark:text-zinc-200 cursor-pointer"
          >
            <option value="all">All Priorities</option>
            {VALID_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)} Priority
              </option>
            ))}
          </select>

          {/* Service Dropdown */}
          {catalogServices.length > 0 && (
            <select
              value={currentService}
              onChange={(e) => updateUrlParams({ service: e.target.value })}
              className="px-3 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 dark:text-zinc-200 cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">All Services</option>
              {catalogServices.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.service_name} ({svc.service_code})
                </option>
              ))}
            </select>
          )}

          {/* Payment Status Dropdown */}
          <select
            value={currentPayment}
            onChange={(e) => updateUrlParams({ payment: e.target.value })}
            className="px-3 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 dark:text-zinc-200 cursor-pointer"
          >
            <option value="all">All Payments</option>
            {VALID_PAYMENT_STATUSES.map((pay) => (
              <option key={pay} value={pay}>
                Payment: {pay.charAt(0).toUpperCase() + pay.slice(1)}
              </option>
            ))}
          </select>

          {/* Overdue Only Filter Toggle */}
          <button
            type="button"
            onClick={() => updateUrlParams({ overdue: currentOverdue === "overdue_only" ? null : "overdue_only" })}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              currentOverdue === "overdue_only"
                ? "bg-amber-100 text-amber-900 border-amber-300 font-bold dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
            }`}
          >
            <AlertTriangle className="h-3 w-3 text-amber-600" />
            Overdue Only
          </button>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors ml-auto"
            >
              <RotateCcw className="h-3 w-3" />
              Reset All
            </button>
          )}
        </div>
      </div>

      {/* 3. ERROR BANNER */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-center gap-3 text-rose-700 dark:text-rose-300 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. MAIN OPERATIONAL TABLE & CONTAINER */}
      <div className={`bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden transition-opacity ${isPending ? "opacity-60" : "opacity-100"}`}>
        {searchTooBroad ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto mb-3">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
              Search is too broad
            </h3>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
              Please enter a more specific name, phone number, customer code, service name, request number, or application reference.
            </p>
            <button
              type="button"
              onClick={handleClearSearch}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear search
            </button>
          </div>
        ) : initialRequests.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400 mx-auto mb-3">
              <Inbox className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
              {hasActiveFilters ? "No matching service requests found" : "No service requests recorded"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
              {hasActiveFilters
                ? "Try adjusting search terms, clearing specific filters, or switching back to the active queue."
                : "When customers request services, they will appear here in the operational queue."}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <RequestsTable requests={initialRequests} />

            {/* Pagination Controls Footer */}
            <div className="p-4 border-t border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-zinc-900/50">
              <div className="text-xs text-slate-500 dark:text-zinc-400">
                Showing <span className="font-semibold text-slate-900 dark:text-zinc-100">{fromRecord}</span> to{" "}
                <span className="font-semibold text-slate-900 dark:text-zinc-100">{toRecord}</span> of{" "}
                <span className="font-semibold text-slate-900 dark:text-zinc-100">{totalCount}</span> requests
              </div>

              <div className="flex items-center gap-4">
                {/* Page Size Selector */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Per page:</span>
                  <select
                    value={limit}
                    onChange={(e) => updateUrlParams({ limit: e.target.value })}
                    className="px-2 py-1 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
                  >
                    {ALLOWED_LIMITS.map((lim) => (
                      <option key={lim} value={lim}>
                        {lim}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Page Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1 || isPending}
                    onClick={() => handlePageChange(page - 1)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <span className="px-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={page >= totalPages || isPending}
                    onClick={() => handlePageChange(page + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
