/**
 * RouteLoadingSkeleton — shared lightweight loading placeholder for dashboard routes.
 *
 * Rules:
 * - No full-screen spinner or blocking overlay
 * - Sidebar/header remain visible (they live in layout.tsx, outside this component)
 * - No shimmer gradients or pulse spam
 * - Single light animate-pulse on the entire subtree
 * - Structurally minimal: title + optional action bar + 1 surface + rows
 * - Preserves GCDS near-white / white / Slate visual language
 * - No layout shift
 */

interface RouteLoadingSkeletonProps {
  /** Show a placeholder action button slot on the right of the header */
  hasAction?: boolean;
  /** Number of content rows to render (default 4) */
  rowCount?: number;
}

export function RouteLoadingSkeleton({
  hasAction = false,
  rowCount = 4,
}: RouteLoadingSkeletonProps) {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      {/* Page header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 rounded-xl" />
          <div className="h-4 w-72 bg-slate-100 rounded-lg" />
        </div>
        {hasAction && (
          <div className="h-10 w-32 bg-slate-200 rounded-xl shrink-0" />
        )}
      </div>

      {/* Content surface */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden">
        {/* Surface header row */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="h-4 w-36 bg-slate-200 rounded" />
        </div>

        {/* Content rows */}
        <div className="p-5 space-y-3">
          {Array.from({ length: rowCount }).map((_, i) => (
            <div
              key={i}
              className="h-11 w-full bg-slate-50 rounded-xl"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
