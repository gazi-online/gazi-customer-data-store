export default function RequestsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="h-8 w-64 bg-slate-200 dark:bg-zinc-800 rounded-xl mb-2" />
          <div className="h-4 w-96 bg-slate-100 dark:bg-zinc-800/60 rounded-lg" />
        </div>
      </div>

      {/* 4 Metric Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-slate-200 dark:bg-zinc-800 rounded" />
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800" />
            </div>
            <div className="h-7 w-12 bg-slate-200 dark:bg-zinc-800 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Search & Filter Toolbar Skeleton */}
      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-4">
        <div className="h-10 max-w-md bg-slate-100 dark:bg-zinc-800 rounded-xl" />
        <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
          <div className="h-8 w-28 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
          <div className="h-8 w-28 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
          <div className="h-8 w-28 bg-slate-100 dark:bg-zinc-800 rounded-xl" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl overflow-hidden p-6 space-y-4">
        <div className="h-6 w-full bg-slate-100 dark:bg-zinc-800 rounded" />
        {[1, 2, 3, 4, 5, 6, 7].map((row) => (
          <div key={row} className="h-12 w-full bg-slate-50 dark:bg-zinc-800/40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
