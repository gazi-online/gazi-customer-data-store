"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CustomerFormData, CustomerListRow, CustomerLookupRow } from "@/types/customer";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export async function getCustomerLookupRows(): Promise<CustomerLookupRow[]> {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_code, first_name, middle_name, last_name, phone")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("first_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as CustomerLookupRow[];
}

export async function getCustomerListRows(searchQuery?: string, statusFilter?: string): Promise<CustomerListRow[]> {
  const supabase = await createClient();
  await requireAal2(supabase);
  let query = supabase
    .from("customers")
    .select("id, customer_code, first_name, middle_name, last_name, phone, email, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (searchQuery) {
    query = query.or(`first_name.ilike.%${searchQuery}%,middle_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`);
  }

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as CustomerListRow[];
}

export async function getCustomers(searchQuery?: string, statusFilter?: string) {
  const supabase = await createClient();
  await requireAal2(supabase);
  let query = supabase
    .from("customers")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (searchQuery) {
    query = query.or(`first_name.ilike.%${searchQuery}%,middle_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`);
  }

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}


export async function getCustomerById(id: string) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
  
  if (error) throw new Error(error.message);
  return data;
}

interface ActiveMembershipInfo {
  business_id: string;
  role: string;
  status: string;
}

/**
 * Resolves the authenticated user and their active business membership.
 * Never trusts client claims — authoritative server-side resolution only.
 */
async function resolveCallerActiveBusiness(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required", user: null, membership: null };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_memberships")
    .select("business_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (membershipError || !membership?.business_id) {
    return {
      error: "Access denied: Active business membership required",
      user,
      membership: null,
    };
  }

  return { error: null, user, membership: membership as unknown as ActiveMembershipInfo };
}

export async function createCustomer(data: CustomerFormData) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { error: authErr, membership } = await resolveCallerActiveBusiness(supabase);
  if (authErr || !membership) {
    return { error: authErr || "Access denied: Active business membership required" };
  }

  // Security check: Client must not choose arbitrary business_id
  const clientBusinessId = data.business_id;
  if (
    typeof clientBusinessId === "string" &&
    clientBusinessId.trim() !== "" &&
    clientBusinessId !== membership.business_id
  ) {
    return { error: "Access denied: Cannot create customer in another business" };
  }
  
  // Sanitize payload: omit empty customer_code so DB trigger assigns next atomic sequence
  const payload: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
  if (!payload.customer_code || (typeof payload.customer_code === "string" && payload.customer_code.trim() === "")) {
    delete payload.customer_code;
  } else if (typeof payload.customer_code === "string") {
    payload.customer_code = payload.customer_code.trim();
  }

  // Authoritatively bind to caller's active business
  payload.business_id = membership.business_id;

  const maxAttempts = 3;
  let lastError: { message?: string } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data: inserted, error } = await supabase
      .from("customers")
      .insert([payload])
      .select("id, customer_code")
      .single();

    if (!error) {
      revalidatePath("/customers");
      return { success: true, customer: inserted };
    }

    lastError = error;

    // Retry ONLY on unique constraint violation specifically for customer_code
    const isCustomerCodeUniqueViolation = 
      error.code === "23505" && 
      (error.message?.includes("customers_customer_code_key") || (error as { details?: string }).details?.includes("customer_code"));

    if (isCustomerCodeUniqueViolation && attempt < maxAttempts) {
      // In case of conflict with a custom/stale code, fallback to atomic DB sequence
      delete payload.customer_code;
      continue;
    }

    // Do NOT mask or retry other unique constraint violations (e.g. phone, aadhaar, pan, email)
    break;
  }

  return { error: lastError?.message || "Failed to create customer" };
}

export async function updateCustomer(id: string, data: CustomerFormData) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { error: callerErr } = await resolveCallerActiveBusiness(supabase);
  if (callerErr) {
    return { error: callerErr };
  }
  
  const payload: Record<string, unknown> = { ...data };
  if (payload.customer_code === "" || payload.customer_code === undefined) {
    delete payload.customer_code;
  } else if (typeof payload.customer_code === "string") {
    payload.customer_code = payload.customer_code.trim();
  }

  // Prevent client from mutating business_id (absolute tenant immutability)
  delete payload.business_id;

  const { error } = await supabase.from("customers").update(payload).eq("id", id);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function softDeleteCustomer(id: string) {
  if (!id) return { error: "Customer ID is required" };
  const supabase = await createClient();
  await requireAal2(supabase);

  const { error: callerErr } = await resolveCallerActiveBusiness(supabase);
  if (callerErr) {
    return { error: callerErr };
  }
  
  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function restoreCustomer(id: string) {
  if (!id) return { error: "Customer ID is required" };
  const supabase = await createClient();
  await requireAal2(supabase);

  const { error: callerErr } = await resolveCallerActiveBusiness(supabase);
  if (callerErr) {
    return { error: callerErr };
  }
  
  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: null })
    .eq("id", id);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function deleteCustomer(id: string) {
  // Safe alias for soft deletion
  return softDeleteCustomer(id);
}

export async function checkDuplicateCustomer(params: {
  aadhaar_number?: string | null;
  pan_number?: string | null;
  phone?: string | null;
  customer_code?: string | null;
  excludeId?: string;
}) {
  const supabase = await createClient();
  await requireAal2(supabase);
  const warnings: string[] = [];

  if (params.phone) {
    let q = supabase.from("customers").select("id, first_name, last_name").eq("phone", params.phone);
    if (params.excludeId) q = q.neq("id", params.excludeId);
    const { data } = await q;
    if (data && data.length > 0) {
      warnings.push(`Phone number (${params.phone}) is already registered under ${data[0].first_name} ${data[0].last_name}.`);
    }
  }

  if (params.aadhaar_number) {
    let q = supabase.from("customers").select("id, first_name, last_name").eq("aadhaar_number", params.aadhaar_number);
    if (params.excludeId) q = q.neq("id", params.excludeId);
    const { data } = await q;
    if (data && data.length > 0) {
      warnings.push(`Aadhaar number (${params.aadhaar_number}) is already registered under ${data[0].first_name} ${data[0].last_name}.`);
    }
  }

  if (params.pan_number) {
    let q = supabase.from("customers").select("id, first_name, last_name").eq("pan_number", params.pan_number);
    if (params.excludeId) q = q.neq("id", params.excludeId);
    const { data } = await q;
    if (data && data.length > 0) {
      warnings.push(`PAN number (${params.pan_number}) is already registered under ${data[0].first_name} ${data[0].last_name}.`);
    }
  }

  if (params.customer_code) {
    let q = supabase.from("customers").select("id, first_name, last_name").eq("customer_code", params.customer_code);
    if (params.excludeId) q = q.neq("id", params.excludeId);
    const { data } = await q;
    if (data && data.length > 0) {
      warnings.push(`Customer Code (${params.customer_code}) is already assigned to ${data[0].first_name} ${data[0].last_name}.`);
    }
  }

  return { hasDuplicates: warnings.length > 0, warnings };
}
