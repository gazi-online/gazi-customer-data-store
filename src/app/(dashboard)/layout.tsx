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
  CreditCard,
  ClipboardList,
  MessageSquare,
  Bell
} from "lucide-react";
import { logout } from "./actions";
import { useState, useEffect } from "react";
import { GlobalCommandSearchModal } from "@/components/search/GlobalCommandSearchModal";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Operations", href: "/operations", icon: Bell },
  { name: "Communications", href: "/communications", icon: MessageSquare },
  { name: "Requests", href: "/requests", icon: ClipboardList },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Services", href: "/services", icon: Wrench },
  { name: "Reports", href: "/reports", icon: BarChart2 },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarContentProps {
  pathname: string;
  onClose?: () => void;
}

function SidebarContent({ pathname, onClose }: SidebarContentProps) {
  return (
    <>
      {/* Brand Logo Header */}
      <div className="h-16 flex items-center px-5 border-b border-slate-200/80 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
            <span className="font-extrabold text-base leading-none tracking-tight">G</span>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold text-slate-900 tracking-tight leading-none mb-1">GCDS</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
              Customer Data Store
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Sidebar Navigation">
        <div className="px-3 text-[11px] font-bold tracking-wider uppercase text-slate-400 mb-2">
          Main Menu
        </div>
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs md:text-sm font-medium transition-colors group ${
                isActive 
                  ? "bg-violet-50 text-violet-700 font-semibold" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 transition-colors ${
                  isActive 
                    ? "text-violet-600" 
                    : "text-slate-400 group-hover:text-slate-600"
                }`} />
                <span>{item.name}</span>
              </div>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-200/80 shrink-0">
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors group"
        >
          <LogOut className="h-4 w-4 text-slate-400 group-hover:text-red-500 transition-colors" />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Global shortcut for Command/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isPrintRoute = pathname.includes("/invoices/") && pathname.endsWith("/print");

  if (isPrintRoute) {
    return (
      <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 print:bg-white print:min-h-0">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFF] print:block print:h-auto print:overflow-visible print:bg-white">
      {/* Sidebar - Desktop */}
      <aside className="w-64 bg-white border-r border-slate-200/80 flex-col hidden md:flex shrink-0 print:hidden select-none">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Sidebar - Mobile (Overlay) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex print:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-64 max-w-sm bg-white h-full flex flex-col shadow-xl animate-in slide-in-from-left-4 duration-300">
            <button 
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-4 p-2 text-slate-500 hover:bg-slate-100 rounded-full"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent pathname={pathname} onClose={() => setMobileMenuOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 flex flex-col overflow-hidden w-full print:block print:overflow-visible">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200/80 h-16 px-4 md:px-8 flex items-center justify-between shadow-xs z-10 shrink-0 print:hidden">
          <div className="flex items-center gap-4 flex-1">
            <button 
              className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            
            {/* Global Search Trigger */}
            <div
              onClick={() => setSearchModalOpen(true)}
              className="w-full max-w-md relative hidden sm:flex items-center cursor-pointer group"
            >
              <Search className="absolute left-3.5 h-4 w-4 text-slate-400 group-hover:text-violet-600 transition-colors" />
              <div className="w-full pl-10 pr-12 py-2 bg-slate-50/80 border border-slate-200 group-hover:border-violet-300 group-hover:bg-slate-50 rounded-[12px] text-xs md:text-sm text-slate-400 transition-all select-none">
                Search customers, requests, invoices (⌘K)...
              </div>
              <div className="absolute right-2.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-400 pointer-events-none">
                <span>⌘</span>K
              </div>
            </div>
          </div>

          {/* Right Header: Operations Bell + User Profile */}
          <div className="flex items-center gap-3 pl-2">
            {/* Operations Inbox Quick Bell */}
            <Link
              href="/operations"
              title="Operations Inbox"
              className="relative p-2 text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-xl transition-colors"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </Link>

            {/* Authenticated User Profile */}
            <div className="flex items-center gap-2.5 pl-1 border-l border-slate-200">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center ring-2 ring-slate-100 shadow-xs">
                GO
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-sm font-semibold text-slate-900 leading-tight">Gazi Online</span>
                <span className="text-[11px] text-slate-400 font-medium leading-tight">Admin / Principal ID</span>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Search Bar (Only visible below sm breakpoints) */}
        <div className="sm:hidden p-3 bg-white border-b border-slate-200/80 shrink-0 print:hidden">
          <div
            onClick={() => setSearchModalOpen(true)}
            className="w-full relative flex items-center cursor-pointer"
          >
            <Search className="absolute left-3 h-4 w-4 text-slate-400" />
            <div className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-[12px] text-xs text-slate-400">
              Search customers, requests, invoices...
            </div>
          </div>
        </div>

        {/* Page Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F8FAFF] print:p-0 print:overflow-visible print:bg-white relative">
          <div className="relative z-10 w-full mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* Universal Search & Command Palette Modal */}
      <GlobalCommandSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </div>
  );
}
