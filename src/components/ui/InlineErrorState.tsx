import React, { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export interface InlineErrorStateProps {
  title?: string;
  message?: string | ReactNode;
  onRetry?: () => void;
  isRetrying?: boolean;
  bordered?: boolean;
  className?: string;
}

export function InlineErrorState({
  title = "Unable to load data",
  message = "Please check your connection and try again.",
  onRetry,
  isRetrying = false,
  bordered = false,
  className = "",
}: InlineErrorStateProps) {
  return (
    <div
      className={`p-6 sm:p-10 text-center flex flex-col items-center justify-center space-y-2.5 ${
        bordered
          ? "border border-rose-200 dark:border-rose-900/40 rounded-2xl bg-white dark:bg-zinc-900"
          : ""
      } ${className}`}
      role="alert"
    >
      <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-500 flex items-center justify-center shrink-0">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
        {title}
      </h3>
      {message && (
        <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
          {message}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 min-h-[38px]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}
