import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  ClipboardList,
  FileText,
  Receipt,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  User,
  Layers,
} from "lucide-react";
import type { DashboardAttentionSummary } from "@/app/(dashboard)/dashboard/actions";

interface DailyAttentionQueueProps {
  attentionData: DashboardAttentionSummary;
}

export function DailyAttentionQueue({ attentionData }: DailyAttentionQueueProps) {
  const { urgentCount, todayCount, pendingCount, totalAttentionCount, items } = attentionData;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "followup":
        return <Clock className="h-3.5 w-3.5 text-amber-500" />;
      case "document":
        return <FileText className="h-3.5 w-3.5 text-blue-500" />;
      case "request":
        return <ClipboardList className="h-3.5 w-3.5 text-purple-500" />;
      case "billing":
        return <Receipt className="h-3.5 w-3.5 text-rose-500" />;
      default:
        return <Layers className="h-3.5 w-3.5 text-slate-500" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40">
            <AlertTriangle className="h-2.5 w-2.5" />
            Urgent
          </span>
        );
      case "today":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40">
            <Clock className="h-2.5 w-2.5" />
            Today
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
            Pending
          </span>
        );
    }
  };

  return (
    <section
      className="bg-white dark:bg-zinc-900 rounded-[18px] p-4 sm:p-5 border border-slate-200/90 dark:border-zinc-800 shadow-[0_4px_18px_rgba(15,23,42,0.04)] space-y-4"
      aria-label="Daily Operations Attention Queue"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                Needs Attention Now
              </h2>
              {urgentCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse">
                  {urgentCount} urgent
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Immediate operational follow-ups, blocked service requests, and renewals
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {/* Summary counters */}
          <div className="hidden md:flex items-center gap-1.5 text-xs">
            <span className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 font-semibold border border-rose-100">
              {urgentCount} Urgent
            </span>
            <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold border border-amber-100">
              {todayCount} Today
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-50 text-slate-600 font-semibold border border-slate-200">
              {pendingCount} Pending
            </span>
          </div>

          <Link
            href="/operations"
            className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 hover:underline min-h-[36px] py-1"
          >
            <span>View all queue ({totalAttentionCount})</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Actionable Preview List */}
      {items.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">All caught up!</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            No urgent follow-ups, blocked requests, or expired documents require attention today.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item) => {
            const isUrgent = item.priority === "urgent";

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  isUrgent
                    ? "border-rose-200 bg-rose-50/20 dark:border-rose-900/30 dark:bg-rose-950/10"
                    : "border-slate-200/80 bg-slate-50/40 dark:border-zinc-800 dark:bg-zinc-800/40"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {getCategoryIcon(item.category)}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {item.category}
                      </span>
                      {getPriorityBadge(item.priority)}
                    </div>
                    {item.formattedDueDate && (
                      <span className="text-[11px] font-medium text-slate-500 font-mono truncate">
                        {item.formattedDueDate}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 line-clamp-1">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {item.reason}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/60 text-xs">
                  {item.customerName ? (
                    <div className="flex items-center gap-1 text-slate-600 dark:text-zinc-400 truncate max-w-[180px]">
                      <User className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="font-medium truncate">{item.customerName}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}

                  <Link
                    href={item.targetUrl}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-zinc-100 hover:text-violet-600 dark:hover:text-violet-400 min-h-[32px] px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-zinc-700/60 transition-colors shrink-0"
                  >
                    <span>{item.targetLabel}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
