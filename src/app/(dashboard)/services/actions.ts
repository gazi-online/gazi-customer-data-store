"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ServiceFormData } from "./schema";

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

export async function upsertCustomerService(data: any) {
  const supabase = await createClient();
  
  // Prepare payload
  const payload: any = {
    customer_id: data.customer_id,
    service_id: data.service_id,
    status: data.status,
    amount: data.amount,
    payment_status: data.payment_status,
    service_date: data.service_date,
    due_date: data.due_date || null,
    notes: data.notes || null,
  };

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
    // When status is pending, in_progress, or cancelled, reset completed_at = null
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
