import { 
  Users, 
  UserCheck, 
  Briefcase,
  CreditCard,
  ArrowRight,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Clock
} from "lucide-react";
import Link from "next/link";
import { getDashboardStats, getRecentCustomers } from "./actions";
import { getDashboardBillingSummary } from "@/app/(dashboard)/payments/actions";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const recentCustomers = await getRecentCustomers();
  const billingSummaryRes = await getDashboardBillingSummary();

  const billingData = billingSummaryRes.data || {
    outstandingReceivables: 0,
    paidThisMonth: 0,
    overdueCount: 0,
    openInvoicesCount: 0,
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard Overview</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        
        {/* Total Customers */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-800 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Users className="h-16 w-16 text-blue-600" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center">
              Total Customers
            </p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-2">{stats.totalCustomers}</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center font-medium">
              <TrendingUp className="h-3 w-3 mr-1" />
              +{stats.todayEntries} new today
            </p>
          </div>
        </div>

        {/* Active Customers */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group hover:border-green-300 dark:hover:border-green-800 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <UserCheck className="h-16 w-16 text-green-600" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center">
              Active Customers
            </p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-2">{stats.activeCustomers}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              Engaged clients
            </p>
          </div>
        </div>

        {/* Active Services */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group hover:border-indigo-300 dark:hover:border-indigo-800 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Briefcase className="h-16 w-16 text-indigo-600" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center">
              Active Services
            </p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white mt-2">{stats.activeServices}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              Pending or in progress
            </p>
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group hover:border-amber-300 dark:hover:border-amber-800 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Receipt className="h-16 w-16 text-amber-600" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center">
              Outstanding Receivables
            </p>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-2 font-mono">
              {formatCurrency(billingData.outstandingReceivables)}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              Non-cancelled due amounts
            </p>
          </div>
        </div>

      </div>

      {/* Secondary Financial Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        
        {/* Revenue Paid This Month */}
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

        {/* Open Invoices Count */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Open Invoices</p>
            <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
              {billingData.openInvoicesCount} <span className="text-xs font-normal text-zinc-500">issued / partial</span>
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center text-blue-600">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        {/* Overdue Invoices Count */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Overdue Invoices</p>
            <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
              {billingData.overdueCount} <span className="text-xs font-normal text-zinc-500">past due</span>
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 flex items-center justify-center text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Customers */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 rounded-t-2xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center">
              <Users className="mr-2 h-5 w-5 text-blue-600" />
              Recent Customers
            </h2>
            <Link href="/customers" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center transition-colors">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {recentCustomers.length === 0 ? (
              <div className="p-12 text-center text-zinc-500">
                <Users className="h-8 w-8 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                <p>No customers found.</p>
              </div>
            ) : (
              recentCustomers.map((customer) => (
                <div key={customer.id} className="p-4 sm:px-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center space-x-4">
                    {customer.photo_url ? (
                      <img src={customer.photo_url} alt="avatar" className="h-10 w-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold border border-blue-100 dark:border-blue-800 shrink-0">
                        {customer.first_name[0]}{customer.last_name[0]}
                      </div>
                    )}
                    
                    <div className="min-w-0">
                      <Link href={`/customers/${customer.id}`} className="font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 transition-colors truncate block">
                        {customer.first_name} {customer.middle_name ? `${customer.middle_name} ` : ""}{customer.last_name}
                      </Link>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{customer.phone}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 sm:space-x-6 shrink-0">
                    <span className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      customer.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800/30' :
                      customer.status === 'inactive' ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-700/50' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/30'
                    }`}>
                      {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
                    </span>
                    <div className="text-right text-xs text-zinc-400 dark:text-zinc-500 hidden md:block">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Billing Shortcuts */}
        <div className="lg:col-span-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <Receipt className="mr-2 h-5 w-5 text-blue-600" />
            Billing Shortcuts
          </h2>

          <div className="space-y-3">
            <Link
              href="/invoices/new"
              className="w-full p-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between transition-colors group"
            >
              <div>
                <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600">Create New Invoice</p>
                <p className="text-xs text-zinc-500">Bill services or products</p>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-blue-600 transition-colors" />
            </Link>

            <Link
              href="/payments"
              className="w-full p-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between transition-colors group"
            >
              <div>
                <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600">Record Payment</p>
                <p className="text-xs text-zinc-500">Log incoming collections</p>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-emerald-600 transition-colors" />
            </Link>

            <Link
              href="/invoices?status=overdue"
              className="w-full p-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between transition-colors group"
            >
              <div>
                <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-amber-600">Review Overdue Invoices</p>
                <p className="text-xs text-zinc-500">{billingData.overdueCount} pending past due</p>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-amber-600 transition-colors" />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
