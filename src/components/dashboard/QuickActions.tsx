import Link from "next/link";
import { UserPlus, Upload, ScanLine } from "lucide-react";

export function QuickActions() {
  return (
    <section className="flex flex-col gap-2" aria-label="Quick Actions">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        QUICK ACTIONS
      </span>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Action 1: Add Customer (Primary Gradient with strong WCAG contrast) */}
        <Link
          href="/customers/new"
          className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:via-indigo-700 hover:to-blue-700 active:scale-[0.99] text-white px-5 h-12 rounded-[16px] flex items-center justify-center gap-2.5 shadow-[0_2px_8px_rgba(99,102,241,0.25)] transition-all group font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <UserPlus className="h-4 w-4 text-white shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-white font-semibold tracking-wide">+ Add Customer</span>
        </Link>

        {/* Action 2: Upload Document */}
        <Link
          href="/documents"
          className="bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/70 active:scale-[0.99] px-5 h-12 rounded-[16px] flex items-center justify-center gap-2.5 transition-all text-slate-800 font-semibold text-sm shadow-[0_2px_6px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-indigo-500 group"
        >
          <Upload className="h-4 w-4 text-indigo-600 shrink-0 group-hover:-translate-y-0.5 transition-transform" />
          <span className="text-slate-800 font-semibold">Upload Document</span>
        </Link>

        {/* Action 3: Smart Import */}
        <Link
          href="/customers/new"
          className="bg-white border border-slate-200 hover:border-violet-300 hover:bg-slate-50/70 active:scale-[0.99] px-5 h-12 rounded-[16px] flex items-center justify-center gap-2.5 transition-all text-slate-800 font-semibold text-sm shadow-[0_2px_6px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-violet-500 group"
        >
          <ScanLine className="h-4 w-4 text-violet-600 shrink-0 group-hover:rotate-6 transition-transform" />
          <span className="text-slate-800 font-semibold">Smart Import</span>
        </Link>
      </div>
    </section>
  );
}
