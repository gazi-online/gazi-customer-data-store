import Link from "next/link";
import { Users, FileText, Clock, RefreshCw, TrendingUp, ArrowRight, AlertTriangle, Calendar, CalendarClock } from "lucide-react";
import type { DashboardMetrics } from "@/app/(dashboard)/dashboard/actions";

interface DashboardKpisProps {
  metrics: DashboardMetrics;
}

export function DashboardKpis({ metrics }: DashboardKpisProps) {
  const {
    totalCustomers,
    newThisMonth,
    documentsStored,
    syncedThisWeek,
    pendingVerification,
    renewalsDue,
    followupsDueToday = 0,
    followupsOverdue = 0,
    followupsUpcoming = 0,
  } = metrics;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 lg:gap-5" aria-label="Key Performance Indicators">
      {/* KPI 1: Total Customers */}
      <div className="bg-white rounded-[16px] sm:rounded-[18px] p-4 sm:p-5 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Total Customers
            </span>
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl sm:text-[28px] lg:text-[30px] font-bold text-slate-900 tracking-tight font-mono truncate">
              {totalCustomers.toLocaleString("en-IN")}
            </div>
            <div className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] sm:text-[11px] font-medium border border-emerald-100 shrink-0">
              <TrendingUp className="h-3 w-3" />
              <span>Active</span>
            </div>
          </div>
        </div>

        {/* Trend & Sparkline Micro Row */}
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-xs sm:text-[13px] text-slate-500 font-medium">
            +{newThisMonth} this month
          </span>
          {/* Inline SVG Sparkline */}
          <svg className="w-20 sm:w-24 h-6 stroke-indigo-500 fill-none shrink-0" preserveAspectRatio="none" viewBox="0 0 100 24" aria-hidden="true">
            <path d="M0 18 Q 20 16, 40 10 T 70 12 T 100 3" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </div>
      </div>

      {/* KPI 2: Documents Stored */}
      <div className="bg-white rounded-[16px] sm:rounded-[18px] p-4 sm:p-5 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-md transition-all flex flex-col justify-between group">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Documents Stored
            </span>
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl sm:text-[28px] lg:text-[30px] font-bold text-slate-900 tracking-tight font-mono truncate">
              {documentsStored.toLocaleString("en-IN")}
            </div>
            <span className="text-[10px] sm:text-[11px] font-medium px-2 sm:px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 shrink-0">
              Safe Vault
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1.5 pt-3 border-t border-slate-100">
          <div className="flex justify-between text-xs sm:text-[13px] text-slate-500 font-medium">
            <span>+{syncedThisWeek} synced this week</span>
            <span className="font-semibold text-slate-600 text-xs">Encrypted</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden" role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}>
            <div className="bg-blue-600 h-full rounded-full w-full" />
          </div>
        </div>
      </div>

      {/* KPI 3: Pending Verification */}
      <div className="bg-white rounded-[16px] sm:rounded-[18px] p-4 sm:p-5 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-md transition-all flex flex-col justify-between group">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Pending Verification
            </span>
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl sm:text-[28px] lg:text-[30px] font-bold text-slate-900 tracking-tight font-mono truncate">
              {pendingVerification.toLocaleString("en-IN")}
            </div>
            <span className="text-[10px] sm:text-[11px] font-medium px-2 sm:px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200/60 shrink-0">
              {pendingVerification > 0 ? "Requires Review" : "Up to date"}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-xs sm:text-[13px] text-slate-500 font-medium">
            {pendingVerification > 0 ? "Review queued" : "All verified"}
          </span>
          <Link
            href="/documents"
            className="text-[11px] sm:text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline inline-flex items-center gap-0.5 min-h-[32px] py-1"
          >
            Process queue <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* KPI 4: Renewals Due */}
      <div className="bg-white rounded-[16px] sm:rounded-[18px] p-4 sm:p-5 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-md transition-all flex flex-col justify-between group">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Renewals Due
            </span>
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl sm:text-[28px] lg:text-[30px] font-bold text-slate-900 tracking-tight font-mono truncate">
              {renewalsDue.toLocaleString("en-IN")}
            </div>
            <span className="text-[10px] sm:text-[11px] font-medium px-2 sm:px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200/60 shrink-0">
              Next 30 Days
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-xs sm:text-[13px] text-slate-500 font-medium">
            {renewalsDue > 0 ? "Action recommended" : "No pending expiries"}
          </span>
          <Link
            href="/documents?renewal=30d"
            className="text-[11px] sm:text-[12px] font-semibold text-purple-600 hover:text-purple-700 hover:underline inline-flex items-center gap-0.5 min-h-[32px] py-1"
          >
            View Documents <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Operations Desk Dispatch Banner */}
      <div className="sm:col-span-2 lg:col-span-4 bg-slate-900 dark:bg-zinc-900 rounded-[16px] sm:rounded-[18px] p-4 sm:p-5 text-white shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white tracking-wide truncate">
              Daily Operations Desk
            </h3>
            <p className="text-xs text-slate-400">
              Live follow-up pipeline & document renewals in Asia/Kolkata
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 w-full md:w-auto">
          {/* Overdue */}
          <Link
            href="/requests?followup=overdue"
            className={`min-h-[48px] px-3 py-2 rounded-xl border transition-all flex flex-col justify-between ${
              followupsOverdue > 0
                ? "bg-rose-950/40 border-rose-800/80 hover:bg-rose-900/50 text-rose-300"
                : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-300"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Overdue
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-base sm:text-lg font-bold font-mono text-white">
                {followupsOverdue}
              </span>
              {followupsOverdue > 0 && <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 ml-1" />}
            </div>
          </Link>

          {/* Due Today */}
          <Link
            href="/requests?followup=today"
            className={`min-h-[48px] px-3 py-2 rounded-xl border transition-all flex flex-col justify-between ${
              followupsDueToday > 0
                ? "bg-amber-950/40 border-amber-800/80 hover:bg-amber-900/50 text-amber-300"
                : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-300"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Due Today
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-base sm:text-lg font-bold font-mono text-white">
                {followupsDueToday}
              </span>
              <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0 ml-1" />
            </div>
          </Link>

          {/* Upcoming */}
          <Link
            href="/requests?followup=upcoming"
            className="min-h-[48px] px-3 py-2 rounded-xl border bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-300 transition-all flex flex-col justify-between"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Upcoming
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-base sm:text-lg font-bold font-mono text-white">
                {followupsUpcoming}
              </span>
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
            </div>
          </Link>

          {/* Renewals Due */}
          <Link
            href="/documents?renewal=30d"
            className={`min-h-[48px] px-3 py-2 rounded-xl border transition-all flex flex-col justify-between ${
              renewalsDue > 0
                ? "bg-purple-950/40 border-purple-800/80 hover:bg-purple-900/50 text-purple-300"
                : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-300"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              30d Expiries
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-base sm:text-lg font-bold font-mono text-white">
                {renewalsDue}
              </span>
              <RefreshCw className="h-3.5 w-3.5 text-purple-400 shrink-0 ml-1" />
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}

