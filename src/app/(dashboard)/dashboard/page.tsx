import { 
  Users, 
  Activity, 
  UserCheck, 
  Briefcase,
  CreditCard,
  Clock,
  ArrowRight,
  TrendingUp,
  UserX
} from "lucide-react";
import Link from "next/link";
import { getDashboardStats, getRecentCustomers } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const recentCustomers = await getRecentCustomers();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard Overview</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
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

        {/* Placeholder: Active Services */}
        <div className="bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Briefcase className="h-16 w-16 text-indigo-600" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center">
              Active Services <span className="ml-2 text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
            </p>
            <p className="text-3xl font-bold text-zinc-300 dark:text-zinc-700 mt-2">--</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
              Services module pending
            </p>
          </div>
        </div>

        {/* Placeholder: Pending Payments */}
        <div className="bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <CreditCard className="h-16 w-16 text-amber-600" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center">
              Pending Payments <span className="ml-2 text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
            </p>
            <p className="text-3xl font-bold text-zinc-300 dark:text-zinc-700 mt-2">--</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
              Payment module pending
            </p>
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
                    {/* Avatar */}
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
                      customer.status === 'inactive' ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50' :
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

        {/* Recent Activities Placeholder */}
        <div className="lg:col-span-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-t-2xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center">
              <Activity className="mr-2 h-5 w-5 text-indigo-600" />
              Recent Activities
            </h2>
          </div>
          <div className="p-12 text-center flex flex-col items-center justify-center h-full min-h-[250px]">
            <Clock className="h-10 w-10 text-zinc-200 dark:text-zinc-800 mb-4" />
            <p className="font-medium text-zinc-500 dark:text-zinc-400">Activity Log pending</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 max-w-[200px]">
              This module will track updates and events across your CRM in future phases.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
