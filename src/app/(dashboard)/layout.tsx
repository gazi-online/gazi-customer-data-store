"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Home, 
  Users, 
  FileText, 
  Wrench, 
  BarChart2, 
  Settings, 
  LogOut,
  Menu,
  X,
  Search,
  Receipt,
  CreditCard
} from "lucide-react";
import { logout } from "./actions";
import { useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Services", href: "/services", icon: Wrench },
  { name: "Reports", href: "/reports", icon: BarChart2 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigating to customers page with search query
      router.push(`/customers?search=${encodeURIComponent(searchQuery)}`);
      setMobileMenuOpen(false);
    }
  };

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center px-6 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-500">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-lg leading-none">G</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">GCDS</h1>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive 
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium" 
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-50"
              }`}
            >
              <Icon className={`h-5 w-5 transition-colors ${
                isActive 
                  ? "text-blue-700 dark:text-blue-400" 
                  : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
              }`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
        <button
          onClick={() => logout()}
          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600 dark:hover:text-red-400 transition-colors group"
        >
          <LogOut className="h-5 w-5 text-zinc-400 group-hover:text-red-500 transition-colors" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </>
  );

  const isPrintRoute = pathname.includes("/invoices/") && pathname.endsWith("/print");

  if (isPrintRoute) {
    return (
      <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 print:bg-white print:min-h-0">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 print:block print:h-auto print:overflow-visible print:bg-white">
      {/* Sidebar - Desktop */}
      <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex-col hidden md:flex shrink-0 print:hidden">
        <SidebarContent />
      </aside>

      {/* Sidebar - Mobile (Overlay) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex print:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-64 max-w-sm bg-white dark:bg-zinc-900 h-full flex flex-col shadow-xl animate-in slide-in-from-left-4 duration-300">
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 flex flex-col overflow-hidden w-full print:block print:overflow-visible">
        {/* Top Header (Desktop & Mobile) */}
        <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 h-16 px-4 md:px-8 flex items-center justify-between shadow-sm z-10 shrink-0 print:hidden">
          <div className="flex items-center flex-1">
            <button 
              className="md:hidden mr-4 p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            
            {/* Global Search - Hidden on very small screens, visible on sm and up */}
            <form onSubmit={handleSearch} className="w-full max-w-md relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Global search (customers, documents...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              />
            </form>
          </div>

          <div className="flex items-center space-x-4">
             {/* Future: Profile Dropdown */}
             <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-800 shadow-sm cursor-pointer hover:bg-blue-200 transition-colors">
               A
             </div>
          </div>
        </header>

        {/* Mobile Search Bar (Only visible below sm breakpoints) */}
        <div className="sm:hidden p-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0 print:hidden">
          <form onSubmit={handleSearch} className="w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>
        </div>

        {/* Page Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-zinc-50/50 dark:bg-zinc-950/50 print:p-0 print:overflow-visible print:bg-white">
          <div className="max-w-7xl mx-auto w-full print:max-w-none">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
