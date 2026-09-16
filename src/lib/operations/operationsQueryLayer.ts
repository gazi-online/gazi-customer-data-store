import { createClient } from "@/lib/supabase/server";
import {
  getKolkataTodayHalfOpenRange,
  getKolkataDateString,
  getKolkataFutureDateString,
  classifyFollowupState,
  FollowupState,
} from "./dateUtils";

export interface ServiceRequestFollowupItem {
  id: string;
  customerServiceId: string;
  followUpAt: string;
  note: string | null;
  status: 'open' | 'completed' | 'cancelled' | 'rescheduled';
  resolutionNote: string | null;
  completedAt: string | null;
  supersededBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  state?: FollowupState;
  customerService?: {
    id: string;
    requestNumber: string | null;
    status: string;
    customer?: {
      id: string;
      customerCode: string | null;
      firstName: string;
      middleName: string | null;
      lastName: string;
      phone: string | null;
    };
    service?: {
      id: string;
      serviceCode: string;
      serviceName: string;
    };
  };
}

export interface RequestFollowupSummary {
  activeFollowup: ServiceRequestFollowupItem | null;
  state: FollowupState | 'none';
  history: ServiceRequestFollowupItem[];
  hasOpenFollowup: boolean;
}

export interface RenewalsDueSummary {
  expired: number;
  due7Days: number;
  due30Days: number;
  due60Days: number;
}

/**
 * Returns open follow-ups due today in Asia/Kolkata [startOfTodayIST, startOfTomorrowIST).
 */
export async function getDueTodayFollowups() {
  const supabase = await createClient();
  const { startOfTodayIST, startOfTomorrowIST } = getKolkataTodayHalfOpenRange();

  const { data, count, error } = await supabase
    .from("service_request_followups")
    .select(`
      id,
      customer_service_id,
      follow_up_at,
      note,
      status,
      resolution_note,
      completed_at,
      superseded_by,
      created_by,
      created_at,
      updated_at,
      customer_services!inner (
        id,
        request_number,
        status,
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
          service_name
        )
      )
    `, { count: "exact" })
    .eq("status", "open")
    .gte("follow_up_at", startOfTodayIST)
    .lt("follow_up_at", startOfTomorrowIST)
    .order("follow_up_at", { ascending: true });

  if (error) {
    console.error("[getDueTodayFollowups] Error:", error.message);
    return { count: 0, items: [] };
  }

  return {
    count: count || 0,
    items: (data || []).map(mapFollowupRow),
  };
}

/**
 * Returns open follow-ups overdue in Asia/Kolkata (< startOfTodayIST).
 */
export async function getOverdueFollowups() {
  const supabase = await createClient();
  const { startOfTodayIST } = getKolkataTodayHalfOpenRange();

  const { data, count, error } = await supabase
    .from("service_request_followups")
    .select(`
      id,
      customer_service_id,
      follow_up_at,
      note,
      status,
      resolution_note,
      completed_at,
      superseded_by,
      created_by,
      created_at,
      updated_at,
      customer_services!inner (
        id,
        request_number,
        status,
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
          service_name
        )
      )
    `, { count: "exact" })
    .eq("status", "open")
    .lt("follow_up_at", startOfTodayIST)
    .order("follow_up_at", { ascending: true });

  if (error) {
    console.error("[getOverdueFollowups] Error:", error.message);
    return { count: 0, items: [] };
  }

  return {
    count: count || 0,
    items: (data || []).map(mapFollowupRow),
  };
}

/**
 * Returns open follow-ups upcoming in Asia/Kolkata (>= startOfTomorrowIST).
 */
export async function getUpcomingFollowups() {
  const supabase = await createClient();
  const { startOfTomorrowIST } = getKolkataTodayHalfOpenRange();

  const { data, count, error } = await supabase
    .from("service_request_followups")
    .select(`
      id,
      customer_service_id,
      follow_up_at,
      note,
      status,
      resolution_note,
      completed_at,
      superseded_by,
      created_by,
      created_at,
      updated_at,
      customer_services!inner (
        id,
        request_number,
        status,
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
          service_name
        )
      )
    `, { count: "exact" })
    .eq("status", "open")
    .gte("follow_up_at", startOfTomorrowIST)
    .order("follow_up_at", { ascending: true });

  if (error) {
    console.error("[getUpcomingFollowups] Error:", error.message);
    return { count: 0, items: [] };
  }

  return {
    count: count || 0,
    items: (data || []).map(mapFollowupRow),
  };
}

/**
 * Fetches the follow-up summary and audit history for a specific service request.
 */
export async function getRequestFollowupSummary(requestId: string): Promise<RequestFollowupSummary> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_request_followups")
    .select("*")
    .eq("customer_service_id", requestId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getRequestFollowupSummary] Error:", error.message);
    return {
      activeFollowup: null,
      state: 'none',
      history: [],
      hasOpenFollowup: false,
    };
  }

  const items = (data || []).map(mapFollowupRow);
  const activeFollowup = items.find((f) => f.status === "open") || null;

  let state: FollowupState | 'none' = 'none';
  if (activeFollowup) {
    state = classifyFollowupState(activeFollowup.followUpAt, activeFollowup.status);
  } else if (items.some((f) => f.status === "completed")) {
    state = 'completed';
  }

  return {
    activeFollowup,
    state,
    history: items,
    hasOpenFollowup: Boolean(activeFollowup),
  };
}

/**
 * Derives document renewal summary across cumulative windows.
 * Strictly counts current active document versions with non-null expiry dates.
 */
export async function getRenewalsDueSummary(): Promise<RenewalsDueSummary> {
  const supabase = await createClient();
  const todayStr = getKolkataDateString();
  const in7DaysStr = getKolkataFutureDateString(7);
  const in30DaysStr = getKolkataFutureDateString(30);
  const in60DaysStr = getKolkataFutureDateString(60);

  try {
    const [expiredRes, due7Res, due30Res, due60Res] = await Promise.all([
      // Expired: expiry_date < today
      supabase
        .from("customer_documents")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .not("expiry_date", "is", null)
        .lt("expiry_date", todayStr),
      // Due in 7 days: today <= expiry_date <= today + 7d
      supabase
        .from("customer_documents")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .not("expiry_date", "is", null)
        .gte("expiry_date", todayStr)
        .lte("expiry_date", in7DaysStr),
      // Due in 30 days (cumulative): today <= expiry_date <= today + 30d
      supabase
        .from("customer_documents")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .not("expiry_date", "is", null)
        .gte("expiry_date", todayStr)
        .lte("expiry_date", in30DaysStr),
      // Due in 60 days (cumulative): today <= expiry_date <= today + 60d
      supabase
        .from("customer_documents")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .not("expiry_date", "is", null)
        .gte("expiry_date", todayStr)
        .lte("expiry_date", in60DaysStr),
    ]);

    return {
      expired: expiredRes.count || 0,
      due7Days: due7Res.count || 0,
      due30Days: due30Res.count || 0,
      due60Days: due60Res.count || 0,
    };
  } catch (error) {
    console.error("[getRenewalsDueSummary] Error:", error);
    return {
      expired: 0,
      due7Days: 0,
      due30Days: 0,
      due60Days: 0,
    };
  }
}

function mapFollowupRow(row: Record<string, unknown>): ServiceRequestFollowupItem {
  const csRaw = row.customer_services;
  const cs = Array.isArray(csRaw) ? (csRaw[0] as Record<string, unknown> | undefined) : (csRaw as Record<string, unknown> | undefined);
  const custRaw = cs?.customer;
  const cust = Array.isArray(custRaw) ? (custRaw[0] as Record<string, unknown> | undefined) : (custRaw as Record<string, unknown> | undefined);
  const svcRaw = cs?.service;
  const svc = Array.isArray(svcRaw) ? (svcRaw[0] as Record<string, unknown> | undefined) : (svcRaw as Record<string, unknown> | undefined);

  return {
    id: String(row.id),
    customerServiceId: String(row.customer_service_id),
    followUpAt: String(row.follow_up_at),
    note: (row.note as string) || null,
    status: (row.status as "open" | "completed" | "cancelled" | "rescheduled") || "open",
    resolutionNote: (row.resolution_note as string) || null,
    completedAt: (row.completed_at as string) || null,
    supersededBy: (row.superseded_by as string) || null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    state: classifyFollowupState(String(row.follow_up_at), String(row.status)),
    customerService: cs
      ? {
          id: String(cs.id),
          requestNumber: (cs.request_number as string) || null,
          status: String(cs.status),
          customer: cust
            ? {
                id: String(cust.id),
                customerCode: (cust.customer_code as string) || null,
                firstName: String(cust.first_name || ""),
                middleName: (cust.middle_name as string) || null,
                lastName: String(cust.last_name || ""),
                phone: (cust.phone as string) || null,
              }
            : undefined,
          service: svc
            ? {
                id: String(svc.id),
                serviceCode: String(svc.service_code || ""),
                serviceName: String(svc.service_name || ""),
              }
            : undefined,
        }
      : undefined,
  };
}
