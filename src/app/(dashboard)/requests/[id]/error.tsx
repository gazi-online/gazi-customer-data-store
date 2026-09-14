"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function RequestWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log safe error locally for diagnostics without leaking to UI
    console.error("Request workspace error boundary caught:", error);
  }, [error]);

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 mx-auto flex items-center justify-center">
        <AlertTriangle className="h-7 w-7" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">
          Unable to Load Service Request
        </h1>
        <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
          An unexpected error occurred while communicating with the database. Please retry or return to the requests desk.
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Retry</span>
        </button>

        <Link
          href="/requests"
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-200 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Desk</span>
        </Link>
      </div>
    </div>
  );
}
