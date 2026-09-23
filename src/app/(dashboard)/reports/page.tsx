import { getCustomersForReportFilter } from "./actions";
import { ReportsDashboardView } from "@/components/reports/ReportsDashboardView";

export const metadata = {
  title: "Reports & Analytics | GCDS",
  description: "Service workload insights, receivables ageing, collections analytics, tax readiness, and customer financial statements.",
};

export default async function ReportsPage() {
  const customers = await getCustomersForReportFilter();
  return <ReportsDashboardView customersList={customers} />;
}
