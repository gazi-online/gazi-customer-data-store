"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ServiceFormData } from "./schema";
import { CustomerServiceStatus } from "@/types/service";
import { canTransitionServiceRequest } from "@/lib/services/serviceRequestWorkflow";
import {
  attachDocumentToRequest,
  detachDocumentFromRequest,
} from "@/app/(dashboard)/requests/actions";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export async function getServices(searchQuery?: string, statusFilter?: string, categoryFilter?: string) {
  const supabase = await createClient();
  await requireAal2(supabase);
  let query = supabase.from("services").select("*").order("created_at", { ascending: false });

  if (searchQuery) {
    query = query.or(`service_name.ilike.%${searchQuery}%,service_code.ilike.%${searchQuery}%`);
  }

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  if (categoryFilter && categoryFilter !== "all") {
    query = query.eq("category", categoryFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getServiceById(id: string) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase.from("services").select("*").eq("id", id).single();
  
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertService(data: ServiceFormData) {
  const supabase = await createClient();
  await requireAal2(supabase);
  
  if (data.id) {
    const { error } = await supabase.from("services").update({
      service_code: data.service_code,
      service_name: data.service_name,
      category: data.category,
      description: data.description,
      default_price: data.default_price,
      status: data.status,
    }).eq("id", data.id);
    
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("services").insert([{
      service_code: data.service_code,
      service_name: data.service_name,
      category: data.category,
      description: data.description,
      default_price: data.default_price,
      status: data.status,
    }]);
    
    if (error) return { error: error.message };
  }
  
  revalidatePath("/services");
  return { success: true };
}

export async function checkDuplicateServiceCode(code: string, excludeId?: string) {
  const supabase = await createClient();
  await requireAal2(supabase);
  let q = supabase.from("services").select("id").eq("service_code", code);
  
  if (excludeId) {
    q = q.neq("id", excludeId);
  }
  
  const { data } = await q;
  return { hasDuplicate: data && data.length > 0 };
}

export async function getActiveServices() {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase.from("services").select("*").ilike("status", "active").order("service_name", { ascending: true });
  
  if (error) throw new Error(error.message);
  return data;
}

export async function getCustomerServices(customerId: string) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase
    .from("customer_services")
    .select("*, service:services(*)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
    
  if (error) throw new Error(error.message);
  return data;
}
const isValidUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function upsertCustomerService(data: {
  id?: string;
  customer_id: string;
  service_id: string;
  status?: CustomerServiceStatus;
  amount: number;
  payment_status?: 'unpaid' | 'partial' | 'paid' | 'waived';
  service_date: string;
  due_date?: string | null;
  notes?: string | null;
  request_number?: string | null;
  application_reference?: string | null;
  portal_name?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  rejection_reason?: string | null;
  delivered_at?: string | null;
}) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required" };
  }

  // CREATE PATH: server-enforced initial status = 'pending', payment_status = 'unpaid'
  if (!data.id) {
    const payload: Record<string, unknown> = {
      customer_id: data.customer_id,
      service_id: data.service_id,
      status: 'pending', // Server forces initial status, client override is discarded
      amount: data.amount,
      payment_status: 'unpaid', // Initial payment status is strictly unpaid
      service_date: data.service_date,
      due_date: data.due_date || null,
      notes: data.notes || null,
      application_reference: data.application_reference ? data.application_reference.trim() : null,
      portal_name: data.portal_name || null,
      priority: data.priority || 'normal',
      created_by: user.id,
    };

    const { data: inserted, error } = await supabase
      .from("customer_services")
      .insert([payload])
      .select()
      .single();

    if (error) return { error: error.message };

    revalidatePath(`/customers/${data.customer_id}`);
    revalidatePath("/services");
    return { success: true, data: inserted };
  }

  // EDIT PATH: ordinary metadata edits cannot modify status, customer_id, or payment_status
  if (!isValidUuid(data.id)) {
    return { error: "Invalid service request ID format" };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("customer_services")
    .select("id, status, customer_id")
    .eq("id", data.id)
    .single();

  if (fetchErr || !existing) {
    return { error: "Service request not found" };
  }

  if (data.status && data.status !== existing.status) {
    return {
      error: "Status cannot be updated through generic edit. Use transitionServiceRequestStatus() for workflow transitions."
    };
  }

  // customer_id is strictly immutable after insert; payment_status is ledger-derived/waiver only
  const payload: Record<string, unknown> = {
    service_id: data.service_id,
    amount: data.amount,
    service_date: data.service_date,
    due_date: data.due_date || null,
    notes: data.notes || null,
    application_reference: data.application_reference ? data.application_reference.trim() : null,
    portal_name: data.portal_name || null,
    priority: data.priority || 'normal',
  };

  const { error } = await supabase
    .from("customer_services")
    .update(payload)
    .eq("id", data.id);

  if (error) return { error: error.message };

  revalidatePath(`/customers/${existing.customer_id}`);
  revalidatePath("/services");
  return { success: true };
}

export async function setRequestPaymentWaiver(requestId: string, waived: boolean) {
  if (!isValidUuid(requestId)) {
    return { error: "Invalid request ID format" };
  }

  const supabase = await createClient();
  await requireAal2(supabase);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required" };
  }

  const { data: res, error: rpcError } = await supabase.rpc("set_request_payment_waiver", {
    p_request_id: requestId,
    p_waived: waived,
  });

  if (rpcError) {
    console.error("RPC Error in set_request_payment_waiver:", rpcError);
    return { error: rpcError.message };
  }

  if (!res || !res.success) {
    return { error: res?.error || "Failed to update payment waiver." };
  }

  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/services");
  revalidatePath("/dashboard");

  return { success: true, payment_status: res.payment_status };
}

export async function transitionServiceRequestStatus(params: {
  customerServiceId: string;
  toStatus: CustomerServiceStatus;
  applicationReference?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
}) {
  const { customerServiceId, toStatus, applicationReference, rejectionReason, notes } = params;

  if (!isValidUuid(customerServiceId)) {
    return { error: "Invalid request ID format" };
  }

  const supabase = await createClient();
  await requireAal2(supabase);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required" };
  }

  // 1. Fetch current row server-side (never trust client fromStatus)
  const { data: current, error: fetchError } = await supabase
    .from("customer_services")
    .select("id, customer_id, status, application_reference, rejection_reason, notes")
    .eq("id", customerServiceId)
    .single();

  if (fetchError || !current) {
    return { error: "Service request not found" };
  }

  const fromStatus = current.status as CustomerServiceStatus;

  // 2. Early TypeScript FSM validation
  if (!canTransitionServiceRequest(fromStatus, toStatus)) {
    return {
      error: `Cannot transition service request from '${fromStatus}' to '${toStatus}'.`
    };
  }

  // 3. Validation of metadata requirements
  if (toStatus === 'rejected') {
    const trimmedReason = rejectionReason?.trim();
    if (!trimmedReason) {
      return { error: "A non-empty rejection reason is required when rejecting a request." };
    }
  }

  // 4. Build payload with trimmed fields
  const updatePayload: Record<string, unknown> = {
    status: toStatus,
  };

  if (applicationReference !== undefined) {
    updatePayload.application_reference = applicationReference ? applicationReference.trim() : null;
  }
  if (rejectionReason !== undefined) {
    updatePayload.rejection_reason = rejectionReason ? rejectionReason.trim() : null;
  }
  if (notes !== undefined) {
    updatePayload.notes = notes ? notes.trim() : null;
  }

  // 5. Concurrency / Compare-and-Set Protection
  const { data: updated, error: updateError } = await supabase
    .from("customer_services")
    .update(updatePayload)
    .eq("id", customerServiceId)
    .eq("status", fromStatus)
    .select()
    .single();

  if (updateError) {
    return { error: updateError.message };
  }

  if (!updated) {
    return {
      error: "Conflict: Service request status was modified concurrently by another operation. Please refresh."
    };
  }

  revalidatePath(`/customers/${current.customer_id}`);
  revalidatePath("/services");
  revalidatePath("/requests");
  return { success: true, data: updated };
}

export async function getServiceRequestById(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid service request ID format");
  }

  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase
    .from("customer_services")
    .select(`
      *,
      service:services(*),
      customer:customers(id, customer_code, first_name, middle_name, last_name, phone, email, status),
      documents:service_request_documents(
        *,
        document:customer_documents(*)
      ),
      status_history:service_request_status_history(*)
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching service request by ID:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function getServiceRequestDocuments(customerServiceId: string) {
  if (!isValidUuid(customerServiceId)) {
    throw new Error("Invalid request ID format");
  }

  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase
    .from("service_request_documents")
    .select(`
      *,
      document:customer_documents(*)
    `)
    .eq("customer_service_id", customerServiceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching service request documents:", error);
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Attach a document to a service request.
 * Delegates to canonical attachDocumentToRequest implementation.
 */
export async function attachDocumentToServiceRequest(params: {
  customerServiceId: string;
  documentId: string;
  requirementTag?: string;
  notes?: string;
}) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { customerServiceId, documentId, requirementTag, notes } = params;
  const result = await attachDocumentToRequest({
    requestId: customerServiceId,
    documentId,
    requirementTag,
    notes,
  });

  if (!result.success) {
    return { error: result.error };
  }

  return { success: true, data: { id: result.associationId } };
}

/**
 * Detach a document from a service request.
 * Delegates to canonical detachDocumentFromRequest implementation.
 */
export async function detachDocumentFromServiceRequest(
  serviceRequestDocumentId: string,
  customerId?: string
) {
  if (!isValidUuid(serviceRequestDocumentId)) {
    return { error: "Invalid ID format" };
  }

  const supabase = await createClient();
  await requireAal2(supabase);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required" };
  }

  const { data: assoc } = await supabase
    .from("service_request_documents")
    .select("customer_service_id")
    .eq("id", serviceRequestDocumentId)
    .single();

  if (assoc?.customer_service_id) {
    const res = await detachDocumentFromRequest({
      requestId: assoc.customer_service_id,
      associationId: serviceRequestDocumentId,
    });
    if (!res.success) return { error: res.error };
    return { success: true };
  }

  const { error } = await supabase
    .from("service_request_documents")
    .delete()
    .eq("id", serviceRequestDocumentId);

  if (error) return { error: error.message };

  if (customerId) {
    revalidatePath(`/customers/${customerId}`);
  }
  return { success: true };
}
