"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ServiceFormData } from "./schema";
import { CustomerServiceStatus } from "@/types/service";
import { canTransitionServiceRequest } from "@/lib/services/serviceRequestWorkflow";

export async function getServices(searchQuery?: string, statusFilter?: string, categoryFilter?: string) {
  const supabase = await createClient();
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
  const { data, error } = await supabase.from("services").select("*").eq("id", id).single();
  
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertService(data: ServiceFormData) {
  const supabase = await createClient();
  
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
  let q = supabase.from("services").select("id").eq("service_code", code);
  
  if (excludeId) {
    q = q.neq("id", excludeId);
  }
  
  const { data } = await q;
  return { hasDuplicate: data && data.length > 0 };
}

export async function getActiveServices() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").select("*").ilike("status", "active").order("service_name", { ascending: true });
  
  if (error) throw new Error(error.message);
  return data;
}

export async function getCustomerServices(customerId: string) {
  const supabase = await createClient();
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
  payment_status: 'unpaid' | 'partial' | 'paid' | 'waived';
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
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required" };
  }

  // CREATE PATH: server-enforced initial status = 'pending'
  if (!data.id) {
    const payload: Record<string, unknown> = {
      customer_id: data.customer_id,
      service_id: data.service_id,
      status: 'pending', // Server forces initial status, client override is discarded
      amount: data.amount,
      payment_status: data.payment_status,
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

  // EDIT PATH: ordinary metadata edits cannot modify status or lifecycle fields
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

  const payload: Record<string, unknown> = {
    customer_id: data.customer_id,
    service_id: data.service_id,
    amount: data.amount,
    payment_status: data.payment_status,
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

  revalidatePath(`/customers/${data.customer_id}`);
  revalidatePath("/services");
  return { success: true };
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

export async function attachDocumentToServiceRequest(params: {
  customerServiceId: string;
  documentId: string;
  requirementTag?: string;
  notes?: string;
}) {
  const { customerServiceId, documentId, requirementTag = 'general', notes } = params;
  if (!isValidUuid(customerServiceId) || !isValidUuid(documentId)) {
    return { error: "Invalid ID format" };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required" };
  }

  // Pre-validate ownership consistency: document customer MUST match request customer
  const [csRes, docRes] = await Promise.all([
    supabase.from("customer_services").select("id, customer_id").eq("id", customerServiceId).single(),
    supabase.from("customer_documents").select("id, customer_id, status, archived_at").eq("id", documentId).single()
  ]);

  if (csRes.error || !csRes.data) {
    return { error: "Service request not found" };
  }
  if (docRes.error || !docRes.data) {
    return { error: "Document not found" };
  }
  if (docRes.data.status === 'archived' || docRes.data.archived_at) {
    return { error: "Cannot attach an archived document to a service request" };
  }

  if (csRes.data.customer_id !== docRes.data.customer_id) {
    return { error: "Customer integrity mismatch: document does not belong to this service request's customer" };
  }

  const { data, error } = await supabase
    .from("service_request_documents")
    .insert([{
      customer_service_id: customerServiceId,
      document_id: documentId,
      requirement_tag: requirementTag.trim(),
      notes: notes?.trim() || null,
      created_by: user.id
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: "This document is already attached under this requirement tag" };
    }
    return { error: error.message };
  }

  revalidatePath(`/customers/${csRes.data.customer_id}`);
  return { success: true, data };
}

export async function detachDocumentFromServiceRequest(serviceRequestDocumentId: string, customerId?: string) {
  if (!isValidUuid(serviceRequestDocumentId)) {
    return { error: "Invalid ID format" };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required" };
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
