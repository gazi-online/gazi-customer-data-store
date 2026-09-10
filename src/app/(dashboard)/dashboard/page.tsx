import {
  getDashboardMetrics,
  getCustomerGrowthData,
  getRecentActivity,
} from "./actions";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DashboardKpis } from "@/components/dashboard/DashboardKpis";
import { CustomerGrowthChart } from "@/components/dashboard/CustomerGrowthChart";
import { RecentActivityTable } from "@/components/dashboard/RecentActivityTable";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Fetch real Supabase metrics, growth points, and recent activity concurrently
  const [metrics, growthData, activities] = await Promise.all([
    getDashboardMetrics(),
    getCustomerGrowthData("30d"),
    getRecentActivity(6),
  ]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Page Header Area */}
      <div className="flex flex-col gap-1 pb-0.5">
        <h1 className="text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
          Dashboard
        </h1>
        <p className="text-[14px] text-slate-500">
          Overview of your customers and daily activity
        </p>
      </div>

      {/* 1. Quick Desk Actions Row */}
      <QuickActions />

      {/* 2. Key Performance Indicators Row */}
      <DashboardKpis metrics={metrics} />

      {/* 3. Customer Growth & Verification Trend Section */}
      <CustomerGrowthChart initialData={growthData} initialPeriod="30d" />

      {/* 4. Recent Activity High-Density Table */}
      <RecentActivityTable activities={activities} />
    </div>
  );
}
