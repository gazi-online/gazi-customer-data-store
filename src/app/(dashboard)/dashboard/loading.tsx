
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      {/* Page header */}
      <div className="space-y-2">
        <div className="h-7 w-40 bg-slate-200 rounded-xl" />
        <div className="h-4 w-60 bg-slate-100 rounded-lg" />
      </div>

      {/* Quick actions row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-white border border-slate-200/80 rounded-2xl" />
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-slate-200 rounded" />
              <div className="w-8 h-8 rounded-xl bg-slate-100" />
            </div>
            <div className="h-7 w-16 bg-slate-200 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Chart + table surfaces */}
      <div className="h-48 bg-white border border-slate-200/80 rounded-2xl" />
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="h-4 w-36 bg-slate-200 rounded" />
        </div>
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-11 w-full bg-slate-50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
