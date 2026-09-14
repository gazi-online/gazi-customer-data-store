import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RequestWorkspaceLoading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-pulse">
      {/* Top Breadcrumb & Header Skeleton */}
      <div className="space-y-4">
        <div>
          <Link
            href="/requests"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 py-1"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Requests Desk</span>
          </Link>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-32 bg-slate-200 dark:bg-zinc-800 rounded-lg" />
              <div className="h-5 w-24 bg-slate-100 dark:bg-zinc-800/80 rounded-full" />
              <div className="h-5 w-20 bg-slate-100 dark:bg-zinc-800/80 rounded-full" />
            </div>
            <div className="h-8 w-64 bg-slate-200 dark:bg-zinc-800 rounded-xl" />
            <div className="h-4 w-48 bg-slate-100 dark:bg-zinc-800/60 rounded" />
          </div>

          <div className="h-10 w-36 bg-slate-200 dark:bg-zinc-800 rounded-xl shrink-0" />
        </div>
      </div>

      {/* Main 2-Column Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview Skeleton */}
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-4">
            <div className="h-4 w-36 bg-slate-200 dark:bg-zinc-800 rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="h-14 bg-slate-100 dark:bg-zinc-800/40 rounded-xl" />
              <div className="h-14 bg-slate-100 dark:bg-zinc-800/40 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-14 bg-slate-50 dark:bg-zinc-800/20 rounded-xl" />
              ))}
            </div>
          </div>

          {/* Documents Skeleton */}
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-4">
            <div className="h-4 w-44 bg-slate-200 dark:bg-zinc-800 rounded" />
            <div className="h-14 bg-slate-50 dark:bg-zinc-800/30 rounded-xl" />
          </div>

          {/* History Skeleton */}
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-4">
            <div className="h-4 w-40 bg-slate-200 dark:bg-zinc-800 rounded" />
            <div className="h-20 bg-slate-50 dark:bg-zinc-800/30 rounded-xl" />
          </div>
        </div>

        {/* Right Column (1 Col) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-4">
            <div className="h-4 w-36 bg-slate-200 dark:bg-zinc-800 rounded" />
            <div className="h-6 w-48 bg-slate-100 dark:bg-zinc-800/60 rounded" />
            <div className="h-4 w-32 bg-slate-100 dark:bg-zinc-800/40 rounded" />
            <div className="h-10 w-full bg-slate-100 dark:bg-zinc-800 rounded-xl" />
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-4">
            <div className="h-4 w-36 bg-slate-200 dark:bg-zinc-800 rounded" />
            <div className="h-14 bg-slate-50 dark:bg-zinc-800/40 rounded-xl" />
            <div className="h-12 bg-slate-50 dark:bg-zinc-800/20 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
