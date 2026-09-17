import Link from "next/link";
import { 
  FileText, 
  User, 
  Briefcase, 
  Clock, 
  ArrowRight, 
  Lock, 
  ExternalLink 
} from "lucide-react";
import type { ActivityEvent } from "@/app/(dashboard)/dashboard/actions";

interface RecentActivityTableProps {
  activities: ActivityEvent[];
}

export function RecentActivityTable({ activities }: RecentActivityTableProps) {
  const getAvatarColor = (initials: string) => {
    const charCode = initials.charCodeAt(0) || 0;
    if (charCode % 3 === 0) return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    if (charCode % 3 === 1) return "bg-blue-50 text-blue-700 ring-blue-200";
    return "bg-purple-50 text-purple-700 ring-purple-200";
  };

  const getActivityIcon = (type: ActivityEvent["iconType"]) => {
    switch (type) {
      case "document":
        return <FileText className="h-4 w-4 text-slate-400 shrink-0" />;
      case "customer":
        return <User className="h-4 w-4 text-slate-400 shrink-0" />;
      case "service":
        return <Briefcase className="h-4 w-4 text-slate-400 shrink-0" />;
      default:
        return <FileText className="h-4 w-4 text-slate-400 shrink-0" />;
    }
  };

  const getStatusBadge = (status: ActivityEvent["status"], statusType: ActivityEvent["statusType"]) => {
    if (statusType === "success") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {status}
        </span>
      );
    }
    if (statusType === "warning") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        {status}
      </span>
    );
  };

  return (
    <section className="bg-white rounded-[16px] sm:rounded-[18px] border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,0.04)] overflow-hidden" aria-label="Recent Activity">
      {/* Table Header Panel */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">Recent Activity</h2>
          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] sm:text-[11px] font-semibold rounded-full border border-emerald-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none" />
            Live feed
          </span>
        </div>
        <Link
          href="/customers"
          className="text-xs sm:text-sm font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1 transition-colors min-h-[36px] sm:min-h-0"
        >
          View All Customers
          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Link>
      </div>

      {activities.length === 0 ? (
        <div className="py-12 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Clock className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-slate-700">No recent activity yet</p>
          <p className="text-xs text-slate-400 mt-1">New customer and document activity will appear here.</p>
        </div>
      ) : (
        <>
          {/* Desktop High-Density Data Table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 text-slate-400 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200/70">
                  <th className="py-3 px-6">Customer</th>
                  <th className="py-3 px-6">Activity</th>
                  <th className="py-3 px-6">Timestamp</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {activities.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ring-1 font-bold text-xs flex items-center justify-center shrink-0 ${getAvatarColor(item.initials)}`}>
                          {item.initials}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{item.customerName}</div>
                          <div className="text-[11px] font-mono text-slate-400">{item.customerCode}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-700 font-medium">
                      <div className="flex items-center gap-2">
                        {getActivityIcon(item.iconType)}
                        <span className="truncate max-w-[280px]">{item.activity}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-400 text-[13px] font-mono">
                      {item.timestamp}
                    </td>
                    <td className="py-4 px-6">
                      {getStatusBadge(item.status, item.statusType)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Link
                        href={item.actionUrl}
                        className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors inline-block"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Rows (Prevents horizontal overflow on small screens) */}
          <div className="md:hidden divide-y divide-slate-100">
            {activities.map((item) => (
              <div key={item.id} className="p-3.5 sm:p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-full ring-1 font-bold text-xs flex items-center justify-center shrink-0 ${getAvatarColor(item.initials)}`}>
                      {item.initials}
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="font-semibold text-slate-900 text-sm truncate">{item.customerName}</div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">{item.customerCode}</div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge(item.status, item.statusType)}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
                  <div className="flex items-center gap-1.5 text-slate-600 font-medium min-w-0 truncate flex-1">
                    {getActivityIcon(item.iconType)}
                    <span className="truncate">{item.activity}</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px] shrink-0">{item.timestamp}</span>
                </div>

                <div className="pt-0.5 flex justify-end">
                  <Link
                    href={item.actionUrl}
                    className="px-3.5 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors inline-flex items-center gap-1"
                  >
                    Details <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Privacy Notice (Subtle, no DATA PROTECTED badge) */}
      <div className="p-3 sm:p-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>Sensitive identifiers are masked on this dashboard.</span>
        </div>
      </div>
    </section>
  );
}

