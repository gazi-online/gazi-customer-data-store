"use client";

import React, { useEffect, useRef, useState } from "react";
import { LogOut, Loader2, AlertTriangle } from "lucide-react";

export interface LogoutConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isLoggingOut?: boolean;
}

/**
 * LogoutConfirmationModal
 * 
 * Reusable, accessible confirmation dialog for user logout.
 * Implements WAI-ARIA alertdialog pattern, focus trapping, escape dismissal,
 * double-submission protection, and mobile-friendly touch targets.
 */
export function LogoutConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isLoggingOut: externalIsLoggingOut,
}: LogoutConfirmationModalProps) {
  const [internalIsLoggingOut, setInternalIsLoggingOut] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const isProcessing = externalIsLoggingOut ?? internalIsLoggingOut;

  // Auto-focus the safe "Cancel" button on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key to dismiss dialog (only when not actively processing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape" && !isProcessing) {
        e.preventDefault();
        onClose();
        return;
      }

      // Basic focus trap within the modal
      if (e.key === "Tab") {
        const focusableElements = [cancelButtonRef.current, confirmButtonRef.current].filter(
          (el): el is HTMLButtonElement => el !== null && !el.disabled
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  // Lock body scroll when dialog is active
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isProcessing) return;

    if (externalIsLoggingOut === undefined) {
      setInternalIsLoggingOut(true);
    }

    try {
      await onConfirm();
    } catch {
      if (externalIsLoggingOut === undefined) {
        setInternalIsLoggingOut(false);
      }
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isProcessing) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={handleBackdropClick}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="logout-dialog-title"
      aria-describedby="logout-dialog-description"
    >
      <div
        ref={modalContainerRef}
        className="w-full max-w-sm sm:max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150"
      >
        {/* Header Icon + Title */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2
              id="logout-dialog-title"
              className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug"
            >
              Log out?
            </h2>
            <p
              id="logout-dialog-description"
              className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed"
            >
              Are you sure you want to log out of GCDS?
            </p>
          </div>
        </div>

        {/* Security & Action Note */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-500">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
          <span>You will need to sign in and provide two-step verification again.</span>
        </div>

        {/* Actions: Destructive Hierarchy */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            ref={cancelButtonRef}
            disabled={isProcessing}
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          <button
            type="button"
            ref={confirmButtonRef}
            disabled={isProcessing}
            onClick={handleConfirm}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Logging out...</span>
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Log Out</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
