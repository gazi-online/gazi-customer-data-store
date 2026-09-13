import { CustomerServiceStatus, ServiceRequestPriority, PaymentStatus } from "@/types/service";

// ==============================================================================
// CANONICAL STATUS & FILTER SETS
// ==============================================================================

export const PERSISTED_STATUSES: readonly CustomerServiceStatus[] = [
  'pending',
  'documents_pending',
  'ready_to_submit',
  'submitted',
  'in_process',
  'action_required',
  'completed',
  'delivered',
  'rejected',
  'cancelled',
  'in_progress',
  'archived',
] as const;

export const ACTIVE_STATUSES: readonly CustomerServiceStatus[] = [
  'pending',
  'documents_pending',
  'ready_to_submit',
  'submitted',
  'in_process',
  'action_required',
  'completed',
  'in_progress',
] as const;

export const TERMINAL_STATUSES: readonly CustomerServiceStatus[] = [
  'delivered',
  'rejected',
  'cancelled',
  'archived',
] as const;

export const VALID_PRIORITIES: readonly ServiceRequestPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export const VALID_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'unpaid',
  'partial',
  'paid',
  'waived',
] as const;

export const ALLOWED_LIMITS = [25, 50, 100] as const;
export const DEFAULT_LIMIT = 25;

export const MAX_CUSTOMER_SEARCH_IDS = 100;
export const MAX_SERVICE_SEARCH_IDS = 50;

// ==============================================================================
// TYPED DATA CONTRACTS
// ==============================================================================

export interface RelationalSearchResolution {
  customerIds: string[];
  serviceIds: string[];
  tooBroad: boolean;
  tooBroadSource?: "customer" | "service" | "both" | null;
}

export interface ServiceRequestDeskRow {
  id: string;
  requestNumber: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerCode: string | null;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  serviceCategory: string | null;
  portalName: string | null;
  applicationReference: string | null;
  priority: ServiceRequestPriority;
  status: CustomerServiceStatus;
  amount: number;
  paymentStatus: PaymentStatus;
  serviceDate: string;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
  isOverdue: boolean;
  attachedDocumentCount: number;
  notes: string | null;
}

export interface ServiceRequestsDeskResult {
  data: ServiceRequestDeskRow[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  searchTooBroad?: boolean;
  error?: string | null;
}

export interface ServiceRequestsDeskParams {
  q?: string;
  status?: string;
  priority?: string;
  serviceId?: string;
  paymentStatus?: string;
  overdue?: string;
  sort?: string;
  page?: string | number;
  limit?: string | number;
}

export interface ServiceRequestsSummaryMetrics {
  activeCount: number;
  actionRequiredCount: number;
  docsPendingCount: number;
  overdueCount: number;
  searchTooBroad?: boolean;
}

// ==============================================================================
// SANITIZATION & PARAM PARSING
// ==============================================================================

export function parseDeskParams(params: Record<string, string | string[] | undefined>): {
  q: string;
  status: string;
  priority: string;
  serviceId: string;
  paymentStatus: string;
  overdue: string;
  sort: string;
  page: number;
  limit: number;
} {
  const getSingle = (val: string | string[] | undefined): string => {
    if (Array.isArray(val)) return val[0] || "";
    return val ? String(val).trim() : "";
  };

  const rawQ = getSingle(params.q);
  const { normalizedQ: safeQ } = tokenizeSearchQuery(rawQ);

  const rawStatus = getSingle(params.status).toLowerCase();
  let status = "active";
  if (rawStatus === "all" || rawStatus === "attention" || rawStatus === "active") {
    status = rawStatus;
  } else if (PERSISTED_STATUSES.includes(rawStatus as CustomerServiceStatus)) {
    status = rawStatus;
  }

  const rawPriority = getSingle(params.priority).toLowerCase();
  const priority = VALID_PRIORITIES.includes(rawPriority as ServiceRequestPriority) ? rawPriority : "all";

  const serviceId = getSingle(params.serviceId || params.service);

  const rawPayment = getSingle(params.paymentStatus || params.payment).toLowerCase();
  const paymentStatus = VALID_PAYMENT_STATUSES.includes(rawPayment as PaymentStatus) ? rawPayment : "all";

  const rawOverdue = getSingle(params.overdue).toLowerCase();
  const overdue = rawOverdue === "overdue_only" ? "overdue_only" : "all";

  const rawSort = getSingle(params.sort).toLowerCase();
  const sort = ["oldest", "newest", "due_date"].includes(rawSort) ? rawSort : "oldest";

  const rawPage = parseInt(getSingle(params.page), 10);
  const page = !isNaN(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawLimit = parseInt(getSingle(params.limit), 10);
  const limit = (ALLOWED_LIMITS as readonly number[]).includes(rawLimit)
    ? (rawLimit as typeof ALLOWED_LIMITS[number])
    : DEFAULT_LIMIT;

  return {
    q: safeQ,
    status,
    priority,
    serviceId,
    paymentStatus,
    overdue,
    sort,
    page,
    limit,
  };
}

// ==============================================================================
// SEARCH TOKENIZATION HELPER
// ==============================================================================

/**
 * Normalizes human search queries: collapses whitespace, strips characters
 * that break PostgREST or filter syntax (',()'), and returns non-empty tokens.
 */
export function tokenizeSearchQuery(rawQuery: string): { normalizedQ: string; tokens: string[] } {
  const sanitized = (rawQuery || "").replace(/[,()]/g, " ").trim();
  const normalizedQ = sanitized.replace(/\s+/g, " ");
  const tokens = normalizedQ ? normalizedQ.split(" ").filter((t) => t.length > 0) : [];
  return { normalizedQ, tokens };
}

// ==============================================================================
// INDIA-LOCAL DATE & OVERDUE COMPUTATION HELPER
// ==============================================================================

/**
 * Produces the current calendar date in India / Asia-Kolkata (YYYY-MM-DD).
 * Deterministically handles the UTC-to-IST day boundary.
 */
export function getIndiaLocalDate(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function isRequestOverdue(
  dueDate: string | null | undefined,
  status: CustomerServiceStatus,
  referenceDateStr?: string
): boolean {
  if (!dueDate) return false;
  if (TERMINAL_STATUSES.includes(status)) return false;

  const refDate = referenceDateStr || getIndiaLocalDate();
  const dueDay = dueDate.split("T")[0];
  return dueDay < refDate;
}
