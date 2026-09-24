"use client";

import React, { useState, useTransition } from "react";
import {
  Settings as SettingsIcon,
  Store,
  CreditCard,
  Users,
  Download,
  ShieldCheck,
  CheckCircle2,
  Save,
  FileSpreadsheet,
  Database,
  Receipt,
  FileText,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";
import {
  BusinessSettingsData,
  TeamMemberItem,
  getBusinessSettings,
  getTeamMembers,
  updateBusinessSettings,
} from "@/app/(dashboard)/settings/actions";
import {
  exportCustomersCsv,
  exportRequestsCsv,
  exportDocumentsCatalogCsv,
  exportInvoicesCsv,
} from "@/app/(dashboard)/settings/export-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getMfaStatusAction } from "@/app/(dashboard)/settings/security/mfa/actions";

interface SettingsTabsViewProps {
  initialSettings?: BusinessSettingsData | null;
  teamMembers?: TeamMemberItem[];
}

const defaultFormData: Partial<BusinessSettingsData> = {
  business_name: "Gazi Online",
  legal_name: "Gazi Online",
  phone: "",
  email: "",
  address_line1: "",
  city: "",
  district: "",
  state: "West Bengal",
  pincode: "",
  upi_id: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  invoice_prefix: "INV",
  invoice_footer: "Gazi Online",
};

export function SettingsTabsView({ initialSettings, teamMembers: initialTeamMembers }: SettingsTabsViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"profile" | "billing" | "team" | "security" | "exports">("profile");
  const [isSaving, startSaveTransition] = useTransition();
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // TanStack Query for MFA Security Status (staleTime: 1 min, memory-only)
  const {
    data: mfaStatus,
    isLoading: isMfaLoading,
  } = useQuery({
    queryKey: queryKeys.settings.mfaStatus(DASHBOARD_MEMORY_SCOPE),
    queryFn: () => getMfaStatusAction(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // TanStack Query for Business Settings (staleTime: 5 min, memory-only)
  const {
    data: businessSettings,
    isLoading: isBusinessLoading,
    isError: isBusinessError,
    refetch: refetchBusiness,
  } = useQuery({
    queryKey: queryKeys.settings.business(DASHBOARD_MEMORY_SCOPE),
    queryFn: () => getBusinessSettings(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    ...(initialSettings ? { initialData: initialSettings } : {}),
  });

  // TanStack Query for Team Members (staleTime: 1 min, memory-only display state)
  const {
    data: teamMembers = initialTeamMembers || [],
    isLoading: isTeamLoading,
    isError: isTeamError,
    refetch: refetchTeam,
  } = useQuery({
    queryKey: queryKeys.settings.team(DASHBOARD_MEMORY_SCOPE),
    queryFn: () => getTeamMembers(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    ...(initialTeamMembers ? { initialData: initialTeamMembers } : {}),
  });

  // Draft state architecture: user edits stored separately to prevent background refetches from clobbering unsaved edits
  const [draft, setDraft] = useState<Partial<BusinessSettingsData>>({});

  const effectiveFormData: Partial<BusinessSettingsData> = {
    ...defaultFormData,
    ...(businessSettings ?? {}),
    ...draft,
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startSaveTransition(async () => {
      try {
        await updateBusinessSettings(effectiveFormData);
        toast.success("Business settings saved successfully!");
        // Invalidate settings.business query cache
        await queryClient.invalidateQueries({
          queryKey: queryKeys.settings.business(DASHBOARD_MEMORY_SCOPE),
        });
        // Invalidate communications.shopName query cache (Communications caches shop name for templates)
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communications.shopName(DASHBOARD_MEMORY_SCOPE),
        });
        // Clear draft after successful save
        setDraft({});
        router.refresh();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to save settings";
        toast.error(message);
      }
    });
  };

  const triggerCsvDownload = (csvText: string, filename: string) => {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (type: "customers" | "requests" | "documents" | "invoices") => {
    setIsExporting(type);
    const dateStr = new Date().toISOString().split("T")[0];
    try {
      if (type === "customers") {
        const csv = await exportCustomersCsv();
        triggerCsvDownload(csv, `GCDS_Customers_${dateStr}.csv`);
        toast.success("Customers exported successfully!");
      } else if (type === "requests") {
        const csv = await exportRequestsCsv();
        triggerCsvDownload(csv, `GCDS_Requests_${dateStr}.csv`);
        toast.success("Requests exported successfully!");
      } else if (type === "documents") {
        const csv = await exportDocumentsCatalogCsv();
        triggerCsvDownload(csv, `GCDS_Documents_Catalog_${dateStr}.csv`);
        toast.success("Documents catalog exported successfully!");
      } else if (type === "invoices") {
        const csv = await exportInvoicesCsv();
        triggerCsvDownload(csv, `GCDS_Invoices_${dateStr}.csv`);
        toast.success("Invoices exported successfully!");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to export data";
      toast.error(message);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="p-3.5 sm:p-6 md:p-8 space-y-5 sm:space-y-6 max-w-6xl mx-auto w-full overflow-x-hidden sm:overflow-visible">
      {/* Page Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-start sm:items-center gap-2.5">
          <SettingsIcon className="h-5 w-5 sm:h-6 sm:w-6 text-violet-600 shrink-0 mt-0.5 sm:mt-0" />
          <span>Shop Settings & Daily Business Readiness</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
          Manage shop identity, address, UPI payment details, team roles, and data export archives.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="relative -mx-3.5 sm:mx-0 px-3.5 sm:px-0">
        <div className="flex border-b border-slate-200 overflow-x-auto gap-1.5 sm:gap-2 pb-px scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 min-h-[44px] text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 rounded-t-xl ${
              activeTab === "profile"
                ? "border-violet-600 text-violet-700 bg-violet-50/60"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/60"
            }`}
          >
            <Store className="h-4 w-4 shrink-0" />
            <span>Shop Profile & Address</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("billing")}
            className={`flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 min-h-[44px] text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 rounded-t-xl ${
              activeTab === "billing"
                ? "border-violet-600 text-violet-700 bg-violet-50/60"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/60"
            }`}
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span>Billing & UPI Details</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("team")}
            className={`flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 min-h-[44px] text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 rounded-t-xl ${
              activeTab === "team"
                ? "border-violet-600 text-violet-700 bg-violet-50/60"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/60"
            }`}
          >
            <Users className="h-4 w-4 shrink-0" />
            <span>Team & Staff Roles {isTeamLoading && teamMembers.length === 0 ? "" : `(${teamMembers.length})`}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("security")}
            className={`flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 min-h-[44px] text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 rounded-t-xl ${
              activeTab === "security"
                ? "border-violet-600 text-violet-700 bg-violet-50/60"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/60"
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Security & MFA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("exports")}
            className={`flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 min-h-[44px] text-xs font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 rounded-t-xl ${
              activeTab === "exports"
                ? "border-violet-600 text-violet-700 bg-violet-50/60"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/60"
            }`}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Data Exports & Backups</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SHOP PROFILE & ADDRESS */}
      {activeTab === "profile" && (
        isBusinessLoading && !businessSettings ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-6 animate-pulse">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="space-y-2">
                <div className="h-5 w-48 bg-slate-200 rounded-md" />
                <div className="h-3 w-72 bg-slate-100 rounded-md" />
              </div>
              <div className="h-10 w-28 bg-slate-200 rounded-xl" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-24 bg-slate-200 rounded" />
                  <div className="h-10 bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ) : isBusinessError && !businessSettings ? (
          <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-xs text-center space-y-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 text-red-600 mb-1">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Failed to load business settings</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              An unexpected error occurred while loading settings. Please try again.
            </p>
            <button
              type="button"
              onClick={() => refetchBusiness()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-5 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">Shop Identity & Location</h2>
                <p className="text-xs text-slate-500 mt-0.5">Displayed on printed invoices, customer receipts, and communications.</p>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] sm:min-h-[38px] bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Business / Shop Name *</label>
                <input
                  type="text"
                  name="business_name"
                  value={effectiveFormData.business_name || ""}
                  onChange={handleChange}
                  required
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Legal Name</label>
                <input
                  type="text"
                  name="legal_name"
                  value={effectiveFormData.legal_name || ""}
                  onChange={handleChange}
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Shop Phone / Mobile</label>
                <input
                  type="text"
                  name="phone"
                  value={effectiveFormData.phone || ""}
                  onChange={handleChange}
                  placeholder="6295051584"
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={effectiveFormData.email || ""}
                  onChange={handleChange}
                  placeholder="shop@example.com"
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">GSTIN (if applicable)</label>
                <input
                  type="text"
                  name="gstin"
                  value={effectiveFormData.gstin || ""}
                  onChange={handleChange}
                  placeholder="19XXXXX0000X1Z5"
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Operational Timezone</label>
                <input
                  type="text"
                  value="Asia/Kolkata (IST = UTC+05:30)"
                  disabled
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Shop Address</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Address Line 1</label>
                  <input
                    type="text"
                    name="address_line1"
                    value={effectiveFormData.address_line1 || ""}
                    onChange={handleChange}
                    placeholder="Street / Village / Post Office"
                    className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">City / Block</label>
                  <input
                    type="text"
                    name="city"
                    value={effectiveFormData.city || ""}
                    onChange={handleChange}
                    placeholder="Basirhat - I"
                    className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">District</label>
                  <input
                    type="text"
                    name="district"
                    value={effectiveFormData.district || ""}
                    onChange={handleChange}
                    placeholder="North 24 Parganas"
                    className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">State</label>
                  <input
                    type="text"
                    name="state"
                    value={effectiveFormData.state || "West Bengal"}
                    onChange={handleChange}
                    className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Pincode</label>
                  <input
                    type="text"
                    name="pincode"
                    value={effectiveFormData.pincode || ""}
                    onChange={handleChange}
                    placeholder="743422"
                    className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                  />
                </div>
              </div>
            </div>
          </form>
        )
      )}

      {/* TAB 2: BILLING & UPI */}
      {activeTab === "billing" && (
        isBusinessLoading && !businessSettings ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-6 animate-pulse">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="space-y-2">
                <div className="h-5 w-48 bg-slate-200 rounded-md" />
                <div className="h-3 w-72 bg-slate-100 rounded-md" />
              </div>
              <div className="h-10 w-28 bg-slate-200 rounded-xl" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-24 bg-slate-200 rounded" />
                  <div className="h-10 bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ) : isBusinessError && !businessSettings ? (
          <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-xs text-center space-y-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 text-red-600 mb-1">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Failed to load billing configuration</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              An unexpected error occurred while loading billing settings. Please try again.
            </p>
            <button
              type="button"
              onClick={() => refetchBusiness()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-5 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">Billing & Payment Configuration</h2>
                <p className="text-xs text-slate-500 mt-0.5">Controls UPI QR details and default invoice terms.</p>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] sm:min-h-[38px] bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">UPI ID for Invoices (VPA)</label>
                <input
                  type="text"
                  name="upi_id"
                  value={effectiveFormData.upi_id || ""}
                  onChange={handleChange}
                  placeholder="example@upi"
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-violet-500/20"
                />
                <p className="text-[11px] text-slate-400">Printed on invoice for instant QR scanning by customers.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Invoice Number Prefix</label>
                <input
                  type="text"
                  name="invoice_prefix"
                  value={effectiveFormData.invoice_prefix || "INV"}
                  onChange={handleChange}
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Bank Name</label>
                <input
                  type="text"
                  name="bank_name"
                  value={effectiveFormData.bank_name || ""}
                  onChange={handleChange}
                  placeholder="State Bank of India"
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Account Holder Name</label>
                <input
                  type="text"
                  name="bank_account_name"
                  value={effectiveFormData.bank_account_name || ""}
                  onChange={handleChange}
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Account Number</label>
                <input
                  type="text"
                  name="bank_account_number"
                  value={effectiveFormData.bank_account_number || ""}
                  onChange={handleChange}
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">IFSC Code</label>
                <input
                  type="text"
                  name="bank_ifsc"
                  value={effectiveFormData.bank_ifsc || ""}
                  onChange={handleChange}
                  placeholder="SBIN000XXXX"
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700">Invoice Footer Note</label>
                <input
                  type="text"
                  name="invoice_footer"
                  value={effectiveFormData.invoice_footer || ""}
                  onChange={handleChange}
                  placeholder="Thank you for your business!"
                  className="w-full min-h-[42px] text-sm sm:text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>
            </div>
          </form>
        )
      )}

      {/* TAB 3: TEAM MEMBERS & ROLES */}
      {activeTab === "team" && (
        isTeamLoading && teamMembers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-5 animate-pulse">
            <div className="space-y-2 pb-4 border-b border-slate-100">
              <div className="h-5 w-48 bg-slate-200 rounded-md" />
              <div className="h-3 w-72 bg-slate-100 rounded-md" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl" />
              ))}
            </div>
          </div>
        ) : isTeamError && teamMembers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-xs text-center space-y-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 text-red-600 mb-1">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Failed to load team members</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              An unexpected error occurred while loading team members. Please try again.
            </p>
            <button
              type="button"
              onClick={() => refetchTeam()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-5 sm:space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">Shop Staff & Role Privileges</h2>
              <p className="text-xs text-slate-500 mt-0.5">Active operators and administrators authorized to access this tenant database.</p>
            </div>

            <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {teamMembers.map((m) => (
                    <tr key={m.userId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{m.email || "Staff Member"}</div>
                        <div className="text-[11px] text-slate-400 font-mono">UID: {m.userId}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          m.role === "owner"
                            ? "bg-purple-100 text-purple-700"
                            : m.role === "admin"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {m.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(m.createdAt).toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 border border-slate-200 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Role Privilege Policies
              </div>
              <p>• <strong>Owner</strong>: Full administrative privileges, financial adjustments, invoice voids, and membership configuration.</p>
              <p>• <strong>Admin / Operator</strong>: Creates and processes customer services, invoices, payments, and communications. Cannot alter tenant ownership.</p>
            </div>
          </div>
        )
      )}

      {/* TAB 4: DATA EXPORTS & BACKUP READINESS */}
      {activeTab === "exports" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-5 sm:space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">Operator Data Exports & Disaster Recovery</h2>
            <p className="text-xs text-slate-500 mt-0.5">Export complete shop datasets in universal CSV format for offline reporting and backups.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customers Export */}
            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-all flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-2">Customers Catalog</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Includes customer names, phone numbers, addresses, district, pincode, and registration dates.
                </p>
              </div>
              <button
                onClick={() => handleExport("customers")}
                disabled={isExporting !== null}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {isExporting === "customers" ? "Generating..." : "Export Customers (CSV)"}
              </button>
            </div>

            {/* Requests Export */}
            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-all flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-2">Service Requests</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Includes all service requests, customer contact numbers, current lifecycle states, due dates, and payment statuses.
                </p>
              </div>
              <button
                onClick={() => handleExport("requests")}
                disabled={isExporting !== null}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {isExporting === "requests" ? "Generating..." : "Export Requests (CSV)"}
              </button>
            </div>

            {/* Documents Catalog Export */}
            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-all flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-2">Documents Metadata</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Document names, categories, issue/expiry dates, and verification states. Excludes raw private storage files.
                </p>
              </div>
              <button
                onClick={() => handleExport("documents")}
                disabled={isExporting !== null}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {isExporting === "documents" ? "Generating..." : "Export Documents (CSV)"}
              </button>
            </div>

            {/* Invoices Export */}
            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-all flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Receipt className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-2">Billing & Invoices</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Invoice ledger with invoice numbers, billed amounts, paid amounts, outstanding balances, and dates.
                </p>
              </div>
              <button
                onClick={() => handleExport("invoices")}
                disabled={isExporting !== null}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {isExporting === "invoices" ? "Generating..." : "Export Invoices (CSV)"}
              </button>
            </div>
          </div>

          {/* Backup & Disaster Recovery Guide */}
          <div className="border-t border-slate-100 pt-6 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Database className="h-4 w-4 text-violet-600" />
              Supabase Cloud Backup & Disaster Recovery Runbook
            </h3>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 text-xs text-slate-600 space-y-2">
              <p>
                <strong>Automated Daily Backups:</strong> The production PostgreSQL database is managed and hosted on Supabase Enterprise Cloud infrastructure with automated point-in-time daily backups.
              </p>
              <p>
                <strong>Reproducible Schema Migrations:</strong> All database tables, triggers, indexes, and RLS policies are tracked under version control in <code>supabase/migrations/</code>. Any clean Supabase project can be initialized with complete schema parity.
              </p>
              <p>
                <strong>Manual Backup Dump:</strong> To create an immediate offline PostgreSQL logical dump, run:
                <code className="block bg-slate-900 text-slate-200 p-2.5 rounded-xl font-mono text-[11px] mt-1 break-all sm:break-normal overflow-x-auto">
                  supabase db dump -p ilsgrjcmyoufkeiqlaxm &gt; backup_$(date +%Y%m%d).sql
                </code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SECURITY & MFA */}
      {activeTab === "security" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Account Security & Two-Step Verification
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Protect your account by requiring an authenticator code when signing in.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 p-5 sm:p-6 bg-slate-50/50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-violet-100/70 border border-violet-200/60 flex items-center justify-center text-violet-700 shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900">
                      Two-Step Verification
                    </h3>
                    {isMfaLoading ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                        Checking...
                      </span>
                    ) : mfaStatus?.hasVerifiedFactor ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        Not set up
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">
                    Add an extra layer of protection to your account using an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.).
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                {mfaStatus?.hasVerifiedFactor ? (
                  <Link
                    href="/settings/security/mfa"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition-colors"
                  >
                    <span>View Details</span>
                  </Link>
                ) : (
                  <Link
                    href="/settings/security/mfa"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                  >
                    <span>Set up authenticator</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
