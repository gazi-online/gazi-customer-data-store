"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  classifyFollowupState,
  FollowupState,
} from "@/lib/operations/dateUtils";
import {
  scheduleFollowup as scheduleRequestFollowup,
  rescheduleFollowup as rescheduleRequestFollowup,
  completeFollowup as completeRequestFollowup,
  cancelFollowup as cancelRequestFollowup,
  FollowupMutationResult,
} from "@/app/(dashboard)/requests/actions";

export interface CustomerFollowupItem {
  id: string;
  customerServiceId: string;
  followUpAt: string;
  note: string | null;
  status: "open" | "completed" | "cancelled" | "rescheduled";
  resolutionNote: string | null;
  completedAt: string | null;
  supersededBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  state: FollowupState;
  serviceName: string;
  requestNumber: string | null;
  serviceStatus: string;
}

export interface CustomerFollowupsSummary {
  followups: CustomerFollowupItem[];
  counts: {
    total: number;
    pending: number;
    overdue: number;
    today: number;
    upcoming: number;
    completed: number;
  };
}

const isValidUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Fetches all follow-ups for a customer across their service requests.
 * Uses existing authoritative public.service_request_followups and RLS policies.
 */
export async function getCustomerFollowups(
  customerId: string
): Promise<CustomerFollowupsSummary> {
  const emptySummary: CustomerFollowupsSummary = {
    followups: [],
    counts: { total: 0, pending: 0, overdue: 0, today: 0, upcoming: 0, completed: 0 },
  };

  if (!isValidUuid(customerId)) {
    return emptySummary;
  }

  const supabase = await createClient();

  // Query service_request_followups through customer_services
  const { data, error } = await supabase
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
        customer_id,
        request_number,
        status,
        service:services (
          id,
          service_name
        )
      )
    `)
    .eq("customer_services.customer_id", customerId)
    .order("follow_up_at", { ascending: true });

  if (error) {
    console.error("[getCustomerFollowups] Error:", error.message);
    return emptySummary;
  }

  interface FollowupQueryRow {
    id: string;
    customer_service_id: string;
    follow_up_at: string;
    note: string | null;
    status: "open" | "completed" | "cancelled" | "rescheduled";
    resolution_note: string | null;
    completed_at: string | null;
    superseded_by: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
    customer_services?: {
      request_number?: string | null;
      status?: string | null;
      service?: {
        service_name?: string | null;
      } | null;
    } | null;
  }

  const items: CustomerFollowupItem[] = ((data || []) as unknown as FollowupQueryRow[]).map((row) => {
    const cs = row.customer_services;
    const srv = cs?.service;
    const state = classifyFollowupState(String(row.follow_up_at), String(row.status));

    return {
      id: String(row.id),
      customerServiceId: String(row.customer_service_id),
      followUpAt: String(row.follow_up_at),
      note: row.note || null,
      status: row.status,
      resolutionNote: row.resolution_note || null,
      completedAt: row.completed_at || null,
      supersededBy: row.superseded_by || null,
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      state,
      serviceName: srv?.service_name || "General Service Request",
      requestNumber: cs?.request_number || null,
      serviceStatus: cs?.status || "pending",
    };
  });

  // Calculate counts deterministically
  let pending = 0;
  let overdue = 0;
  let today = 0;
  let upcoming = 0;
  let completed = 0;

  for (const item of items) {
    if (item.status === "open") {
      pending++;
      if (item.state === "overdue") overdue++;
      else if (item.state === "today") today++;
      else if (item.state === "upcoming" || item.state === "tomorrow") upcoming++;
    } else if (item.status === "completed") {
      completed++;
    }
  }

  return {
    followups: items,
    counts: {
      total: items.length,
      pending,
      overdue,
      today,
      upcoming,
      completed,
    },
  };
}

/**
 * Creates a follow-up for a customer.
 * If targetRequestId is provided, links directly to that request.
 * If targetRequestId is omitted or creates a general reminder, automatically links to
 * or provisions a "Customer Support & Callback" request for the customer under existing RLS.
 */
export async function createCustomerFollowup(params: {
  customerId: string;
  followUpAt: string;
  reason: string;
  notes?: string | null;
  targetRequestId?: string | null;
}): Promise<FollowupMutationResult> {
  const { customerId, followUpAt, reason, notes, targetRequestId } = params;

  if (!isValidUuid(customerId)) {
    return { success: false, error: "Invalid customer ID format.", errorCode: "invalid_input" };
  }

  if (!reason || !reason.trim()) {
    return { success: false, error: "A short reason or title is required.", errorCode: "invalid_input" };
  }

  if (!followUpAt || isNaN(new Date(followUpAt).getTime())) {
    return { success: false, error: "A valid follow-up date and time is required.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    let resolvedRequestId = targetRequestId;

    // If no specific request provided, resolve or create active request container for this customer
    if (!resolvedRequestId) {
      // Find latest non-completed request for this customer
      const { data: existingActive } = await supabase
        .from("customer_services")
        .select("id")
        .eq("customer_id", customerId)
        .not("status", "in", '("completed","cancelled")')
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingActive) {
        resolvedRequestId = existingActive.id;
      } else {
        // Resolve default General Support service from catalog
        let { data: defaultSvc } = await supabase
          .from("services")
          .select("id")
          .ilike("service_name", "%General%")
          .limit(1)
          .maybeSingle();

        if (!defaultSvc) {
          const { data: anySvc } = await supabase
            .from("services")
            .select("id")
            .limit(1)
            .maybeSingle();
          defaultSvc = anySvc;
        }

        if (!defaultSvc) {
          return {
            success: false,
            error: "Service catalog is empty. Please configure at least one service.",
            errorCode: "no_service",
          };
        }

        // Create standard customer service container
        const { data: newCs, error: csErr } = await supabase
          .from("customer_services")
          .insert({
            customer_id: customerId,
            service_id: defaultSvc.id,
            status: "pending",
            amount: 0,
            payment_status: "unpaid",
            service_date: new Date().toISOString().split("T")[0],
            notes: `Auto-created container for follow-up: ${reason.trim()}`,
            priority: "normal",
            created_by: user.id,
          })
          .select("id")
          .single();

        if (csErr || !newCs) {
          console.error("[createCustomerFollowup] csErr:", csErr);
          return {
            success: false,
            error: "Failed to initialize follow-up container.",
            errorCode: "query_failed",
          };
        }

        resolvedRequestId = newCs.id;
      }
    }

    // Combine reason and optional notes cleanly
    const combinedNote = notes && notes.trim()
      ? `${reason.trim()} — ${notes.trim()}`
      : reason.trim();

    // Call authoritative request follow-up scheduler
    const result = await scheduleRequestFollowup({
      requestId: resolvedRequestId!,
      followUpAt,
      note: combinedNote,
    });

    if (result.success) {
      revalidatePath(`/customers/${customerId}`);
      revalidatePath("/operations");
      revalidatePath("/dashboard");
    }

    return result;
  } catch (err: unknown) {
    console.error("[createCustomerFollowup] Unexpected error:", err);
    return {
      success: false,
      error: "An unexpected error occurred while saving follow-up.",
      errorCode: "internal_error",
    };
  }
}

/**
 * Reschedule an existing follow-up.
 */
export async function rescheduleCustomerFollowup(params: {
  followupId: string;
  requestId: string;
  customerId: string;
  newFollowUpAt: string;
  newNote?: string | null;
  resolutionNote?: string | null;
}): Promise<FollowupMutationResult> {
  const result = await rescheduleRequestFollowup({
    followupId: params.followupId,
    requestId: params.requestId,
    newFollowUpAt: params.newFollowUpAt,
    newNote: params.newNote,
    resolutionNote: params.resolutionNote,
  });

  if (result.success) {
    revalidatePath(`/customers/${params.customerId}`);
    revalidatePath("/operations");
    revalidatePath("/dashboard");
  }

  return result;
}

/**
 * Mark a customer follow-up as completed.
 */
export async function completeCustomerFollowup(params: {
  followupId: string;
  requestId: string;
  customerId: string;
  resolutionNote?: string | null;
}): Promise<FollowupMutationResult> {
  const result = await completeRequestFollowup({
    followupId: params.followupId,
    requestId: params.requestId,
    resolutionNote: params.resolutionNote,
  });

  if (result.success) {
    revalidatePath(`/customers/${params.customerId}`);
    revalidatePath("/operations");
    revalidatePath("/dashboard");
  }

  return result;
}

/**
 * Cancel a customer follow-up.
 */
export async function cancelCustomerFollowup(params: {
  followupId: string;
  requestId: string;
  customerId: string;
  resolutionNote?: string | null;
}): Promise<FollowupMutationResult> {
  const result = await cancelRequestFollowup({
    followupId: params.followupId,
    requestId: params.requestId,
    resolutionNote: params.resolutionNote,
  });

  if (result.success) {
    revalidatePath(`/customers/${params.customerId}`);
    revalidatePath("/operations");
    revalidatePath("/dashboard");
  }

  return result;
}
