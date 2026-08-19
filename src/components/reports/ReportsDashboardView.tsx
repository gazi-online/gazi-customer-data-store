"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ReportFilterBar } from "./ReportFilterBar";
import { ReportsOverviewTab } from "./ReportsOverviewTab";
import { ReceivablesAgeingTab } from "./ReceivablesAgeingTab";
import { CollectionsAnalyticsTab } from "./CollectionsAnalyticsTab";
import { TaxReadinessTab } from "./TaxReadinessTab";
import { CustomerStatementTab } from "./CustomerStatementTab";
import { 
  getReportsOverviewData, 
  getReceivablesAgeingData, 
  getCustomerReceivableSummaryData, 
  getCollectionsAnalyticsData, 
  getTaxReadinessSummaryData 
} from "@/app/(dashboard)/reports/actions";
import { 
  ReportFilterParams, 
  ReportOverviewData, 
  AgeingBucketSummary, 
  AgeingItem, 
  CustomerReceivableSummary, 
  CollectionsAnalyticsData, 
  TaxReadinessSummary 
} from "@/lib/reports/report-types";
import { BarChart3, Clock, CreditCard, FileText, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ReportsDashboardViewProps {
  customersList: any[];
}

export function ReportsDashboardView({ customersList }: ReportsDashboardViewProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";
  const initialCustomerId = searchParams.get("customer_id") || "";

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [filterParams, setFilterParams] = useState<ReportFilterParams>({
    quickRange: "this_month",
    customerId: initialCustomerId || undefined,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [overviewData, setOverviewData] = useState<{ dateFrom: string; dateTo: string; overview: ReportOverviewData } | null>(null);
  const [ageingData, setAgeingData] = useState<{ bucketSummaries: AgeingBucketSummary[]; items: AgeingItem[]; totalOutstanding: number } | null>(null);
  const [customerSummaries, setCustomerSummaries] = useState<CustomerReceivableSummary[]>([]);
  const [collectionsData, setCollectionsData] = useState<CollectionsAnalyticsData | null>(null);
  const [taxData, setTaxData] = useState<TaxReadinessSummary | null>(null);

  const loadData = async (params: ReportFilterParams) => {
    try {
      setIsLoading(true);
      const [ov, ag, custs, col, tx] = await Promise.all([
        getReportsOverviewData(params),
        getReceivablesAgeingData(params),
        getCustomerReceivableSummaryData(params),
        getCollectionsAnalyticsData(params),
        getTaxReadinessSummaryData(params),
      ]);

      setOverviewData(ov);
      setAgeingData(ag);
      setCustomerSummaries(custs);
      setCollectionsData(col);
      setTaxData(tx);
    } catch (err: any) {
      console.error("Error loading report analytics:", err);
      toast.error(err.message || "Failed to load report analytics.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(filterParams);
  }, []);

  const handleFilterChange = (newParams: ReportFilterParams) => {
    setFilterParams(newParams);
    loadData(newParams);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Page Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center">
            <BarChart3 className="mr-3 h-8 w-8 text-blue-600" />
            Financial Reports & Analytics Suite
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Receivables ageing analysis, collection metrics, tax readiness & customer statement ledgers.
          </p>
        </div>
      </div>

      {/* Report Filter Bar */}
      <ReportFilterBar
        customersList={customersList}
        initialParams={filterParams}
        onFilterChange={handleFilterChange}
        showCustomerFilter={activeTab !== "statement"}
      />

      {/* Tabs Navigation */}
      <div className="flex items-center space-x-1 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto text-xs font-semibold">
        {[
          { id: "overview", label: "Executive Overview", icon: TrendingUp },
          { id: "ageing", label: "Receivables Ageing", icon: Clock },
          { id: "collections", label: "Collections Analytics", icon: CreditCard },
          { id: "tax_summary", label: "Tax / GST Readiness Summary", icon: FileText },
          { id: "statement", label: "Customer Financial Statement", icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-3 px-4 border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 font-bold"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Display */}
      {isLoading && !overviewData ? (
        <div className="p-16 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-xs text-zinc-500 font-semibold">Computing financial metrics and ageing aggregations...</p>
        </div>
      ) : (
        <div>
          {activeTab === "overview" && overviewData && (
            <ReportsOverviewTab
              data={overviewData.overview}
              dateFrom={overviewData.dateFrom}
              dateTo={overviewData.dateTo}
            />
          )}

          {activeTab === "ageing" && ageingData && (
            <ReceivablesAgeingTab
              bucketSummaries={ageingData.bucketSummaries}
              items={ageingData.items}
              customerSummaries={customerSummaries}
              totalOutstanding={ageingData.totalOutstanding}
            />
          )}

          {activeTab === "collections" && collectionsData && overviewData && (
            <CollectionsAnalyticsTab
              data={collectionsData}
              dateFrom={overviewData.dateFrom}
              dateTo={overviewData.dateTo}
            />
          )}

          {activeTab === "tax_summary" && taxData && overviewData && (
            <TaxReadinessTab
              data={taxData}
              dateFrom={overviewData.dateFrom}
              dateTo={overviewData.dateTo}
            />
          )}

          {activeTab === "statement" && (
            <CustomerStatementTab
              customersList={customersList}
              initialCustomerId={initialCustomerId}
              initialDateFrom={filterParams.dateFrom}
              initialDateTo={filterParams.dateTo}
            />
          )}
        </div>
      )}
    </div>
  );
}
