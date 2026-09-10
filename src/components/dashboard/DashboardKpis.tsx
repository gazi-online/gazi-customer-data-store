import Link from "next/link";
import { Users, FileText, Clock, RefreshCw, TrendingUp, ArrowRight } from "lucide-react";
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
  } = metrics;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" aria-label="Key Performance Indicators">
      {/* KPI 1: Total Customers */}
      <div className="bg-white rounded-[18px] p-5 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Total Customers
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-[30px] font-bold text-slate-900 tracking-tight font-mono">
              {totalCustomers.toLocaleString("en-IN")}
            </div>
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-100">
              <TrendingUp className="h-3 w-3" />
              <span>Active</span>
            </div>
          </div>
        </div>

        {/* Trend & Sparkline Micro Row */}
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-[13px] text-slate-500 font-medium">
            +{newThisMonth} this month
          </span>
          {/* Inline SVG Sparkline */}
          <svg className="w-24 h-6 stroke-indigo-500 fill-none" preserveAspectRatio="none" viewBox="0 0 100 24" aria-hidden="true">
            <path d="M0 18 Q 20 16, 40 10 T 70 12 T 100 3" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </div>
      </div>

      {/* KPI 2: Documents Stored */}
      <div className="bg-white rounded-[18px] p-5 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-md transition-all flex flex-col justify-between group">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Documents Stored
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-[30px] font-bold text-slate-900 tracking-tight font-mono">
              {documentsStored.toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] font-medium px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
              Safe Vault
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1.5 pt-3 border-t border-slate-100">
          <div className="flex justify-between text-[13px] text-slate-500 font-medium">
            <span>+{syncedThisWeek} synced this week</span>
            <span className="font-semibold text-slate-600 text-xs">Encrypted</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden" role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}>
            <div className="bg-blue-600 h-full rounded-full w-full" />
          </div>
        </div>
      </div>

      {/* KPI 3: Pending Verification */}
      <div className="bg-white rounded-[18px] p-5 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-md transition-all flex flex-col justify-between group">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Pending Verification
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-[30px] font-bold text-slate-900 tracking-tight font-mono">
              {pendingVerification.toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] font-medium px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200/60">
              {pendingVerification > 0 ? "Requires Review" : "Up to date"}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-[13px] text-slate-500 font-medium">
            {pendingVerification > 0 ? "Review queued" : "All verified"}
          </span>
          <Link
            href="/documents"
            className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline inline-flex items-center gap-0.5"
          >
            Process queue <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* KPI 4: Renewals Due */}
      <div className="bg-white rounded-[18px] p-5 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-md transition-all flex flex-col justify-between group">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              Renewals Due
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <RefreshCw className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-[30px] font-bold text-slate-900 tracking-tight font-mono">
              {renewalsDue.toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] font-medium px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200/60">
              Next 30 Days
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-[13px] text-slate-500 font-medium">
            {renewalsDue > 0 ? "Action recommended" : "No pending expiries"}
          </span>
          <Link
            href="/documents"
            className="text-[12px] font-semibold text-purple-600 hover:text-purple-700 hover:underline inline-flex items-center gap-0.5"
          >
            View Documents <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}

