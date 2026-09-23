import { PaymentMethod } from "@/types/billing";

export type QuickDateRange = 
  | 'this_month' 
  | 'last_month' 
  | 'last_30_days' 
  | 'this_financial_year' 
  | 'custom';

export interface ReportFilterParams {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  invoiceStatus?: string;
  paymentMethod?: string;
  quickRange?: QuickDateRange;
}

export interface ReportOverviewData {
  totalBilled: number;
  totalCollected: number;
  outstandingReceivables: number;
  overdueReceivables: number;
  openInvoicesCount: number;
  paidInvoicesCount: number;
  collectionRate: number; // percentage (0 - 100)
}

export type AgeingBucketKey = 'current' | '1_30' | '31_60' | '61_90' | '91_plus';

export interface AgeingBucketSummary {
  key: AgeingBucketKey;
  label: string;
  invoiceCount: number;
  customerCount: number;
  outstandingAmount: number;
  percentageOfTotal: number;
}

export interface AgeingItem {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string | null;
  daysOverdue: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  bucketKey: AgeingBucketKey;
  bucketLabel: string;
}

export interface CustomerReceivableSummary {
  customerId: string;
  customerName: string;
  customerCode?: string;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
  oldestInvoiceNumber?: string;
  oldestDaysOverdue: number;
}

export interface CollectionsAnalyticsData {
  totalCollections: number;
  byMethod: Record<PaymentMethod, number>;
  monthlyTrends: Array<{
    month: string; // e.g. "2026-08" or "Aug 2026"
    amount: number;
  }>;
  recentPaymentsCount: number;
}

export interface TaxReadinessSummary {
  taxableBillingBase: number; // subtotal
  discountTotal: number;
  taxAmountBilled: number; // tax_amount
  totalInvoiceAmount: number; // total_amount
  invoicesWithTaxCount: number;
  zeroTaxInvoicesCount: number;
  totalActiveInvoicesCount: number;
}

export interface LedgerEntry {
  id: string;
  date: string;
  reference: string;
  type: 'invoice' | 'payment' | 'void_adjustment' | 'refund_adjustment';
  description: string;
  debit: number;
  credit: number;
  balance: number;
  status?: string;
}

export interface CustomerStatementData {
  customerId: string;
  customerName: string;
  customerCode?: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  billedDuringPeriod: number;
  paymentsDuringPeriod: number;
  adjustmentsDuringPeriod: number;
  closingBalance: number;
  entries: LedgerEntry[];
}

export interface ServiceVolumeItem {
  serviceId: string;
  serviceName: string;
  serviceCode?: string;
  totalRequests: number;
  completedRequests: number;
  activeRequests: number;
  sharePercentage: number;
}

export interface OperationalStatusDistributionItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
  isTerminal: boolean;
}

export interface TurnaroundAnalytics {
  averageDays: number;
  medianDays: number;
  minDays: number;
  maxDays: number;
  sampleCount: number;
}

export interface ServiceWorkloadSummary {
  dateFrom: string;
  dateTo: string;
  totalCreatedInPeriod: number;
  totalCompletedInPeriod: number;
  activePendingWork: number;
  cohortCompletionRate: number; // percentage (0 - 100) of items created in period that completed
  turnaround: TurnaroundAnalytics;
  topServices: ServiceVolumeItem[];
  statusDistribution: OperationalStatusDistributionItem[];
}
