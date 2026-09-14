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
// REQUEST DRAWER DATA CONTRACTS (PHASE 2B-2)
// ==============================================================================

export interface RequestDrawerDocument {
  id: string;
  requirementTag: string;
  isVerified: boolean;
  documentId: string;
  documentType: string;
  documentName: string;
  fileSize?: number;
  status?: string;
  createdAt: string;
}

export interface RequestDrawerHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
  createdAt: string;
}

export interface RequestDrawerInvoiceItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  dueAmount: number;
  invoiceDate: string;
}

export interface RequestDrawerData {
  id: string;
  requestNumber: string | null;
  status: CustomerServiceStatus;
  priority: ServiceRequestPriority;
  applicationReference: string | null;
  portalName: string | null;
  notes: string | null;
  rejectionReason: string | null;
  amount: number;
  paymentStatus: PaymentStatus;
  serviceDate: string;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
  archivedAt: string | null;
  isOverdue: boolean;

  customer: {
    id: string;
    customerCode: string | null;
    firstName: string;
    middleName: string | null;
    lastName: string;
    phone: string | null;
  };

  service: {
    id: string;
    serviceCode: string;
    serviceName: string;
    category: string | null;
  };

  documents: RequestDrawerDocument[];
  statusHistory: RequestDrawerHistoryItem[];
  invoices: RequestDrawerInvoiceItem[];
}

export type RequestDrawerErrorCode =
  | "invalid_id"
  | "auth_required"
  | "not_found"
  | "query_failed";

export type RequestDrawerResult =
  | {
      data: RequestDrawerData;
      error: null;
      errorCode: null;
    }
  | {
      data: null;
      error: string;
      errorCode: RequestDrawerErrorCode;
    };

// ==============================================================================
// REQUEST DOCUMENT LIFECYCLE DATA CONTRACTS (PHASE 2C-2)
// ==============================================================================

export interface EligibleVaultDocument {
  id: string;
  documentType: string;
  documentName: string;
  sourceFilename?: string;
  status: string;
  version: number;
  uploadedAt: string;
  fileSize?: number;
  existingTags: string[];
}

export type RequestDocumentErrorCode =
  | "invalid_input"
  | "auth_required"
  | "not_found"
  | "customer_mismatch"
  | "not_attachable"
  | "already_attached"
  | "conflict"
  | "upload_failed"
  | "association_failed"
  | "query_failed";

export type RequestDocumentMutationResult =
  | {
      success: true;
      data?: unknown;
      documentId?: string;
      associationId?: string;
      error: null;
      errorCode: null;
      partialSuccess?: false;
    }
  | {
      success: false;
      error: string;
      errorCode: RequestDocumentErrorCode;
      partialSuccess?: boolean;
      documentId?: string;
    };

/**
 * Canonical requirement tag normalizer shared across Attach Existing
 * and Upload New + Attach flows.
 * Guaranteed to produce a non-empty, safe string clamped to 50 characters,
 * with 'general' fallback occurring both before and after normalization.
 */
export function normalizeRequirementTag(tag?: string | null): string {
  if (!tag) return "general";
  const trimmed = tag.trim().toLowerCase();
  if (!trimmed) return "general";
  const sanitized = trimmed
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!sanitized) return "general";
  const sliced = sanitized.slice(0, 50).replace(/_+$/, "");
  return sliced || "general";
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
