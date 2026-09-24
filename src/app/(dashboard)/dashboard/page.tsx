import { getDashboardSnapshot } from "./actions";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DashboardKpis } from "@/components/dashboard/DashboardKpis";
import { DailyAttentionQueue } from "@/components/dashboard/DailyAttentionQueue";
import { CustomerGrowthChart } from "@/components/dashboard/CustomerGrowthChart";
import { RecentActivityTable } from "@/components/dashboard/RecentActivityTable";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Fetch real Supabase metrics, growth points, recent activity, and daily operational queue via fast-path snapshot
  const { metrics, growthData, activities, attentionData } = await getDashboardSnapshot();

  return (
    <div className="flex flex-col gap-5 sm:gap-6 animate-in fade-in slide-in-from-bottom-2 duration-150 w-full max-w-full overflow-x-hidden">
      {/* Page Header Area */}
      <div className="flex flex-col gap-0.5 sm:gap-1 pb-0.5">
        <h1 className="text-xl sm:text-2xl lg:text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
          Dashboard
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Overview of your customers and daily activity
        </p>
      </div>

      {/* 1. Quick Desk Actions Row */}
      <QuickActions />

      {/* 2. Key Performance Indicators Row */}
      <DashboardKpis metrics={metrics} />

      {/* 3. Daily Operations Attention Queue (Phase 6) */}
      <DailyAttentionQueue attentionData={attentionData} />

      {/* 4. Customer Growth & Verification Trend Section */}
      <CustomerGrowthChart initialData={growthData} initialPeriod="30d" />

      {/* 5. Recent Activity High-Density Table */}
      <RecentActivityTable activities={activities} />
    </div>
  );
}
