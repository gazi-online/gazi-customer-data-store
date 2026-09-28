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

      {/* Primary Hero Drag-and-Drop Area (When empty) */}
      {stagedFiles.length === 0 && (
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
          className={`relative overflow-hidden rounded-2xl py-7 sm:py-9 px-6 sm:px-8 text-center cursor-pointer transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 min-h-[240px] sm:min-h-[260px] flex flex-col items-center justify-center ${
            isDragOver
              ? "bg-blue-50/70 dark:bg-blue-950/30 scale-[1.005]"
              : "bg-zinc-50/50 dark:bg-zinc-900/40 hover:bg-blue-50/20 dark:hover:bg-zinc-800/40"
          }`}
        >
          {/* Subtle dashed border SVG overlay */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="2"
              y="2"
              width="calc(100% - 4px)"
              height="calc(100% - 4px)"
              rx="16"
              ry="16"
              fill="none"
              strokeWidth="2"
              stroke={isDragOver ? "#2563eb" : "currentColor"}
              className={
                isDragOver
                  ? "text-blue-600 dark:text-blue-400 animate-marching-ants"
                  : "text-zinc-200 dark:text-zinc-700/60 group-hover:text-blue-300 dark:group-hover:text-blue-800 transition-colors [stroke-dasharray:6,6]"
              }
            />
          </svg>

          {/* Inner Content */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {/* Upload Icon Container */}
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-2 sm:mb-2.5 transition-all duration-200 ${
                isDragOver
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105"
                  : "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100/80 dark:border-blue-900/40 group-hover:bg-blue-100/80 dark:group-hover:bg-blue-900/60 group-hover:scale-105"
              }`}
            >
              <UploadCloud className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {isDragOver ? "Drop documents here to upload" : "Upload customer documents"}
            </h3>

            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
              {isDragOver ? (
                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                  Release to stage documents
                </span>
              ) : (
                "Aadhaar, PAN, Voter ID, Passport & more"
              )}
            </p>

            {/* Browse Files CTA */}
            <div className="mt-3.5">
              <button
                type="button"
                disabled={isExtracting || isAtLimit}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="inline-flex items-center justify-center gap-2 px-5 h-[42px] text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-xl shadow-xs hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Browse Files</span>
              </button>
            </div>

            {/* Drag & drop or click helper */}
            <p className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500 mt-2">
              Drop files here or click to browse
            </p>

            {/* File format helper */}
            <p className="text-[10px] sm:text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
              PDF, DOCX, XLSX, JPG, PNG, WEBP · Max 10 MB
            </p>
          </div>
        </div>
      )}

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
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline cursor-pointer"
              >
                Dismiss all
              </button>
            )}
          </div>
          {errors.map((err) => (
            <div
              key={err.id}
              className="flex items-start justify-between p-3 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-900 dark:text-rose-200 shadow-2xs"
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
                className="text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 p-1 shrink-0 rounded transition-colors cursor-pointer"
                title="Dismiss error"
                aria-label={`Dismiss error for ${err.fileName}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Staged File Cards Queue & Document Review */}
      {stagedFiles.length > 0 && (
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`relative rounded-2xl p-4 sm:p-5 border transition-all ${
            isDragOver
              ? "bg-blue-50/70 border-blue-500 dark:bg-blue-950/40"
              : "bg-zinc-50/60 dark:bg-zinc-800/30 border-zinc-200/90 dark:border-zinc-700/60"
          }`}
        >
          {/* Header Row: Documents added on left, + Add more and Clear all on right */}
          <div className="flex items-center justify-between gap-3 mb-3.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold">
                {stagedFiles.length}
              </span>
              <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center">
                <FileText className="h-4 w-4 mr-1.5 text-blue-600 dark:text-blue-400" />
                Documents added
              </h4>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isAtLimit && !isExtracting && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-800 border border-blue-200/80 dark:border-blue-900/60 rounded-lg hover:bg-blue-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add more</span>
                </button>
              )}
              {!isExtracting && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="px-2 py-1 text-xs font-medium text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Clear all
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
                  className="flex flex-col justify-between bg-white dark:bg-zinc-900 p-3 sm:p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all gap-2.5"
                >
                  {/* Top row: Thumbnail / Ext + Name / Size + Delete */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center space-x-3 min-w-0 truncate">
                      {sf.previewUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={sf.previewUrl}
                          alt={sf.file.name}
                          className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 shrink-0 shadow-2xs"
                        />
                      ) : (
                        <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${
                          ext === 'PDF'
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/40"
                            : ext === 'DOCX'
                              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/40"
                              : ext === 'XLSX'
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                        }`}>
                          {ext === 'PDF' ? (
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 dark:text-rose-400" />
                          ) : ext === 'DOCX' ? (
                            <FileType className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                          ) : ext === 'XLSX' ? (
                            <Sheet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            ext
                          )}
                        </div>
                      )}
                      <div className="min-w-0 truncate">
                        <p
                          className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate"
                          title={sf.file.name}
                        >
                          {sf.file.name}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {ext} · {sizeMb} MB
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => onFileRemoved(sf.id)}
                      className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 disabled:opacity-40 cursor-pointer"
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
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold text-[10px] border border-blue-200/60 dark:border-blue-800/60 shrink-0">
                        Single
                      </span>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center shrink-0">
                        <Layers className="w-3 h-3 mr-1 text-blue-500" />
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
                              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-white dark:bg-blue-600 text-blue-700 dark:text-white shadow-2xs font-bold"
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
          <div className="mt-4 pt-3.5 border-t border-zinc-200/80 dark:border-zinc-700/60 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center sm:text-left">
              {isExtracting ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center justify-center sm:justify-start">
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin shrink-0" />
                    Reading documents...
                  </span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    (Reading customer details)
                  </span>
                </div>
              ) : (
                <span className="font-medium">
                  {stagedFiles.length} {stagedFiles.length === 1 ? "document" : "documents"} ready to read
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onAnalyze}
              disabled={isExtracting || stagedFiles.length === 0}
              className="w-full sm:w-auto px-6 h-[42px] bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl transition-all font-semibold text-xs sm:text-sm shadow-xs flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Reading customer details...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Read Documents
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
