import Link from "next/link";
import { UserPlus, Search, ClipboardList, Receipt, CreditCard, Upload, Bell } from "lucide-react";

export function QuickActions() {
  return (
    <section className="flex flex-col gap-2" aria-label="Quick Actions">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          QUICK DESK ACTIONS
        </span>
        <span className="text-[11px] text-slate-400 hidden sm:inline">
          High-frequency operator shortcuts
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-2.5">
        {/* Action 1: Add Customer (Primary Gradient with strong WCAG contrast) */}
        <Link
          href="/customers/new"
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-[0.99] text-white px-3 sm:px-3.5 min-h-[44px] h-11 rounded-[14px] flex items-center justify-center gap-2 shadow-[0_2px_8px_rgba(99,102,241,0.25)] transition-all group font-semibold text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
        >
          <UserPlus className="h-4 w-4 text-white shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-white font-semibold tracking-wide truncate">+ Customer</span>
        </Link>

        {/* Action 2: Find Customer */}
        <Link
          href="/customers"
          className="bg-white border border-slate-200 hover:border-violet-300 hover:bg-slate-50/70 active:scale-[0.99] px-3 sm:px-3.5 min-h-[44px] h-11 rounded-[14px] flex items-center justify-center gap-2 transition-all text-slate-800 font-semibold text-xs sm:text-sm shadow-[0_2px_6px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-violet-500 group"
        >
          <Search className="h-4 w-4 text-violet-600 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-slate-800 font-semibold truncate">Find Customer</span>
        </Link>

        {/* Action 3: Central Requests */}
        <Link
          href="/requests"
          className="bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/70 active:scale-[0.99] px-3 sm:px-3.5 min-h-[44px] h-11 rounded-[14px] flex items-center justify-center gap-2 transition-all text-slate-800 font-semibold text-xs sm:text-sm shadow-[0_2px_6px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-indigo-500 group"
        >
          <ClipboardList className="h-4 w-4 text-indigo-600 shrink-0 group-hover:-translate-y-0.5 transition-transform" />
          <span className="text-slate-800 font-semibold truncate">Requests</span>
        </Link>

        {/* Action 4: Create Invoice */}
        <Link
          href="/invoices/new"
          className="bg-white border border-slate-200 hover:border-blue-300 hover:bg-slate-50/70 active:scale-[0.99] px-3 sm:px-3.5 min-h-[44px] h-11 rounded-[14px] flex items-center justify-center gap-2 transition-all text-slate-800 font-semibold text-xs sm:text-sm shadow-[0_2px_6px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-blue-500 group"
        >
          <Receipt className="h-4 w-4 text-blue-600 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-slate-800 font-semibold truncate">+ Invoice</span>
        </Link>

        {/* Action 5: Payments */}
        <Link
          href="/payments"
          className="bg-white border border-slate-200 hover:border-emerald-300 hover:bg-slate-50/70 active:scale-[0.99] px-3 sm:px-3.5 min-h-[44px] h-11 rounded-[14px] flex items-center justify-center gap-2 transition-all text-slate-800 font-semibold text-xs sm:text-sm shadow-[0_2px_6px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-emerald-500 group"
        >
          <CreditCard className="h-4 w-4 text-emerald-600 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-slate-800 font-semibold truncate">Payments</span>
        </Link>

        {/* Action 6: Upload Document */}
        <Link
          href="/documents"
          className="bg-white border border-slate-200 hover:border-purple-300 hover:bg-slate-50/70 active:scale-[0.99] px-3 sm:px-3.5 min-h-[44px] h-11 rounded-[14px] flex items-center justify-center gap-2 transition-all text-slate-800 font-semibold text-xs sm:text-sm shadow-[0_2px_6px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-purple-500 group"
        >
          <Upload className="h-4 w-4 text-purple-600 shrink-0 group-hover:-translate-y-0.5 transition-transform" />
          <span className="text-slate-800 font-semibold truncate">Documents</span>
        </Link>

        {/* Action 7: Operations Inbox */}
        <Link
          href="/operations"
          className="bg-white border border-slate-200 hover:border-amber-300 hover:bg-slate-50/70 active:scale-[0.99] px-3 sm:px-3.5 min-h-[44px] h-11 rounded-[14px] flex items-center justify-center gap-2 transition-all text-slate-800 font-semibold text-xs sm:text-sm shadow-[0_2px_6px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500 group col-span-2 sm:col-span-1"
        >
          <Bell className="h-4 w-4 text-amber-500 shrink-0 group-hover:rotate-12 transition-transform" />
          <span className="text-slate-800 font-semibold truncate">Operations</span>
        </Link>
      </div>
    </section>
  );
}
