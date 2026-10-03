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

const VALID_ELECTORAL_STATUSES = new Set(["unverified", "customer_confirmed", "officially_verified"]);

function sanitizeElectoralFields(
  payload: Record<string, unknown>,
  isCreate: boolean,
  existingStatus?: string,
  existingVerifiedAt?: string | null
): { error?: string } {
  // 1. Sanitize constituency strings
  if ("assembly_constituency" in payload) {
    payload.assembly_constituency = typeof payload.assembly_constituency === "string" && payload.assembly_constituency.trim() !== ""
      ? payload.assembly_constituency.trim()
      : null;
  }
  if ("assembly_constituency_number" in payload) {
    payload.assembly_constituency_number = typeof payload.assembly_constituency_number === "string" && payload.assembly_constituency_number.trim() !== ""
      ? payload.assembly_constituency_number.trim()
      : null;
  }
  if ("electoral_part_number" in payload) {
    payload.electoral_part_number = typeof payload.electoral_part_number === "string" && payload.electoral_part_number.trim() !== ""
      ? payload.electoral_part_number.trim()
      : null;
  }
  if ("electoral_serial_number" in payload) {
    payload.electoral_serial_number = typeof payload.electoral_serial_number === "string" && payload.electoral_serial_number.trim() !== ""
      ? payload.electoral_serial_number.trim()
      : null;
  }
  if ("parliamentary_constituency" in payload) {
    payload.parliamentary_constituency = typeof payload.parliamentary_constituency === "string" && payload.parliamentary_constituency.trim() !== ""
      ? payload.parliamentary_constituency.trim()
      : null;
  }
  if ("parliamentary_constituency_number" in payload) {
    payload.parliamentary_constituency_number = typeof payload.parliamentary_constituency_number === "string" && payload.parliamentary_constituency_number.trim() !== ""
      ? payload.parliamentary_constituency_number.trim()
      : null;
  }

  // 2. Validate electoral_verification_status
  let status = payload.electoral_verification_status as string | undefined;
  if (!status || (typeof status === "string" && status.trim() === "")) {
    status = "unverified";
    payload.electoral_verification_status = "unverified";
  }

  if (typeof status !== "string" || !VALID_ELECTORAL_STATUSES.has(status)) {
    return { error: `Invalid electoral verification status: ${status}` };
  }

  // 3. Official verification requires dedicated verification path
  if (status === "officially_verified") {
    if (isCreate) {
      return { error: "New customer cannot be created directly as officially verified. Official verification requires dedicated verification workflow." };
    } else if (existingStatus !== "officially_verified") {
      return { error: "Transition to officially verified requires dedicated official verification workflow." };
    }
  }

  // 4. Lifecycle consistency rules for electoral_verified_at (authoritative server timestamps)
  if (status === "unverified") {
    payload.electoral_verified_at = null;
  } else if (status === "customer_confirmed") {
    // Preserve existing confirmed timestamp if already customer_confirmed; otherwise stamp current server time
    if (existingStatus === "customer_confirmed" && existingVerifiedAt) {
      payload.electoral_verified_at = existingVerifiedAt;
    } else {
      payload.electoral_verified_at = new Date().toISOString();
    }
  } else if (status === "officially_verified") {
    // Retain existing official verification timestamp; do NOT trust client timestamp
    payload.electoral_verified_at = existingVerifiedAt || new Date().toISOString();
  }

  return {};
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

  // Validate and sanitize electoral details
  const electoralErr = sanitizeElectoralFields(payload, true);
  if (electoralErr.error) {
    return { error: electoralErr.error };
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

  // Retrieve current customer to check existing verification status
  if (payload.electoral_verification_status !== undefined) {
    const { data: currentCust } = await supabase
      .from("customers")
      .select("electoral_verification_status, electoral_verified_at")
      .eq("id", id)
      .single();

    const existingStatus = currentCust?.electoral_verification_status;
    const existingVerifiedAt = currentCust?.electoral_verified_at;
    const electoralErr = sanitizeElectoralFields(payload, false, existingStatus, existingVerifiedAt);
    if (electoralErr.error) {
      return { error: electoralErr.error };
    }
  }

  const { error } = await supabase.from("customers").update(payload).eq("id", id);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function officiallyVerifyCustomerElectoral(
  id: string,
  options?: {
    assembly_constituency?: string;
    assembly_constituency_number?: string;
    parliamentary_constituency?: string;
    parliamentary_constituency_number?: string;
  }
) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { error: callerErr, membership } = await resolveCallerActiveBusiness(supabase);
  if (callerErr || !membership) {
    return { error: callerErr || "Access denied: Active business membership required" };
  }

  const { data: customer, error: fetchErr } = await supabase
    .from("customers")
    .select("id, business_id, assembly_constituency, parliamentary_constituency")
    .eq("id", id)
    .single();

  if (fetchErr || !customer) {
    return { error: fetchErr?.message || "Customer not found" };
  }

  if (customer.business_id !== membership.business_id) {
    return { error: "Access denied: Customer does not belong to active business" };
  }

  const serverVerifiedAt = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    electoral_verification_status: "officially_verified",
    electoral_verified_at: serverVerifiedAt,
  };

  if (options?.assembly_constituency !== undefined) {
    updatePayload.assembly_constituency = options.assembly_constituency.trim() || null;
  }
  if (options?.assembly_constituency_number !== undefined) {
    updatePayload.assembly_constituency_number = options.assembly_constituency_number.trim() || null;
  }
  if (options?.parliamentary_constituency !== undefined) {
    updatePayload.parliamentary_constituency = options.parliamentary_constituency.trim() || null;
  }
  if (options?.parliamentary_constituency_number !== undefined) {
    updatePayload.parliamentary_constituency_number = options.parliamentary_constituency_number.trim() || null;
  }

  const { error: updateErr } = await supabase
    .from("customers")
    .update(updatePayload)
    .eq("id", id)
    .eq("business_id", membership.business_id);

  if (updateErr) {
    return { error: updateErr.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true, verified_at: serverVerifiedAt };
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
