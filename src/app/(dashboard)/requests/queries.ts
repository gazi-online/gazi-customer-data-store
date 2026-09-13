import { createClient } from "@/lib/supabase/server";
import { CustomerServiceStatus, ServiceRequestPriority, PaymentStatus } from "@/types/service";
import {
  PERSISTED_STATUSES,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  VALID_PRIORITIES,
  VALID_PAYMENT_STATUSES,
  ALLOWED_LIMITS,
  DEFAULT_LIMIT,
  MAX_CUSTOMER_SEARCH_IDS,
  MAX_SERVICE_SEARCH_IDS,
  RelationalSearchResolution,
  ServiceRequestDeskRow,
  ServiceRequestsDeskResult,
  ServiceRequestsDeskParams,
  ServiceRequestsSummaryMetrics,
  parseDeskParams,
  tokenizeSearchQuery,
  getIndiaLocalDate,
  isRequestOverdue,
} from "./types";

export {
  PERSISTED_STATUSES,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  VALID_PRIORITIES,
  VALID_PAYMENT_STATUSES,
  ALLOWED_LIMITS,
  DEFAULT_LIMIT,
  MAX_CUSTOMER_SEARCH_IDS,
  MAX_SERVICE_SEARCH_IDS,
  parseDeskParams,
  tokenizeSearchQuery,
  getIndiaLocalDate,
  isRequestOverdue,
};
export type {
  RelationalSearchResolution,
  ServiceRequestDeskRow,
  ServiceRequestsDeskResult,
  ServiceRequestsDeskParams,
  ServiceRequestsSummaryMetrics,
};

// ==============================================================================
// SEARCH BUILDER HELPERS
// ==============================================================================

/**
 * Builds the PostgREST OR string for searching customer_services.
 * Strictly enforces that customer_id.in.(...) and service_id.in.(...) are
 * ONLY emitted if the corresponding ID arrays are non-empty.
 */
export function buildSearchOrConditions(
  q: string,
  customerIds: string[],
  serviceIds: string[]
): string | null {
  const { normalizedQ } = tokenizeSearchQuery(q);
  if (!normalizedQ) return null;

  const conditions: string[] = [
    `request_number.ilike.%${normalizedQ}%`,
    `application_reference.ilike.%${normalizedQ}%`,
    `portal_name.ilike.%${normalizedQ}%`,
  ];

  if (customerIds && customerIds.length > 0) {
    conditions.push(`customer_id.in.(${customerIds.join(",")})`);
  }
  if (serviceIds && serviceIds.length > 0) {
    conditions.push(`service_id.in.(${serviceIds.join(",")})`);
  }

  return conditions.join(",");
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Resolves customer IDs and service IDs for tokenized search queries.
 * Supports multi-part human names (e.g. "Nur Islam Gazi") by requiring each token
 * to match across the customer's identity fields (first, middle, last, phone, code).
 *
 * Implements bounded candidate lookup (+1 detection) to eliminate silent truncation.
 * If candidate matches exceed MAX_CUSTOMER_SEARCH_IDS or MAX_SERVICE_SEARCH_IDS,
 * sets tooBroad = true so queries do NOT construct partial or deceptively incomplete filters.
 */
export async function resolveRelationalSearchIds(
  supabase: SupabaseServerClient,
  q: string
): Promise<RelationalSearchResolution> {
  const { tokens } = tokenizeSearchQuery(q);
  if (tokens.length === 0) {
    return { customerIds: [], serviceIds: [], tooBroad: false };
  }

  // Build customers query: require every token to match at least one customer identity field
  let custQuery = supabase.from("customers").select("id").is("deleted_at", null);
  for (const token of tokens) {
    custQuery = custQuery.or(
      `first_name.ilike.%${token}%,middle_name.ilike.%${token}%,last_name.ilike.%${token}%,phone.ilike.%${token}%,customer_code.ilike.%${token}%`
    );
  }

  // Build services query: require every token to match service name or code
  let svcQuery = supabase.from("services").select("id").ilike("status", "active");
  for (const token of tokens) {
    svcQuery = svcQuery.or(`service_name.ilike.%${token}%,service_code.ilike.%${token}%`);
  }

  // Query MAX + 1 to detect whether results exceed safe PostgREST URI bounds
  const [custRes, svcRes] = await Promise.all([
    custQuery.limit(MAX_CUSTOMER_SEARCH_IDS + 1),
    svcQuery.limit(MAX_SERVICE_SEARCH_IDS + 1),
  ]);

  const custData = (custRes.data as Array<{ id: string | number }>) || [];
  const svcData = (svcRes.data as Array<{ id: string | number }>) || [];

  const customerTooBroad = custData.length > MAX_CUSTOMER_SEARCH_IDS;
  const serviceTooBroad = svcData.length > MAX_SERVICE_SEARCH_IDS;

  if (customerTooBroad || serviceTooBroad) {
    return {
      customerIds: [],
      serviceIds: [],
      tooBroad: true,
      tooBroadSource:
        customerTooBroad && serviceTooBroad
          ? "both"
          : customerTooBroad
          ? "customer"
          : "service",
    };
  }

  const customerIds: string[] = custData.map((c) => String(c.id));
  const serviceIds: string[] = svcData.map((s) => String(s.id));

  return { customerIds, serviceIds, tooBroad: false };
}

// ==============================================================================
// SERVER READ QUERIES
// ==============================================================================

/**
 * Retrieves the paginated, filtered, and searched list of service requests for the central desk.
 * Strictly uses authenticated Supabase server client, handles relational search via tokenized
 * two-stage ID resolution with strict over-cap detection, uses India-local calendar date for
 * overdue checks, and avoids N+1 queries.
 */
export async function getServiceRequestsDesk(
  rawParams: Record<string, string | string[] | undefined>
): Promise<ServiceRequestsDeskResult> {
  const params = parseDeskParams(rawParams);
  const supabase = await createClient();
  const todayIndia = getIndiaLocalDate();

  try {
    // 1. If search term provided, resolve matching customer IDs and service IDs in parallel
    let customerIdsFilter: string[] = [];
    let serviceIdsFilter: string[] = [];

    if (params.q) {
      const resolved = await resolveRelationalSearchIds(supabase, params.q);
      if (resolved.tooBroad) {
        return {
          data: [],
          totalCount: 0,
          page: params.page,
          limit: params.limit,
          totalPages: 1,
          searchTooBroad: true,
        };
      }
      customerIdsFilter = resolved.customerIds;
      serviceIdsFilter = resolved.serviceIds;
    }

    // 2. Build the primary query on customer_services
    let query = supabase
      .from("customer_services")
      .select(`
        id,
        request_number,
        customer_id,
        service_id,
        status,
        priority,
        amount,
        payment_status,
        service_date,
        due_date,
        notes,
        application_reference,
        portal_name,
        created_at,
        completed_at,
        delivered_at,
        customer:customers (
          id,
          customer_code,
          first_name,
          middle_name,
          last_name,
          phone
        ),
        service:services (
          id,
          service_code,
          service_name,
          category
        ),
        documents:service_request_documents (
          id
        )
      `, { count: "exact" });

    // 3. Apply Search Filter
    if (params.q) {
      const orConditions = buildSearchOrConditions(params.q, customerIdsFilter, serviceIdsFilter);
      if (orConditions) {
        query = query.or(orConditions);
      }
    }

    // 4. Apply Status Filter
    if (params.status === "active") {
      query = query.in("status", ACTIVE_STATUSES);
    } else if (params.status === "attention") {
      query = query.in("status", ACTIVE_STATUSES);
      query = query.or(`status.eq.action_required,due_date.lt.${todayIndia}`);
    } else if (params.status === "all") {
      // No status filter applied
    } else {
      query = query.eq("status", params.status);
    }

    // 5. Apply Priority Filter
    if (params.priority !== "all") {
      query = query.eq("priority", params.priority);
    }

    // 6. Apply Service Catalog Filter
    if (params.serviceId && params.serviceId !== "all") {
      query = query.eq("service_id", params.serviceId);
    }

    // 7. Apply Payment Status Filter
    if (params.paymentStatus !== "all") {
      query = query.eq("payment_status", params.paymentStatus);
    }

    // 8. Apply Overdue Filter (India-local calendar date)
    if (params.overdue === "overdue_only") {
      query = query.not("due_date", "is", null);
      query = query.lt("due_date", todayIndia);
      query = query.not("status", "in", `(${TERMINAL_STATUSES.join(",")})`);
    }

    // 9. Apply Deterministic Sorting
    if (params.sort === "newest") {
      query = query.order("created_at", { ascending: false });
    } else if (params.sort === "due_date") {
      query = query.order("due_date", { ascending: true, nullsFirst: false });
    } else {
      // Default: oldest pending first (FIFO)
      query = query.order("created_at", { ascending: true });
    }

    // 10. Apply Server Pagination
    const from = (params.page - 1) * params.limit;
    const to = from + params.limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error("[ServiceRequestsDesk] Query execution error:", error.message);
      return {
        data: [],
        totalCount: 0,
        page: params.page,
        limit: params.limit,
        totalPages: 1,
        error: "Failed to fetch service requests. Please check filters.",
      };
    }

    const totalCount = count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / params.limit));

    // 11. Map rows to typed ServiceRequestDeskRow
    const rows: ServiceRequestDeskRow[] = (data || []).map((rawRow) => {
      const row = rawRow as Record<string, unknown>;
      const cust = (Array.isArray(row.customer) ? row.customer[0] : row.customer) as Record<string, string | null> | null;
      const svc = (Array.isArray(row.service) ? row.service[0] : row.service) as Record<string, string | null> | null;
      const docs = (Array.isArray(row.documents) ? row.documents : []) as Array<Record<string, unknown>>;

      const fullName = [cust?.first_name, cust?.middle_name, cust?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Unknown Customer";

      const dueDate = (row.due_date as string) || null;
      const status = (row.status as CustomerServiceStatus) || "pending";
      const overdue = isRequestOverdue(dueDate, status, todayIndia);

      return {
        id: String(row.id),
        requestNumber: (row.request_number as string) || null,
        customerId: String(row.customer_id),
        customerName: fullName,
        customerPhone: cust?.phone || null,
        customerCode: cust?.customer_code || null,
        serviceId: String(row.service_id),
        serviceName: svc?.service_name || "Custom Service",
        serviceCode: svc?.service_code || "GEN",
        serviceCategory: svc?.category || null,
        portalName: (row.portal_name as string) || null,
        applicationReference: (row.application_reference as string) || null,
        priority: (row.priority as ServiceRequestPriority) || "normal",
        status,
        amount: Number(row.amount || 0),
        paymentStatus: (row.payment_status as PaymentStatus) || "unpaid",
        serviceDate: String(row.service_date),
        dueDate,
        createdAt: String(row.created_at),
        completedAt: (row.completed_at as string) || null,
        deliveredAt: (row.delivered_at as string) || null,
        isOverdue: overdue,
        attachedDocumentCount: docs.length,
        notes: (row.notes as string) || null,
      };
    });

    return {
      data: rows,
      totalCount,
      page: params.page,
      limit: params.limit,
      totalPages,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ServiceRequestsDesk] Unexpected query error:", errMsg);
    return {
      data: [],
      totalCount: 0,
      page: params.page,
      limit: params.limit,
      totalPages: 1,
      error: "An unexpected error occurred while loading requests.",
    };
  }
}

/**
 * Retrieves summary counts across the service requests dataset.
 * Respects currently applied non-status contextual filters (q, priority, serviceId, paymentStatus),
 * ensuring the metric cards reflect the user's active filter scope across the entire database.
 * Deliberately ignores: current page, current status filter, and overdue-only toggle so that
 * each card accurately displays its own status count (Active, Action Required, Docs Pending, Overdue)
 * across that contextual slice.
 * Uses lightweight parallel HEAD count queries for speed and zero payload overhead.
 */
export async function getServiceRequestsSummaryMetrics(
  rawParams?: Record<string, string | string[] | undefined>
): Promise<ServiceRequestsSummaryMetrics> {
  const params = rawParams ? parseDeskParams(rawParams) : parseDeskParams({});
  const supabase = await createClient();
  const todayIndia = getIndiaLocalDate();

  try {
    let customerIds: string[] = [];
    let serviceIds: string[] = [];

    if (params.q) {
      const resolved = await resolveRelationalSearchIds(supabase, params.q);
      if (resolved.tooBroad) {
        return {
          activeCount: 0,
          actionRequiredCount: 0,
          docsPendingCount: 0,
          overdueCount: 0,
          searchTooBroad: true,
        };
      }
      customerIds = resolved.customerIds;
      serviceIds = resolved.serviceIds;
    }

    type CustomerServicesSelectQuery = ReturnType<ReturnType<SupabaseServerClient["from"]>["select"]>;

    const applyScopedFilters = (baseQuery: CustomerServicesSelectQuery): CustomerServicesSelectQuery => {
      let q = baseQuery;
      if (params.q) {
        const orCond = buildSearchOrConditions(params.q, customerIds, serviceIds);
        if (orCond) {
          q = q.or(orCond);
        }
      }
      if (params.priority !== "all") {
        q = q.eq("priority", params.priority);
      }
      if (params.serviceId && params.serviceId !== "all") {
        q = q.eq("service_id", params.serviceId);
      }
      if (params.paymentStatus !== "all") {
        q = q.eq("payment_status", params.paymentStatus);
      }
      return q;
    };

    const [activeRes, actionRequiredRes, docsPendingRes, overdueRes] = await Promise.all([
      applyScopedFilters(
        supabase
          .from("customer_services")
          .select("id", { count: "exact", head: true })
      ).in("status", ACTIVE_STATUSES),

      applyScopedFilters(
        supabase
          .from("customer_services")
          .select("id", { count: "exact", head: true })
      ).eq("status", "action_required"),

      applyScopedFilters(
        supabase
          .from("customer_services")
          .select("id", { count: "exact", head: true })
      ).eq("status", "documents_pending"),

      applyScopedFilters(
        supabase
          .from("customer_services")
          .select("id", { count: "exact", head: true })
      )
        .in("status", ACTIVE_STATUSES)
        .not("due_date", "is", null)
        .lt("due_date", todayIndia),
    ]);

    return {
      activeCount: activeRes.count || 0,
      actionRequiredCount: actionRequiredRes.count || 0,
      docsPendingCount: docsPendingRes.count || 0,
      overdueCount: overdueRes.count || 0,
    };
  } catch (err) {
    console.error("[ServiceRequestsDesk] Failed to fetch summary metrics:", err);
    return {
      activeCount: 0,
      actionRequiredCount: 0,
      docsPendingCount: 0,
      overdueCount: 0,
    };
  }
}

/**
 * Retrieves active services from catalog to populate the Service filter dropdown.
 */
export async function getDeskCatalogServices(): Promise<Array<{ id: string; service_name: string; service_code: string }>> {
  const supabase = await createClient();
  try {
    const { data } = await supabase
      .from("services")
      .select("id, service_name, service_code")
      .ilike("status", "active")
      .order("service_name", { ascending: true });

    return data || [];
  } catch (err) {
    console.error("[ServiceRequestsDesk] Failed to fetch catalog services:", err);
    return [];
  }
}
