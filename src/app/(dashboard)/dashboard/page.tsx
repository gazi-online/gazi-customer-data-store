import {
  Users,
  UserCheck,
  Briefcase,
  CreditCard,
  ArrowRight,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Clock,
} from "lucide-react";
import Link from "next/link";
import {
  getDashboardStats,
  getRecentCustomers,
  getCustomerGrowthData,
  getRevenueChartData,
  getCustomerStatusDistribution,
  getServiceTypeDistribution,
} from "./actions";
import { getDashboardBillingSummary } from "@/app/(dashboard)/payments/actions";
import { CustomerGrowthChart } from "@/components/dashboard/CustomerGrowthChart";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { CustomerStatusChart } from "@/components/dashboard/CustomerStatusChart";
import { ServicesChart } from "@/components/dashboard/ServicesChart";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number) {
  return (
    "₹" +
    Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  subtextColor?: string;
  icon: React.ReactNode;
  accentClass: string;
  valueClass?: string;
}

function MetricCard({
  label,
  value,
  subtext,
  subtextColor = "text-zinc-500 dark:text-zinc-400",
  icon,
  accentClass,
  valueClass = "text-zinc-900 dark:text-white",
}: MetricCardProps) {
  return (
    <div
      className={`bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group transition-colors ${accentClass}`}
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none">
        {icon}
      </div>
      <div className="relative z-10">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className={`text-3xl font-bold mt-2 font-mono ${valueClass}`}>{value}</p>
        {subtext && (
          <p className={`text-xs mt-2 flex items-center font-medium ${subtextColor}`}>
            {subtext}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const [
    stats,
    recentCustomers,
    billingSummaryRes,
    growthData,
    revenueData,
    statusDist,
    serviceDist,
  ] = await Promise.all([
    getDashboardStats(),
    getRecentCustomers(),
    getDashboardBillingSummary(),
    getCustomerGrowthData("30d"),
    getRevenueChartData(6),
    getCustomerStatusDistribution(),
    getServiceTypeDistribution(),
  ]);

  const billingData = billingSummaryRes.data || {
    outstandingReceivables: 0,
    paidThisMonth: 0,
    overdueCount: 0,
    openInvoicesCount: 0,
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dashboard Overview
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
          Welcome back! Here's what's happening today.
        </p>
      </div>

      {/* ── KPI Cards Row ── */}
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <MetricCard
            label="Total Customers"
            value={stats.totalCustomers}
            subtext={`+${stats.todayEntries} new today`}
            subtextColor="text-green-600 dark:text-green-400"
            icon={<Users className="h-16 w-16 text-blue-600" />}
            accentClass="hover:border-blue-300 dark:hover:border-blue-800"
          />
          <MetricCard
            label="Active Customers"
            value={stats.activeCustomers}
            subtext="Engaged clients"
            icon={<UserCheck className="h-16 w-16 text-green-600" />}
            accentClass="hover:border-green-300 dark:hover:border-green-800"
          />
          <MetricCard
            label="Active Services"
            value={stats.activeServices}
            subtext="Pending or in progress"
            icon={<Briefcase className="h-16 w-16 text-indigo-600" />}
            accentClass="hover:border-indigo-300 dark:hover:border-indigo-800"
          />
          <MetricCard
            label="Outstanding Receivables"
            value={formatCurrency(billingData.outstandingReceivables)}
            subtext="Non-cancelled due amounts"
            valueClass="text-amber-600 dark:text-amber-400"
            icon={<Receipt className="h-16 w-16 text-amber-600" />}
            accentClass="hover:border-amber-300 dark:hover:border-amber-800"
          />
        </div>
      </section>

      {/* ── Secondary Billing Bar ── */}
      <section aria-label="Billing summary">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Collections This Month</p>
              <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(billingData.paidThisMonth)}
              </p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center text-emerald-600">
              <CreditCard className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Open Invoices</p>
              <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                {billingData.openInvoicesCount}{" "}
                <span className="text-xs font-normal text-zinc-500">issued / partial</span>
              </p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center text-blue-600">
              <Clock className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Overdue Invoices</p>
              <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
                {billingData.overdueCount}{" "}
                <span className="text-xs font-normal text-zinc-500">past due</span>
              </p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 flex items-center justify-center text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Charts Row 1: Growth + Revenue ── */}
      <section aria-label="Growth and revenue charts">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CustomerGrowthChart initialData={growthData} initialPeriod="30d" />
          <RevenueChart data={revenueData} />
        </div>
      </section>

      {/* ── Charts Row 2: Status Donut + Services + Recent Customers ── */}
      <section aria-label="Distribution and recent activity">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer Status Donut */}
          <CustomerStatusChart data={statusDist} />

          {/* Services Distribution */}
          <ServicesChart data={serviceDist} />

          {/* Recent Customers */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 rounded-t-2xl">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Recent Customers
              </h2>
              <Link
                href="/customers"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center transition-colors"
                aria-label="View all customers"
              >
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50 flex-1">
              {recentCustomers.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 flex flex-col items-center gap-2">
                  <Users className="h-7 w-7 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-sm">No customers found.</p>
                </div>
              ) : (
                recentCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {customer.photo_url ? (
                        <img
                          src={customer.photo_url}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <div
                          className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold border border-blue-100 dark:border-blue-800 shrink-0 text-xs"
                          aria-hidden="true"
                        >
                          {customer.first_name?.[0]}
                          {customer.last_name?.[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-medium text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 transition-colors truncate block"
                        >
                          {customer.first_name}{" "}
                          {customer.middle_name ? `${customer.middle_name} ` : ""}
                          {customer.last_name}
                        </Link>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {customer.phone}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        customer.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {customer.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Quick Billing Shortcuts ── */}
      <section aria-label="Quick actions">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
            <Receipt className="h-4 w-4 text-blue-600" aria-hidden="true" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/invoices/new"
              className="p-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between transition-colors group"
            >
              <div>
                <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600">
                  Create New Invoice
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Bill services or products</p>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-blue-600 transition-colors" />
            </Link>
            <Link
              href="/payments"
              className="p-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between transition-colors group"
            >
              <div>
                <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600">
                  Record Payment
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Log incoming collections</p>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-emerald-600 transition-colors" />
            </Link>
            <Link
              href="/invoices?status=overdue"
              className="p-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between transition-colors group"
            >
              <div>
                <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-amber-600">
                  Review Overdue Invoices
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {billingData.overdueCount} pending past due
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-amber-600 transition-colors" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
