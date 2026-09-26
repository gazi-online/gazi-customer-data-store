"use client";

import React, { useState, useRef, useCallback } from "react";
import { 
  UploadCloud, 
  FileText, 
  FileType,
  Sheet,
  Trash2, 
  Plus, 
  X, 
  AlertCircle, 
  Sparkles, 
  Bot, 
  Loader2, 
  Layers
} from "lucide-react";
import { 
  UPLOAD_CONSTANTS, 
  DocumentSide, 
  StagedFileItem, 
  FileValidationError,
  isOfficeDocument
} from "../uploadConstants";

interface PremiumDropzoneProps {
  stagedFiles: StagedFileItem[];
  onFilesAdded: (files: File[]) => void;
  onFileRemoved: (id: string) => void;
  onSideChanged: (id: string, side: DocumentSide) => void;
  onClearAll: () => void;
  onAnalyze: () => void;
  isExtracting: boolean;
  errors: FileValidationError[];
  onDismissError: (id: string) => void;
  onDismissAllErrors: () => void;
}

export function PremiumDropzone({
  stagedFiles,
  onFilesAdded,
  onFileRemoved,
  onSideChanged,
  onClearAll,
  onAnalyze,
  isExtracting,
  errors,
  onDismissError,
  onDismissAllErrors,
}: PremiumDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      setIsDragOver(false);
      dragCounterRef.current = 0;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesAdded(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  }, [onFilesAdded]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleDropzoneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const isAtLimit = stagedFiles.length >= UPLOAD_CONSTANTS.MAX_FILES_PER_BATCH;

  return (
    <div className="space-y-4">
      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UPLOAD_CONSTANTS.ACCEPT_STRING}
        onChange={handleFileInputChange}
        className="sr-only"
        aria-hidden="true"
        disabled={isExtracting || isAtLimit}
      />

      {/* Main Drag-and-Drop Area */}
      <div
        ref={dropzoneRef}
        role="button"
        tabIndex={0}
        aria-label="Upload customer documents drag and drop area. Press Enter or Space to browse files."
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => {
          if (!isExtracting && !isAtLimit) {
            fileInputRef.current?.click();
          }
        }}
        onKeyDown={handleDropzoneKeyDown}
        className={`relative overflow-hidden rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          isDragOver
            ? "bg-blue-50/60 dark:bg-blue-950/20 scale-[1.005]"
            : "bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-blue-50/20 dark:hover:bg-zinc-800/40"
        }`}
      >
        {/* Animated marching ants border SVG overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="2"
            y="2"
            width="calc(100% - 4px)"
            height="calc(100% - 4px)"
            rx="14"
            ry="14"
            fill="none"
            strokeWidth="2"
            stroke={isDragOver ? "#2563eb" : "currentColor"}
            className={
              isDragOver
                ? "text-blue-600 dark:text-blue-400 animate-marching-ants"
                : "text-zinc-200 dark:text-zinc-700/60 [stroke-dasharray:6,6]"
            }
          />
        </svg>

        {/* Inner Content */}
        <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
          {/* Quiet Icon Container */}
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
              isDragOver
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <UploadCloud className="w-6 h-6" />
          </div>

          <h3 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {isDragOver ? "Drop documents here to upload" : "Upload customer documents"}
          </h3>

          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
            {isDragOver ? (
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                Release to stage documents
              </span>
            ) : (
              "Aadhaar, PAN, Voter ID or other customer documents"
            )}
          </p>

          {/* Action button inside dropzone */}
          <div className="mt-4 pointer-events-auto">
            <button
              type="button"
              disabled={isExtracting || isAtLimit}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-98 rounded-xl shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[40px]"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Browse Files
            </button>
          </div>

          {/* Subtle format helper */}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2.5">
            PDF, DOCX, XLSX, JPG, PNG, WEBP • Max 10 MB each
          </p>
        </div>
      </div>

      {/* Inline Validation Error Cards */}
      {errors.length > 0 && (
        <div 
          role="alert" 
          aria-live="polite"
          className="space-y-2"
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center">
              <AlertCircle className="w-3.5 h-3.5 mr-1" />
              Upload Issues ({errors.length})
            </span>
            {errors.length > 1 && (
              <button
                type="button"
                onClick={onDismissAllErrors}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
              >
                Dismiss all
              </button>
            )}
          </div>
          {errors.map((err) => (
            <div
              key={err.id}
              className="flex items-start justify-between p-3 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-900 dark:text-rose-200 shadow-xs"
            >
              <div className="flex items-start space-x-2.5 min-w-0 pr-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-bold truncate block">{err.fileName}</span>
                  <p className="text-rose-700/90 dark:text-rose-300/90 mt-0.5 break-words">
                    {err.reason}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDismissError(err.id)}
                className="text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 p-1 shrink-0 rounded transition-colors"
                title="Dismiss error"
                aria-label={`Dismiss error for ${err.fileName}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Staged File Cards Queue */}
      {stagedFiles.length > 0 && (
        <div className="bg-indigo-50/60 dark:bg-indigo-950/30 rounded-2xl p-4 sm:p-5 border border-indigo-100 dark:border-indigo-800/50">
          {/* Header with counts and quick actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                {stagedFiles.length}
              </span>
              <h4 className="text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider flex items-center">
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-indigo-500" />
                Documents Ready for AI Analysis
              </h4>
            </div>

            <div className="flex items-center space-x-2">
              {!isAtLimit && !isExtracting && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-zinc-700 transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
                  Add More
                </button>
              )}
              {!isExtracting && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Grid of File Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stagedFiles.map((sf) => {
              const ext = sf.file.name.split('.').pop()?.toUpperCase() || 'FILE';
              const sizeMb = (sf.file.size / (1024 * 1024)).toFixed(2);

              const isOffice = isOfficeDocument(sf.file.name);

              return (
                <div
                  key={sf.id}
                  className="flex flex-col justify-between bg-white dark:bg-zinc-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/50 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-all gap-2"
                >
                  {/* Top row: Thumbnail / Ext + Name / Size + Delete */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center space-x-3 min-w-0 truncate">
                      {sf.previewUrl ? (
                        <img
                          src={sf.previewUrl}
                          alt={sf.file.name}
                          className="h-10 w-10 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 shrink-0 shadow-xs"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-200 dark:border-indigo-800">
                          {ext === 'PDF' ? (
                            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          ) : ext === 'DOCX' ? (
                            <FileType className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          ) : ext === 'XLSX' ? (
                            <Sheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            ext
                          )}
                        </div>
                      )}
                      <div className="min-w-0 truncate">
                        <p
                          className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate"
                          title={sf.file.name}
                        >
                          {sf.file.name}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {ext} • {sizeMb} MB
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => onFileRemoved(sf.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 disabled:opacity-40"
                      title="Remove file"
                      aria-label={`Remove ${sf.file.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Bottom row: Compact Side Selector or Office Notice */}
                  {isOffice ? (
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                      <span className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 italic truncate" title="Office documents are processed as a single document.">
                        Office documents are processed as a single document.
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                        Single
                      </span>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center shrink-0">
                        <Layers className="w-3 h-3 mr-1 text-indigo-500" />
                        Document Side:
                      </span>

                      {/* Compact Segmented Pill Controls */}
                      <div
                        role="radiogroup"
                        aria-label={`Select side for ${sf.file.name}`}
                        className="inline-flex bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg text-[10px] font-semibold"
                      >
                        {UPLOAD_CONSTANTS.SIDE_OPTIONS.map((side) => {
                          const isSelected = sf.side === side;
                          return (
                            <button
                              key={side}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              disabled={isExtracting}
                              onClick={() => onSideChanged(sf.id, side)}
                              className={`px-2 py-0.5 rounded-md transition-all ${
                                isSelected
                                  ? "bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs font-bold"
                                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                              } disabled:opacity-50`}
                            >
                              {side}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Extraction Action Bar */}
          <div className="mt-4 pt-3 border-t border-indigo-100 dark:border-indigo-800/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center sm:text-left">
              {isExtracting ? (
                <span className="text-indigo-600 dark:text-indigo-400 font-medium flex items-center justify-center sm:justify-start">
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin shrink-0" />
                  Extracting structured customer information
                </span>
              ) : (
                <span>
                  {stagedFiles.length} {stagedFiles.length === 1 ? "document" : "documents"} ready to extract customer data
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onAnalyze}
              disabled={isExtracting || stagedFiles.length === 0}
              className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl transition-all font-bold text-sm shadow-md shadow-indigo-200 dark:shadow-none flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing documents...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 mr-2" />
                  Analyze Documents with AI
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
