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
  Bell,
  ChevronRight,
} from "lucide-react";
import { logout } from "./actions";
import { useState, useEffect } from "react";
import { GlobalCommandSearchModal } from "@/components/search/GlobalCommandSearchModal";

/* ─────────────────────────────────────────────
   Navigation groups
───────────────────────────────────────────── */
const navGroups = [
  {
    label: "Operations",
    items: [
      { name: "Dashboard",      href: "/dashboard",      icon: Home },
      { name: "Operations",     href: "/operations",     icon: Bell },
      { name: "Communications", href: "/communications", icon: MessageSquare },
    ],
  },
  {
    label: "Work",
    items: [
      { name: "Requests",  href: "/requests",  icon: ClipboardList },
      { name: "Customers", href: "/customers", icon: Users },
      { name: "Documents", href: "/documents", icon: FileText },
      { name: "Services",  href: "/services",  icon: Wrench },
    ],
  },
  {
    label: "Finance",
    items: [
      { name: "Invoices", href: "/invoices", icon: Receipt },
      { name: "Payments", href: "/payments", icon: CreditCard },
      { name: "Reports",  href: "/reports",  icon: BarChart2 },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/* ─────────────────────────────────────────────
   Sidebar Content
───────────────────────────────────────────── */
interface SidebarContentProps {
  pathname: string;
  onClose?: () => void;
}

function SidebarContent({ pathname, onClose }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="h-16 flex items-center px-5 border-b border-slate-100 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-3 group" onClick={onClose}>
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-violet-200">
            <span className="font-black text-base leading-none tracking-tight">G</span>
          </div>
          <div className="flex flex-col gap-px">
            <span className="text-[15px] font-bold text-slate-900 tracking-tight leading-none">GCDS</span>
            <span className="text-[10px] uppercase font-semibold tracking-widest text-slate-400 leading-none">
              Customer Data
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5" aria-label="Sidebar navigation">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400/70">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 group ${
                      isActive
                        ? "bg-violet-50 text-violet-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {/* Active left accent */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-violet-600"
                        aria-hidden="true"
                      />
                    )}
                    <Icon
                      className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                        isActive
                          ? "text-violet-600"
                          : "text-slate-400 group-hover:text-slate-600"
                      }`}
                    />
                    <span className="flex-1 truncate">{item.name}</span>
                    {isActive && (
                      <ChevronRight className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-slate-100 shrink-0">
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors group"
        >
          <LogOut className="h-[17px] w-[17px] shrink-0 text-slate-400 group-hover:text-red-500 transition-colors" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Dashboard Layout
───────────────────────────────────────────── */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // ⌘K / Ctrl+K shortcut
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
      <div className="min-h-screen bg-zinc-100 print:bg-white print:min-h-0">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFF] print:block print:h-auto print:overflow-visible print:bg-white">

      {/* ── Sidebar: Desktop ───────────────────────── */}
      <aside className="w-60 bg-white border-r border-slate-100 flex-col hidden md:flex shrink-0 print:hidden select-none">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* ── Sidebar: Mobile overlay ─────────────────── */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex print:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-250 ease-out">
            <button
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
              className="absolute top-3.5 right-3.5 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors z-10"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent pathname={pathname} onClose={() => setMobileMenuOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden w-full min-w-0 print:block print:overflow-visible">

        {/* Top Header */}
        <header className="bg-white border-b border-slate-100 h-14 px-4 md:px-6 flex items-center justify-between shrink-0 print:hidden z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 -ml-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              aria-label="Open navigation"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Mobile brand (shown only when sidebar hidden) */}
            <Link
              href="/dashboard"
              className="md:hidden flex items-center gap-2.5"
            >
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-sm">
                <span className="font-black text-sm leading-none">G</span>
              </div>
              <span className="text-sm font-bold text-slate-900 tracking-tight">GCDS</span>
            </Link>

            {/* Search bar — hidden on smallest screens, visible sm+ */}
            <div
              onClick={() => setSearchModalOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSearchModalOpen(true)}
              aria-label="Open global search"
              className="hidden sm:flex flex-1 max-w-md items-center relative cursor-pointer group"
            >
              <Search className="absolute left-3 h-4 w-4 text-slate-400 group-hover:text-violet-500 transition-colors pointer-events-none" />
              <div className="w-full pl-9 pr-14 py-2 bg-slate-50 border border-slate-200 group-hover:border-violet-300 group-hover:bg-white rounded-xl text-sm text-slate-400 transition-all select-none">
                Search customers, requests, invoices…
              </div>
              <kbd className="absolute right-3 hidden lg:flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-400 pointer-events-none">
                <span>⌘</span>K
              </kbd>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 pl-3">
            {/* Mobile search icon */}
            <button
              className="sm:hidden p-2 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors"
              aria-label="Search"
              onClick={() => setSearchModalOpen(true)}
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Operations bell */}
            <Link
              href="/operations"
              title="Operations Inbox"
              className="relative p-2 text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-xl transition-colors"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" aria-label="Alerts pending" />
            </Link>

            {/* User chip */}
            <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center ring-2 ring-violet-100 shadow-sm select-none">
                GO
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-sm font-semibold text-slate-800 leading-tight">Gazi Online</span>
                <span className="text-[11px] text-slate-400 font-medium leading-tight">Owner</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto bg-[#F8FAFF] print:p-0 print:overflow-visible print:bg-white">
          <div className="w-full mx-auto max-w-screen-2xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
            {children}
          </div>
        </div>
      </main>

      {/* Global search modal */}
      <GlobalCommandSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </div>
  );
}
