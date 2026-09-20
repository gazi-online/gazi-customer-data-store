"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "@/providers/QueryProvider";

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
  isMobileDrawer?: boolean;
}

function SidebarContent({ pathname, onClose, isMobileDrawer = false }: SidebarContentProps) {
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    queryClient.clear();
    await logout();
  };

  return (
    <div className="flex flex-col h-full select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 sm:px-5 border-b border-slate-200/80 shrink-0">
        <Link 
          href="/dashboard" 
          onClick={onClose}
          className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
            <span className="font-extrabold text-base leading-none tracking-tight">G</span>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold text-slate-900 tracking-tight leading-none mb-1">GCDS</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
              Customer Data Store
            </span>
          </div>
        </Link>

        {isMobileDrawer && onClose && (
          <button 
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto" aria-label="Sidebar Navigation">
        <div className="px-3 py-1 text-[11px] font-bold tracking-wider uppercase text-slate-400">
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
              className={`flex items-center justify-between px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors group ${
                isActive 
                  ? "bg-violet-50 text-violet-700 font-semibold shadow-2xs" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <Icon className={`h-5 w-5 shrink-0 transition-colors ${
                  isActive 
                    ? "text-violet-600" 
                    : "text-slate-400 group-hover:text-slate-600"
                }`} />
                <span className="truncate">{item.name}</span>
              </div>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0 ml-2" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-200/80 shrink-0 space-y-2 bg-slate-50/50">
        {/* Profile Card inside mobile drawer */}
        {isMobileDrawer && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white border border-slate-200/70 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 select-none">
              GO
            </div>
            <div className="flex flex-col text-left truncate">
              <span className="text-xs font-semibold text-slate-900 truncate leading-tight">Gazi Online</span>
              <span className="text-[10px] text-slate-400 font-medium truncate leading-tight">Admin / Principal ID</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <LogOut className="h-5 w-5 text-slate-400 group-hover:text-rose-500 transition-colors shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

function DashboardShell({
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

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const isPrintRoute = pathname.includes("/invoices/") && pathname.endsWith("/print");

  if (isPrintRoute) {
    return (
      <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 print:bg-white print:min-h-0">
        {children}
      </div>
    );
  }

  // Derive current page title for compact mobile header
  const currentNav = navigation.find(
    (n) => pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href))
  );
  const pageTitle = currentNav?.name ?? "Dashboard";

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFF] print:block print:h-auto print:overflow-visible print:bg-white">
      {/* Sidebar - Desktop */}
      <aside className="w-64 bg-white border-r border-slate-200/80 flex-col hidden md:flex shrink-0 print:hidden select-none">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Sidebar - Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-50 flex print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200" 
            onClick={() => setMobileMenuOpen(false)} 
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <aside className="relative w-[280px] sm:w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200 ease-out">
            <SidebarContent 
              pathname={pathname} 
              onClose={() => setMobileMenuOpen(false)} 
              isMobileDrawer 
            />
          </aside>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 flex flex-col overflow-hidden w-full print:block print:overflow-visible">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200/80 h-16 px-3.5 sm:px-6 md:px-8 flex items-center justify-between shadow-xs z-10 shrink-0 print:hidden">
          {/* Left: Mobile Menu Button & Compact Mobile Page Title / Desktop Search */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <button 
              type="button"
              className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            
            {/* Mobile Header Title: [ GCDS / Current Page ] */}
            <div className="md:hidden flex items-center gap-1.5 min-w-0 truncate">
              <span className="font-bold text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 tracking-tight shrink-0 select-none">
                GCDS
              </span>
              <span className="text-slate-300 select-none">/</span>
              <span className="font-semibold text-sm text-slate-900 truncate">
                {pageTitle}
              </span>
            </div>

            {/* Desktop Global Search Trigger */}
            <div
              onClick={() => setSearchModalOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSearchModalOpen(true);
                }
              }}
              className="w-full max-w-md relative hidden md:flex items-center cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-[12px]"
            >
              <Search className="absolute left-3.5 h-4 w-4 text-slate-400 group-hover:text-violet-600 transition-colors pointer-events-none" />
              <div className="w-full pl-10 pr-12 py-2 bg-slate-50/80 border border-slate-200 group-hover:border-violet-300 group-hover:bg-slate-50 rounded-[12px] text-xs md:text-sm text-slate-400 transition-all select-none">
                Search customers, requests, invoices (⌘K)...
              </div>
              <div className="absolute right-2.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-400 pointer-events-none select-none">
                <span>⌘</span>K
              </div>
            </div>
          </div>

          {/* Right Header: Mobile Search + Operations Bell + User Profile */}
          <div className="flex items-center gap-1 sm:gap-2.5 pl-2 shrink-0">
            {/* Mobile Quick Search Trigger Icon */}
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              aria-label="Open global search"
              className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Operations Inbox Quick Bell */}
            <Link
              href="/operations"
              title="Operations Inbox"
              aria-label="Operations Inbox"
              className="relative min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </Link>

            {/* Authenticated User Profile */}
            <div className="flex items-center gap-2.5 pl-1.5 sm:pl-2 border-l border-slate-200">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center ring-2 ring-slate-100 shadow-xs shrink-0 select-none">
                GO
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-sm font-semibold text-slate-900 leading-tight">Gazi Online</span>
                <span className="text-[11px] text-slate-400 font-medium leading-tight">Admin / Principal ID</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 lg:p-8 bg-[#F8FAFF] print:p-0 print:overflow-visible print:bg-white relative">
          <div className="relative z-10 w-full mx-auto max-w-7xl">
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <DashboardShell>{children}</DashboardShell>
    </QueryProvider>
  );
}
