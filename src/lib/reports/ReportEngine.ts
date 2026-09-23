import { BillingEngine } from "@/lib/billing/BillingEngine";
import {
  ReportFilterParams,
  ReportOverviewData,
  AgeingBucketKey,
  AgeingBucketSummary,
  AgeingItem,
  CustomerReceivableSummary,
  CollectionsAnalyticsData,
  TaxReadinessSummary,
  CustomerStatementData,
  LedgerEntry,
  ServiceWorkloadSummary,
  ServiceVolumeItem,
  OperationalStatusDistributionItem,
  TurnaroundAnalytics,
} from "./report-types";
import { PaymentMethod } from "@/types/billing";
import { getServiceRequestStatusLabel, isOperationalTerminalStatus } from "@/lib/services/serviceRequestWorkflow";
import { CustomerServiceStatus } from "@/types/service";

export class ReportEngine {
  /**
   * Helper to compute Indian Financial Year date bounds (April 1 -> March 31)
   */
  static getIndianFinancialYearDates(refDate: Date = new Date()): { dateFrom: string; dateTo: string } {
    const year = refDate.getFullYear();
    const month = refDate.getMonth(); // 0-indexed (0 = Jan, 3 = April)

    let startYear: number;
    let endYear: number;

    if (month >= 3) {
      // April (3) to Dec (11) -> FY starts this year
      startYear = year;
      endYear = year + 1;
    } else {
      // Jan (0) to March (2) -> FY started last year
      startYear = year - 1;
      endYear = year;
    }

    const dateFrom = `${startYear}-04-01`;
    const dateTo = `${endYear}-03-31`;

    return { dateFrom, dateTo };
  }

  /**
   * Resolves quick range selection to concrete ISO date strings (YYYY-MM-DD)
   */
  static resolveFilterDates(params: ReportFilterParams): { dateFrom: string; dateTo: string } {
    const today = new Date();

    if (params.quickRange === "this_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        dateFrom: firstDay.toISOString().split("T")[0],
        dateTo: lastDay.toISOString().split("T")[0],
      };
    }

    if (params.quickRange === "last_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        dateFrom: firstDay.toISOString().split("T")[0],
        dateTo: lastDay.toISOString().split("T")[0],
      };
    }

    if (params.quickRange === "last_30_days") {
      const past30 = new Date(today.getTime() - 30 * 86400000);
      return {
        dateFrom: past30.toISOString().split("T")[0],
        dateTo: today.toISOString().split("T")[0],
      };
    }

    if (params.quickRange === "this_financial_year") {
      return this.getIndianFinancialYearDates(today);
    }

    // Default or custom
    return {
      dateFrom: params.dateFrom || "2000-01-01",
      dateTo: params.dateTo || "2099-12-31",
    };
  }

  /**
   * Computes Overview KPI Metrics
   */
  static computeOverview(params: {
    invoices: any[];
    payments: any[];
    todayStr?: string;
  }): ReportOverviewData {
    const today = params.todayStr || new Date().toISOString().split("T")[0];

    // Exclude draft and cancelled invoices from financial metrics
    const activeInvoices = params.invoices.filter((inv) => inv.status !== "draft" && inv.status !== "cancelled");

    const totalBilled = BillingEngine.roundMoney(
      activeInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
    );

    const outstandingReceivables = BillingEngine.roundMoney(
      activeInvoices.reduce((sum, inv) => sum + Number(inv.due_amount || 0), 0)
    );

    const overdueReceivables = BillingEngine.roundMoney(
      activeInvoices
        .filter((inv) => inv.due_date && inv.due_date < today && Number(inv.due_amount || 0) > 0)
        .reduce((sum, inv) => sum + Number(inv.due_amount || 0), 0)
    );

    // Valid recorded payments
    const validPayments = params.payments.filter((p) => p.status === "recorded");
    const totalCollected = BillingEngine.roundMoney(
      validPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    );

    const openInvoicesCount = activeInvoices.filter(
      (inv) => inv.status === "issued" || inv.status === "partially_paid"
    ).length;

    const paidInvoicesCount = activeInvoices.filter((inv) => inv.status === "paid").length;

    // Safe collection rate (0 - 100%)
    let collectionRate = 0;
    if (totalBilled > 0) {
      collectionRate = BillingEngine.roundMoney((totalCollected / totalBilled) * 100);
      collectionRate = Math.min(100, Math.max(0, collectionRate));
    }

    return {
      totalBilled,
      totalCollected,
      outstandingReceivables,
      overdueReceivables,
      openInvoicesCount,
      paidInvoicesCount,
      collectionRate,
    };
  }

  /**
   * Computes Receivables Ageing Buckets and Itemized List
   */
  static computeAgeing(params: {
    invoices: any[];
    todayStr?: string;
  }): {
    bucketSummaries: AgeingBucketSummary[];
    items: AgeingItem[];
    totalOutstanding: number;
  } {
    const today = new Date(params.todayStr || new Date().toISOString().split("T")[0]);

    // Filter only active invoices with due_amount > 0
    const unpaidInvoices = params.invoices.filter(
      (inv) => inv.status !== "draft" && inv.status !== "cancelled" && Number(inv.due_amount || 0) > 0
    );

    const items: AgeingItem[] = [];

    unpaidInvoices.forEach((inv) => {
      let daysOverdue = 0;
      let bucketKey: AgeingBucketKey = "current";
      let bucketLabel = "Current / Not Yet Due";

      if (inv.due_date) {
        const dueDate = new Date(inv.due_date);
        const diffMs = today.getTime() - dueDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
          daysOverdue = diffDays;
          if (daysOverdue <= 30) {
            bucketKey = "1_30";
            bucketLabel = "1–30 Days Overdue";
          } else if (daysOverdue <= 60) {
            bucketKey = "31_60";
            bucketLabel = "31–60 Days Overdue";
          } else if (daysOverdue <= 90) {
            bucketKey = "61_90";
            bucketLabel = "61–90 Days Overdue";
          } else {
            bucketKey = "91_plus";
            bucketLabel = "91+ Days Overdue";
          }
        }
      }

      const custName = inv.customer
        ? `${inv.customer.first_name} ${inv.customer.middle_name ? inv.customer.middle_name + " " : ""}${inv.customer.last_name}`
        : "Unknown Customer";

      items.push({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        customerId: inv.customer_id,
        customerName: custName,
        invoiceDate: inv.invoice_date,
        dueDate: inv.due_date || null,
        daysOverdue,
        totalAmount: Number(inv.total_amount || 0),
        paidAmount: Number(inv.paid_amount || 0),
        dueAmount: Number(inv.due_amount || 0),
        bucketKey,
        bucketLabel,
      });
    });

    const totalOutstanding = BillingEngine.roundMoney(
      items.reduce((sum, it) => sum + it.dueAmount, 0)
    );

    // Initialize bucket summaries
    const bucketDefs: { key: AgeingBucketKey; label: string }[] = [
      { key: "current", label: "Current / Not Yet Due" },
      { key: "1_30", label: "1–30 Days Overdue" },
      { key: "31_60", label: "31–60 Days Overdue" },
      { key: "61_90", label: "61–90 Days Overdue" },
      { key: "91_plus", label: "91+ Days Overdue" },
    ];

    const bucketSummaries: AgeingBucketSummary[] = bucketDefs.map((def) => {
      const bucketItems = items.filter((it) => it.bucketKey === def.key);
      const amount = BillingEngine.roundMoney(bucketItems.reduce((sum, it) => sum + it.dueAmount, 0));
      const uniqueCusts = new Set(bucketItems.map((it) => it.customerId)).size;
      const percentage = totalOutstanding > 0 ? BillingEngine.roundMoney((amount / totalOutstanding) * 100) : 0;

      return {
        key: def.key,
        label: def.label,
        invoiceCount: bucketItems.length,
        customerCount: uniqueCusts,
        outstandingAmount: amount,
        percentageOfTotal: percentage,
      };
    });

    return { bucketSummaries, items, totalOutstanding };
  }

  /**
   * Computes Customer Receivable Aggregations
   */
  static computeCustomerReceivableSummary(params: {
    customers: any[];
    invoices: any[];
    todayStr?: string;
  }): CustomerReceivableSummary[] {
    const today = params.todayStr || new Date().toISOString().split("T")[0];

    const custMap = new Map<string, CustomerReceivableSummary>();

    params.customers.forEach((c) => {
      const name = `${c.first_name} ${c.middle_name ? c.middle_name + " " : ""}${c.last_name}`;
      custMap.set(c.id, {
        customerId: c.id,
        customerName: name,
        customerCode: c.customer_code,
        totalBilled: 0,
        totalPaid: 0,
        outstanding: 0,
        overdue: 0,
        oldestDaysOverdue: 0,
      });
    });

    params.invoices.forEach((inv) => {
      if (inv.status === "draft" || inv.status === "cancelled") return;

      let summary = custMap.get(inv.customer_id);
      if (!summary) {
        const cName = inv.customer
          ? `${inv.customer.first_name} ${inv.customer.middle_name ? inv.customer.middle_name + " " : ""}${inv.customer.last_name}`
          : "Unknown Customer";

        summary = {
          customerId: inv.customer_id,
          customerName: cName,
          customerCode: inv.customer?.customer_code,
          totalBilled: 0,
          totalPaid: 0,
          outstanding: 0,
          overdue: 0,
          oldestDaysOverdue: 0,
        };
        custMap.set(inv.customer_id, summary);
      }

      const due = Number(inv.due_amount || 0);
      const paid = Number(inv.paid_amount || 0);
      const total = Number(inv.total_amount || 0);

      summary.totalBilled = BillingEngine.roundMoney(summary.totalBilled + total);
      summary.totalPaid = BillingEngine.roundMoney(summary.totalPaid + paid);
      summary.outstanding = BillingEngine.roundMoney(summary.outstanding + due);

      if (inv.due_date && inv.due_date < today && due > 0) {
        summary.overdue = BillingEngine.roundMoney(summary.overdue + due);

        const diffDays = Math.floor(
          (new Date(today).getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays > summary.oldestDaysOverdue) {
          summary.oldestDaysOverdue = diffDays;
          summary.oldestInvoiceNumber = inv.invoice_number;
        }
      }
    });

    return Array.from(custMap.values()).filter((s) => s.totalBilled > 0 || s.outstanding > 0);
  }

  /**
   * Computes Collections Analytics by Payment Method and Trends
   */
  static computeCollections(params: { payments: any[] }): CollectionsAnalyticsData {
    // Filter strictly valid recorded payments (exclude voided / refunded)
    const validPayments = params.payments.filter((p) => p.status === "recorded");

    const byMethod: Record<PaymentMethod, number> = {
      cash: 0,
      upi: 0,
      bank_transfer: 0,
      card: 0,
      cheque: 0,
      other: 0,
    };

    const monthlyMap = new Map<string, number>();

    let totalCollections = 0;

    validPayments.forEach((p) => {
      const amt = Number(p.amount || 0);
      totalCollections = BillingEngine.roundMoney(totalCollections + amt);

      const method = (p.payment_method || "other") as PaymentMethod;
      if (byMethod[method] !== undefined) {
        byMethod[method] = BillingEngine.roundMoney(byMethod[method] + amt);
      } else {
        byMethod.other = BillingEngine.roundMoney(byMethod.other + amt);
      }

      if (p.payment_date) {
        const monthKey = p.payment_date.substring(0, 7); // e.g. "2026-08"
        const currentMonthTotal = monthlyMap.get(monthKey) || 0;
        monthlyMap.set(monthKey, BillingEngine.roundMoney(currentMonthTotal + amt));
      }
    });

    const monthlyTrends = Array.from(monthlyMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalCollections,
      byMethod,
      monthlyTrends,
      recentPaymentsCount: validPayments.length,
    };
  }

  /**
   * Computes Tax / GST Readiness Summary based on generic stored tax fields
   */
  static computeTaxReadiness(params: { invoices: any[] }): TaxReadinessSummary {
    const activeInvoices = params.invoices.filter((inv) => inv.status !== "draft" && inv.status !== "cancelled");

    let taxableBillingBase = 0;
    let discountTotal = 0;
    let taxAmountBilled = 0;
    let totalInvoiceAmount = 0;
    let invoicesWithTaxCount = 0;
    let zeroTaxInvoicesCount = 0;

    activeInvoices.forEach((inv) => {
      const sub = Number(inv.subtotal || 0);
      const disc = Number(inv.discount_amount || 0);
      const tax = Number(inv.tax_amount || 0);
      const total = Number(inv.total_amount || 0);

      taxableBillingBase = BillingEngine.roundMoney(taxableBillingBase + sub);
      discountTotal = BillingEngine.roundMoney(discountTotal + disc);
      taxAmountBilled = BillingEngine.roundMoney(taxAmountBilled + tax);
      totalInvoiceAmount = BillingEngine.roundMoney(totalInvoiceAmount + total);

      if (tax > 0) {
        invoicesWithTaxCount++;
      } else {
        zeroTaxInvoicesCount++;
      }
    });

    return {
      taxableBillingBase,
      discountTotal,
      taxAmountBilled,
      totalInvoiceAmount,
      invoicesWithTaxCount,
      zeroTaxInvoicesCount,
      totalActiveInvoicesCount: activeInvoices.length,
    };
  }

  /**
   * Computes Customer Financial Statement & Ledger
   */
  static computeCustomerStatement(params: {
    customer: any;
    invoices: any[];
    payments: any[];
    dateFrom: string;
    dateTo: string;
  }): CustomerStatementData {
    const customerName = params.customer
      ? `${params.customer.first_name} ${params.customer.middle_name ? params.customer.middle_name + " " : ""}${params.customer.last_name}`
      : "Selected Customer";

    // 1. Compute Opening Balance (prior transactions before dateFrom)
    const priorInvoices = params.invoices.filter(
      (inv) => inv.status !== "draft" && inv.status !== "cancelled" && inv.invoice_date < params.dateFrom
    );
    const priorInvoicesTotal = priorInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);

    const priorPayments = params.payments.filter(
      (p) => p.status === "recorded" && p.payment_date < params.dateFrom
    );
    const priorPaymentsTotal = priorPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const openingBalance = BillingEngine.roundMoney(priorInvoicesTotal - priorPaymentsTotal);

    // 2. Filter transactions during period [dateFrom, dateTo]
    const periodInvoices = params.invoices.filter(
      (inv) => inv.status !== "draft" && inv.status !== "cancelled" && inv.invoice_date >= params.dateFrom && inv.invoice_date <= params.dateTo
    );

    const periodPayments = params.payments.filter(
      (p) => p.payment_date >= params.dateFrom && p.payment_date <= params.dateTo
    );

    // Combine transactions into chronological order
    const rawEvents: Array<{
      date: string;
      id: string;
      reference: string;
      type: 'invoice' | 'payment' | 'void_adjustment' | 'refund_adjustment';
      description: string;
      debit: number;
      credit: number;
      status?: string;
    }> = [];

    periodInvoices.forEach((inv) => {
      rawEvents.push({
        date: inv.invoice_date,
        id: inv.id,
        reference: `#${inv.invoice_number}`,
        type: "invoice",
        description: inv.notes || `Invoice #${inv.invoice_number}`,
        debit: Number(inv.total_amount || 0),
        credit: 0,
        status: inv.status,
      });
    });

    periodPayments.forEach((p) => {
      if (p.status === "recorded") {
        rawEvents.push({
          date: p.payment_date,
          id: p.id,
          reference: `#${p.payment_number}`,
          type: "payment",
          description: `Payment (${(p.payment_method || "").toUpperCase()}) ${p.reference_number ? `Ref: ${p.reference_number}` : ""}`,
          debit: 0,
          credit: Number(p.amount || 0),
          status: "recorded",
        });
      } else if (p.status === "voided" || p.status === "refunded") {
        // Render adjustment event showing voided/refunded with 0 credit effect
        rawEvents.push({
          date: p.payment_date,
          id: p.id,
          reference: `#${p.payment_number}`,
          type: p.status === "voided" ? "void_adjustment" : "refund_adjustment",
          description: `Payment #${p.payment_number} (${p.status.toUpperCase()}) - Zero credit effect`,
          debit: 0,
          credit: 0,
          status: p.status,
        });
      }
    });

    // Sort events by date ascending
    rawEvents.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate Running Balance
    let runningBalance = openingBalance;
    let billedDuringPeriod = 0;
    let paymentsDuringPeriod = 0;
    let adjustmentsDuringPeriod = 0;

    const entries: LedgerEntry[] = rawEvents.map((evt) => {
      if (evt.type === "invoice") {
        billedDuringPeriod = BillingEngine.roundMoney(billedDuringPeriod + evt.debit);
        runningBalance = BillingEngine.roundMoney(runningBalance + evt.debit);
      } else if (evt.type === "payment") {
        paymentsDuringPeriod = BillingEngine.roundMoney(paymentsDuringPeriod + evt.credit);
        runningBalance = BillingEngine.roundMoney(runningBalance - evt.credit);
      } else {
        adjustmentsDuringPeriod++;
      }

      return {
        id: evt.id,
        date: evt.date,
        reference: evt.reference,
        type: evt.type,
        description: evt.description,
        debit: evt.debit,
        credit: evt.credit,
        balance: runningBalance,
        status: evt.status,
      };
    });

    const closingBalance = runningBalance;

    return {
      customerId: params.customer?.id || "",
      customerName,
      customerCode: params.customer?.customer_code,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      openingBalance,
      billedDuringPeriod,
      paymentsDuringPeriod,
      adjustmentsDuringPeriod,
      closingBalance,
      entries,
    };
  }

  /**
   * Computes Service Workload and Operational Analytics
   * Server-authoritative pure calculation based on customer_services and services master.
   */
  static computeServiceWorkloadAnalytics(params: {
    customerServices: Array<{
      id: string;
      service_id: string;
      status: string;
      created_at: string;
      completed_at?: string | null;
      delivered_at?: string | null;
      services?: {
        id: string;
        service_name?: string | null;
        service_code?: string | null;
      } | null;
    }>;
    dateFrom: string;
    dateTo: string;
  }): ServiceWorkloadSummary {
    const { customerServices, dateFrom, dateTo } = params;

    // Convert filter boundaries to comparable epoch ms
    // dateFrom is YYYY-MM-DD (start of day)
    // dateTo is YYYY-MM-DD (end of day inclusive: dateTo + 1 day start in half-open comparison)
    const fromEpoch = new Date(`${dateFrom}T00:00:00Z`).getTime();
    // To handle half-open boundary cleanly: [start of dateFrom, start of day after dateTo)
    const nextDay = new Date(`${dateTo}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const toExclusiveEpoch = nextDay.getTime();

    let totalCreatedInPeriod = 0;
    let totalCompletedInPeriod = 0;
    let activePendingWork = 0;
    let cohortCompletedCount = 0;

    const turnaroundDaysList: number[] = [];
    const serviceMap = new Map<string, {
      serviceId: string;
      serviceName: string;
      serviceCode?: string;
      total: number;
      completed: number;
      active: number;
    }>();

    const statusCounts = new Map<string, number>();

    for (const cs of customerServices) {
      const createdEpoch = new Date(cs.created_at).getTime();
      const isCreatedInPeriod = !isNaN(createdEpoch) && createdEpoch >= fromEpoch && createdEpoch < toExclusiveEpoch;

      // Completion timestamp: completed_at preferred, delivered_at as fallback
      const completionEpoch = cs.completed_at
        ? new Date(cs.completed_at).getTime()
        : cs.delivered_at
        ? new Date(cs.delivered_at).getTime()
        : null;

      const isCompletedInPeriod =
        completionEpoch !== null &&
        !isNaN(completionEpoch) &&
        completionEpoch >= fromEpoch &&
        completionEpoch < toExclusiveEpoch;

      if (isCreatedInPeriod) {
        totalCreatedInPeriod++;

        // Track cohort completion (created in this period and already completed)
        if (cs.status === "completed" || cs.status === "delivered") {
          cohortCompletedCount++;
        }
      }

      if (isCompletedInPeriod) {
        totalCompletedInPeriod++;

        // Turnaround calculation (completed in this period with trustworthy start timestamp)
        if (!isNaN(createdEpoch) && completionEpoch >= createdEpoch) {
          const diffMs = completionEpoch - createdEpoch;
          const days = Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10;
          turnaroundDaysList.push(days);
        }
      }

      // Check current active/pending status across all active records
      const isTerminal = isOperationalTerminalStatus(cs.status as CustomerServiceStatus);
      if (!isTerminal && cs.status !== "completed") {
        activePendingWork++;
      }

      // Workload by service (based on work created in the period)
      if (isCreatedInPeriod) {
        const srvId = cs.service_id || "unknown";
        const srvName = cs.services?.service_name || "General Service";
        const srvCode = cs.services?.service_code || undefined;

        let entry = serviceMap.get(srvId);
        if (!entry) {
          entry = {
            serviceId: srvId,
            serviceName: srvName,
            serviceCode: srvCode,
            total: 0,
            completed: 0,
            active: 0,
          };
          serviceMap.set(srvId, entry);
        }

        entry.total++;
        if (cs.status === "completed" || cs.status === "delivered") {
          entry.completed++;
        } else if (!isTerminal) {
          entry.active++;
        }

        // Status distribution tally
        statusCounts.set(cs.status, (statusCounts.get(cs.status) || 0) + 1);
      }
    }

    // Cohort completion rate: of items created in this window, what % finished
    let cohortCompletionRate = 0;
    if (totalCreatedInPeriod > 0) {
      cohortCompletionRate = Math.round((cohortCompletedCount / totalCreatedInPeriod) * 100);
      cohortCompletionRate = Math.min(100, Math.max(0, cohortCompletionRate));
    }

    // Top services ranked deterministically: volume DESC, then name ASC
    const topServices: ServiceVolumeItem[] = Array.from(serviceMap.values())
      .map((entry) => ({
        serviceId: entry.serviceId,
        serviceName: entry.serviceName,
        serviceCode: entry.serviceCode,
        totalRequests: entry.total,
        completedRequests: entry.completed,
        activeRequests: entry.active,
        sharePercentage: totalCreatedInPeriod > 0
          ? Math.round((entry.total / totalCreatedInPeriod) * 100)
          : 0,
      }))
      .sort((a, b) => {
        if (b.totalRequests !== a.totalRequests) {
          return b.totalRequests - a.totalRequests;
        }
        return a.serviceName.localeCompare(b.serviceName);
      });

    // Status distribution
    const statusDistribution: OperationalStatusDistributionItem[] = Array.from(statusCounts.entries())
      .map(([statusKey, count]) => {
        const isTerminal = isOperationalTerminalStatus(statusKey as CustomerServiceStatus);
        const label = getServiceRequestStatusLabel(statusKey as CustomerServiceStatus);
        const percentage = totalCreatedInPeriod > 0
          ? Math.round((count / totalCreatedInPeriod) * 100)
          : 0;

        return {
          status: statusKey,
          label,
          count,
          percentage,
          isTerminal,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Turnaround stats: average, median, min, max
    let averageDays = 0;
    let medianDays = 0;
    let minDays = 0;
    let maxDays = 0;
    const sampleCount = turnaroundDaysList.length;

    if (sampleCount > 0) {
      turnaroundDaysList.sort((a, b) => a - b);
      const sum = turnaroundDaysList.reduce((acc, val) => acc + val, 0);
      averageDays = Math.round((sum / sampleCount) * 10) / 10;
      minDays = turnaroundDaysList[0];
      maxDays = turnaroundDaysList[sampleCount - 1];

      const mid = Math.floor(sampleCount / 2);
      if (sampleCount % 2 === 0) {
        medianDays = Math.round(((turnaroundDaysList[mid - 1] + turnaroundDaysList[mid]) / 2) * 10) / 10;
      } else {
        medianDays = turnaroundDaysList[mid];
      }
    }

    const turnaround: TurnaroundAnalytics = {
      averageDays,
      medianDays,
      minDays,
      maxDays,
      sampleCount,
    };

    return {
      dateFrom,
      dateTo,
      totalCreatedInPeriod,
      totalCompletedInPeriod,
      activePendingWork,
      cohortCompletionRate,
      turnaround,
      topServices,
      statusDistribution,
    };
  }
}
