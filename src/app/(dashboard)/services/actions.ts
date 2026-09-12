"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ServiceFormData } from "./schema";
import { ServiceRequestStatus } from "@/types/service";

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
  status: ServiceRequestStatus;
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
  
  // Prepare payload
  const payload: Record<string, unknown> = {
    customer_id: data.customer_id,
    service_id: data.service_id,
    status: data.status,
    amount: data.amount,
    payment_status: data.payment_status,
    service_date: data.service_date,
    due_date: data.due_date || null,
    notes: data.notes || null,
    application_reference: data.application_reference || null,
    portal_name: data.portal_name || null,
    priority: data.priority || 'normal',
    rejection_reason: data.rejection_reason || null,
    delivered_at: data.delivered_at || null,
  };

  if (data.request_number) {
    payload.request_number = data.request_number;
  }

  if (data.status === 'completed') {
    if (!data.id) {
      payload.completed_at = new Date().toISOString();
    } else {
      const { data: existing } = await supabase
        .from("customer_services")
        .select("completed_at")
        .eq("id", data.id)
        .single();
      if (existing && !existing.completed_at) {
        payload.completed_at = new Date().toISOString();
      }
    }
  } else {
    // When status is pending, in_progress, cancelled, or archived, reset completed_at = null
    payload.completed_at = null;
  }

  if (data.id) {
    const { error } = await supabase.from("customer_services").update(payload).eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("customer_services").insert([payload]);
    if (error) return { error: error.message };
  }
  
  revalidatePath(`/customers/${data.customer_id}`);
  return { success: true };
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
