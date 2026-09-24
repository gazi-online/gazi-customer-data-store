"use client";

import React, { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Users,
  ClipboardList,
  Receipt,
  FileText,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { unifiedGlobalSearch, GroupedSearchResults, SearchResultItem } from "@/app/(dashboard)/actions/searchActions";

interface GlobalCommandSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalCommandSearchModal({ isOpen, onClose }: GlobalCommandSearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupedSearchResults | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleModalClose = useCallback(() => {
    setQuery("");
    setResults(null);
    onClose();
  }, [onClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      return;
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await unifiedGlobalSearch(query);
          setResults(res);
        } catch (err) {
          console.error("Search error:", err);
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const displayedResults = (!query.trim() || query.trim().length < 2) ? null : results;

  // Keyboard shortcut listener for Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleModalClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleModalClose]);

  if (!isOpen) return null;

  const handleSelect = (url: string) => {
    handleModalClose();
    router.push(url);
  };

  const renderSection = (title: string, icon: React.ReactNode, items: SearchResultItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5 pt-2 first:pt-0">
        <div className="flex items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {icon}
          <span>{title}</span>
        </div>
        <div className="space-y-0.5">
          {items.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => handleSelect(item.url)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-slate-100 transition-colors group"
            >
              <div className="space-y-0.5 pr-2 truncate">
                <div className="text-xs font-semibold text-slate-900 group-hover:text-violet-600 truncate">
                  {item.title}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{item.subtitle}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.badge && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {item.badge}
                  </span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-violet-600 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 md:pt-24 p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[80vh] z-10 motion-modal-enter">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-slate-200 shrink-0">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers, phone, requests, invoices, documents..."
            className="w-full px-3 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
          />
          {isPending ? (
            <Loader2 className="h-4 w-4 text-violet-600 animate-spin shrink-0" />
          ) : query ? (
            <button
              onClick={() => setQuery("")}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-100">
          {!query.trim() || query.trim().length < 2 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-600">Quick Global Command Search</p>
              <p>Type at least 2 characters to search across customers, requests, invoices, and documents.</p>
              <div className="flex items-center justify-center gap-4 pt-3 text-[11px] text-slate-400">
                <span><kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">↑</kbd> <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">↓</kbd> navigate</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">↵</kbd> select</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">esc</kbd> close</span>
              </div>
            </div>
          ) : displayedResults && displayedResults.totalMatches === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No matches found for &quot;<strong>{query}</strong>&quot;. Try searching by customer mobile, request #, or invoice #.
            </div>
          ) : displayedResults ? (
            <div className="space-y-3">
              {renderSection("Customers", <Users className="h-3.5 w-3.5 text-violet-600" />, displayedResults.customers)}
              {renderSection("Service Requests", <ClipboardList className="h-3.5 w-3.5 text-purple-600" />, displayedResults.requests)}
              {renderSection("Invoices", <Receipt className="h-3.5 w-3.5 text-blue-600" />, displayedResults.invoices)}
              {renderSection("Documents", <FileText className="h-3.5 w-3.5 text-emerald-600" />, displayedResults.documents)}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>GCDS Universal Search</span>
          <div className="flex items-center gap-1">
            <span>Press</span>
            <kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] text-slate-600">ESC</kbd>
            <span>to exit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
