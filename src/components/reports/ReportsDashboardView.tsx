"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ReportFilterBar } from "./ReportFilterBar";
import { ReportsOverviewTab } from "./ReportsOverviewTab";
import { ReceivablesAgeingTab } from "./ReceivablesAgeingTab";
import { CollectionsAnalyticsTab } from "./CollectionsAnalyticsTab";
import { TaxReadinessTab } from "./TaxReadinessTab";
import { CustomerStatementTab } from "./CustomerStatementTab";
import { ServiceWorkloadTab } from "./ServiceWorkloadTab";
import { 
  getReportsOverviewData, 
  getReceivablesAgeingData, 
  getCustomerReceivableSummaryData, 
  getCollectionsAnalyticsData, 
  getTaxReadinessSummaryData,
  getServiceWorkloadData,
} from "@/app/(dashboard)/reports/actions";
import { 
  ReportFilterParams, 
  ReportOverviewData, 
  AgeingBucketSummary, 
  AgeingItem, 
  CustomerReceivableSummary, 
  CollectionsAnalyticsData, 
  TaxReadinessSummary,
  ServiceWorkloadSummary,
} from "@/lib/reports/report-types";
import { BarChart3, Clock, CreditCard, FileText, TrendingUp, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

interface CustomerFilterItem {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  customer_code?: string;
}

interface ReportsDashboardViewProps {
  customersList: CustomerFilterItem[];
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
  const [workloadData, setWorkloadData] = useState<ServiceWorkloadSummary | null>(null);

  const loadData = async (params: ReportFilterParams) => {
    try {
      setIsLoading(true);
      const [ov, ag, custs, col, tx, wl] = await Promise.all([
        getReportsOverviewData(params),
        getReceivablesAgeingData(params),
        getCustomerReceivableSummaryData(params),
        getCollectionsAnalyticsData(params),
        getTaxReadinessSummaryData(params),
        getServiceWorkloadData(params),
      ]);

      setOverviewData(ov);
      setAgeingData(ag);
      setCustomerSummaries(custs);
      setCollectionsData(col);
      setTaxData(tx);
      setWorkloadData(wl);
    } catch (err: unknown) {
      console.error("Error loading report analytics:", err);
      const msg = err instanceof Error ? err.message : "Failed to load report analytics.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    async function initReports() {
      try {
        setIsLoading(true);
        const [ov, ag, custs, col, tx, wl] = await Promise.all([
          getReportsOverviewData(filterParams),
          getReceivablesAgeingData(filterParams),
          getCustomerReceivableSummaryData(filterParams),
          getCollectionsAnalyticsData(filterParams),
          getTaxReadinessSummaryData(filterParams),
          getServiceWorkloadData(filterParams),
        ]);

        if (!isCancelled) {
          setOverviewData(ov);
          setAgeingData(ag);
          setCustomerSummaries(custs);
          setCollectionsData(col);
          setTaxData(tx);
          setWorkloadData(wl);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error("Error loading report analytics:", err);
          const msg = err instanceof Error ? err.message : "Failed to load report analytics.";
          toast.error(msg);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void initReports();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (newParams: ReportFilterParams) => {
    setFilterParams(newParams);
    void loadData(newParams);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-150">
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
          { id: "workload", label: "Services & Workload", icon: Wrench },
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
          <p className="text-xs text-zinc-500 font-semibold">Computing operational and financial analytics aggregations...</p>
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

          {activeTab === "workload" && workloadData && (
            <ServiceWorkloadTab data={workloadData} />
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
