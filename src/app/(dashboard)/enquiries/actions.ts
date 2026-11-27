"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";
import { sendEnquiryWhatsAppNotification } from "@/lib/whatsapp/autoNotify";
import type {
  EnquiryFormCustomerOption,
  EnquiryFormServiceOption,
  EnquiryPriority,
  EnquiryRow,
  EnquirySource,
  EnquiryStatus,
  EnquirySummaryStats,
  EnquiryUpdateRow,
} from "./types";

async function getCallerBusinessMembership(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Authentication required" as const };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_memberships")
    .select("business_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (membershipError || !membership?.business_id) {
    return { error: "Access denied: Active business membership required" as const };
  }

  return { user, businessId: membership.business_id as string };
}

function generateEnquiryNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ENQ-${y}${m}${d}-${rand}`;
}

export async function getEnquiries(filters?: {
  search?: string;
  status?: string;
  followupsDueOnly?: boolean;
}): Promise<{
  enquiries: EnquiryRow[];
  stats: EnquirySummaryStats;
  error?: string;
}> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerBusinessMembership(supabase);
  if ("error" in auth) {
    return {
      enquiries: [],
      stats: { total: 0, open: 0, followUpDue: 0, converted: 0 },
      error: auth.error,
    };
  }

  const { data, error } = await supabase
    .from("customer_enquiries")
    .select(`
      *,
      service:services(service_name)
    `)
    .eq("business_id", auth.businessId)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      enquiries: [],
      stats: { total: 0, open: 0, followUpDue: 0, converted: 0 },
      error: error.message,
    };
  }

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const allRows: EnquiryRow[] = (data || []).map((row: Record<string, unknown>) => {
    const svc = row.service as { service_name?: string } | null;
    return {
      ...(row as unknown as EnquiryRow),
      service_name: svc?.service_name ?? null,
    };
  });

  const stats: EnquirySummaryStats = {
    total: allRows.length,
    open: allRows.filter((r) => !["converted", "closed"].includes(r.status)).length,
    followUpDue: allRows.filter(
      (r) =>
        r.follow_up_at &&
        !["converted", "closed"].includes(r.status) &&
        new Date(r.follow_up_at).getTime() <= endOfToday.getTime()
    ).length,
    converted: allRows.filter((r) => r.status === "converted").length,
  };

  let filtered = allRows;

  if (filters?.status && filters.status !== "all") {
    filtered = filtered.filter((r) => r.status === filters.status);
  }

  if (filters?.followupsDueOnly) {
    filtered = filtered.filter(
      (r) =>
        r.follow_up_at &&
        !["converted", "closed"].includes(r.status) &&
        new Date(r.follow_up_at).getTime() <= endOfToday.getTime()
    );
  }

  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        r.enquiry_number.toLowerCase().includes(q) ||
        (r.service_name || "").toLowerCase().includes(q)
    );
  }

  return { enquiries: filtered, stats };
}

export async function getEnquiryDetails(enquiryId: string): Promise<{
  enquiry: EnquiryRow | null;
  updates: EnquiryUpdateRow[];
  error?: string;
}> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerBusinessMembership(supabase);
  if ("error" in auth) {
    return { enquiry: null, updates: [], error: auth.error };
  }

  const [enqRes, updRes] = await Promise.all([
    supabase
      .from("customer_enquiries")
      .select("*, service:services(service_name)")
      .eq("id", enquiryId)
      .eq("business_id", auth.businessId)
      .single(),
    supabase
      .from("enquiry_updates")
      .select("*")
      .eq("enquiry_id", enquiryId)
      .eq("business_id", auth.businessId)
      .order("created_at", { ascending: false }),
  ]);

  if (enqRes.error || !enqRes.data) {
    return { enquiry: null, updates: [], error: enqRes.error?.message || "Enquiry not found" };
  }

  const svc = (enqRes.data as Record<string, unknown>).service as { service_name?: string } | null;

  return {
    enquiry: {
      ...(enqRes.data as unknown as EnquiryRow),
      service_name: svc?.service_name ?? null,
    },
    updates: (updRes.data || []) as EnquiryUpdateRow[],
  };
}

export async function getEnquiryFormOptions(): Promise<{
  customers: EnquiryFormCustomerOption[];
  services: EnquiryFormServiceOption[];
}> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerBusinessMembership(supabase);
  if ("error" in auth) {
    return { customers: [], services: [] };
  }

  const [custRes, svcRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, first_name, middle_name, last_name, phone, email")
      .eq("business_id", auth.businessId)
      .is("deleted_at", null)
      .order("first_name", { ascending: true })
      .limit(200),
    supabase
      .from("services")
      .select("id, service_name, service_code, default_price")
      .eq("business_id", auth.businessId)
      .eq("status", "active")
      .order("service_name", { ascending: true }),
  ]);

  return {
    customers: (custRes.data || []) as EnquiryFormCustomerOption[],
    services: (svcRes.data || []) as EnquiryFormServiceOption[],
  };
}

export async function createEnquiry(input: {
  customer_id?: string | null;
  customer_name: string;
  phone: string;
  email?: string | null;
  service_id?: string | null;
  subject: string;
  details?: string | null;
  source?: EnquirySource;
  priority?: EnquiryPriority;
  quoted_amount?: number | null;
  follow_up_at?: string | null;
  sendWhatsApp?: boolean;
}): Promise<{ success?: boolean; enquiry?: EnquiryRow; whatsappSent?: boolean; error?: string }> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerBusinessMembership(supabase);
  if ("error" in auth) {
    return { error: auth.error };
  }

  const customerName = input.customer_name?.trim();
  const phone = input.phone?.trim();
  const subject = input.subject?.trim();

  if (!customerName || !phone || !subject) {
    return { error: "Customer name, phone number, and enquiry subject are required." };
  }

  const enquiryNumber = generateEnquiryNumber();
  const initialStatus: EnquiryStatus = input.follow_up_at ? "follow_up" : "new";

  const { data: inserted, error } = await supabase
    .from("customer_enquiries")
    .insert({
      business_id: auth.businessId,
      enquiry_number: enquiryNumber,
      customer_id: input.customer_id || null,
      customer_name: customerName,
      phone,
      email: input.email?.trim() || null,
      service_id: input.service_id || null,
      subject,
      details: input.details?.trim() || null,
      source: input.source || "walk_in",
      status: initialStatus,
      priority: input.priority || "normal",
      quoted_amount:
        typeof input.quoted_amount === "number" && !Number.isNaN(input.quoted_amount)
          ? input.quoted_amount
          : null,
      follow_up_at: input.follow_up_at ? new Date(input.follow_up_at).toISOString() : null,
      last_update_note: input.details?.trim() || "Enquiry registered",
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error || !inserted) {
    return { error: error?.message || "Failed to create enquiry" };
  }

  let whatsappSent = false;
  if (input.sendWhatsApp !== false) {
    whatsappSent = await sendEnquiryWhatsAppNotification({
      customerId: input.customer_id || null,
      customerName,
      phone,
      templateKey: "enquiry_received",
      enquiryNumber,
      subject,
      userId: auth.user.id,
    });
  }

  await supabase.from("enquiry_updates").insert({
    enquiry_id: inserted.id,
    business_id: auth.businessId,
    update_type: "created",
    previous_status: null,
    new_status: initialStatus,
    note: input.details?.trim() || `Enquiry created (${subject})`,
    follow_up_at: inserted.follow_up_at,
    whatsapp_sent: whatsappSent,
    created_by: auth.user.id,
  });

  revalidatePath("/enquiries");
  return { success: true, enquiry: inserted as EnquiryRow, whatsappSent };
}

export async function addEnquiryUpdate(input: {
  enquiry_id: string;
  status: EnquiryStatus;
  note: string;
  follow_up_at?: string | null;
  quoted_amount?: number | null;
  sendWhatsApp?: boolean;
  customWhatsAppMessage?: string;
}): Promise<{ success?: boolean; whatsappSent?: boolean; error?: string }> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerBusinessMembership(supabase);
  if ("error" in auth) {
    return { error: auth.error };
  }

  const note = input.note?.trim();
  if (!note) {
    return { error: "Update note is required." };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("customer_enquiries")
    .select("*")
    .eq("id", input.enquiry_id)
    .eq("business_id", auth.businessId)
    .single();

  if (fetchError || !existing) {
    return { error: "Enquiry not found or access denied." };
  }

  const followUpIso =
    input.follow_up_at === ""
      ? null
      : input.follow_up_at
      ? new Date(input.follow_up_at).toISOString()
      : existing.follow_up_at;

  const { error: updateError } = await supabase
    .from("customer_enquiries")
    .update({
      status: input.status,
      follow_up_at: followUpIso,
      last_update_note: note,
      quoted_amount:
        input.quoted_amount !== undefined
          ? input.quoted_amount
          : existing.quoted_amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.enquiry_id)
    .eq("business_id", auth.businessId);

  if (updateError) {
    return { error: updateError.message };
  }

  let whatsappSent = false;
  if (input.sendWhatsApp) {
    whatsappSent = await sendEnquiryWhatsAppNotification({
      customerId: existing.customer_id,
      customerName: existing.customer_name,
      phone: existing.phone,
      templateKey: "enquiry_update",
      enquiryNumber: existing.enquiry_number,
      subject: existing.subject,
      updateMessage: note,
      customText: input.customWhatsAppMessage,
      userId: auth.user.id,
    });
  }

  const updateType =
    existing.status !== input.status
      ? "status_change"
      : input.follow_up_at
      ? "follow_up"
      : "note";

  await supabase.from("enquiry_updates").insert({
    enquiry_id: existing.id,
    business_id: auth.businessId,
    update_type: updateType,
    previous_status: existing.status,
    new_status: input.status,
    note,
    follow_up_at: followUpIso,
    whatsapp_sent: whatsappSent,
    created_by: auth.user.id,
  });

  revalidatePath("/enquiries");
  return { success: true, whatsappSent };
}

export async function sendEnquiryFollowupWhatsApp(
  enquiryId: string,
  customMessage?: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerBusinessMembership(supabase);
  if ("error" in auth) {
    return { error: auth.error };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("customer_enquiries")
    .select("*")
    .eq("id", enquiryId)
    .eq("business_id", auth.businessId)
    .single();

  if (fetchError || !existing) {
    return { error: "Enquiry not found." };
  }

  const sent = await sendEnquiryWhatsAppNotification({
    customerId: existing.customer_id,
    customerName: existing.customer_name,
    phone: existing.phone,
    templateKey: "enquiry_followup",
    enquiryNumber: existing.enquiry_number,
    subject: existing.subject,
    customText: customMessage,
    userId: auth.user.id,
  });

  if (!sent) {
    return {
      error: "Failed to send WhatsApp message. Check OpenWA connection and phone number.",
    };
  }

  await supabase.from("enquiry_updates").insert({
    enquiry_id: existing.id,
    business_id: auth.businessId,
    update_type: "whatsapp_sent",
    previous_status: existing.status,
    new_status: existing.status,
    note: customMessage?.trim() || "Follow-up reminder sent on WhatsApp",
    follow_up_at: existing.follow_up_at,
    whatsapp_sent: true,
    created_by: auth.user.id,
  });

  revalidatePath("/enquiries");
  return { success: true };
}

export async function convertEnquiryToServiceRequest(
  enquiryId: string
): Promise<{ success?: boolean; customerId?: string; requestId?: string; error?: string }> {
  const supabase = await createClient();
  await requireAal2(supabase);

  const auth = await getCallerBusinessMembership(supabase);
  if ("error" in auth) {
    return { error: auth.error };
  }

  const { data: enquiry, error: fetchError } = await supabase
    .from("customer_enquiries")
    .select("*")
    .eq("id", enquiryId)
    .eq("business_id", auth.businessId)
    .single();

  if (fetchError || !enquiry) {
    return { error: "Enquiry not found." };
  }

  if (enquiry.status === "converted") {
    return { error: "Enquiry is already converted." };
  }

  let customerId: string | null = enquiry.customer_id;

  // 1. Find or create customer if not already linked
  if (!customerId) {
    const cleanPhone = String(enquiry.phone).replace(/\D/g, "").slice(-10);
    if (cleanPhone.length === 10) {
      const { data: foundCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("business_id", auth.businessId)
        .is("deleted_at", null)
        .ilike("phone", `%${cleanPhone}%`)
        .limit(1)
        .maybeSingle();

      if (foundCustomer?.id) {
        customerId = foundCustomer.id;
      }
    }

    if (!customerId) {
      const parts = String(enquiry.customer_name).trim().split(/\s+/);
      const firstName = parts[0] || "Customer";
      const lastName = parts.slice(1).join(" ") || "—";
      const code = `CUST-${Math.floor(100000 + Math.random() * 900000)}`;

      const { data: newCust, error: custErr } = await supabase
        .from("customers")
        .insert({
          business_id: auth.businessId,
          customer_code: code,
          first_name: firstName,
          last_name: lastName,
          phone: enquiry.phone,
          email: enquiry.email || null,
          status: "active",
          created_by: auth.user.id,
        })
        .select("id")
        .single();

      if (custErr || !newCust) {
        return { error: custErr?.message || "Failed to create customer during conversion." };
      }
      customerId = newCust.id;
    }
  }

  // 2. If service_id is set, create a Service Request in customer_services
  let requestId: string | null = null;
  if (enquiry.service_id && customerId) {
    const { data: svc } = await supabase
      .from("services")
      .select("default_price")
      .eq("id", enquiry.service_id)
      .single();

    const amount = enquiry.quoted_amount ?? svc?.default_price ?? 0;
    const today = new Date().toISOString().split("T")[0];

    const { data: newReq, error: reqErr } = await supabase
      .from("customer_services")
      .insert({
        customer_id: customerId,
        service_id: enquiry.service_id,
        status: "pending",
        amount,
        payment_status: "unpaid",
        service_date: today,
        notes: `[From ${enquiry.enquiry_number}] ${enquiry.subject}${
          enquiry.details ? ` — ${enquiry.details}` : ""
        }`,
        priority: enquiry.priority || "normal",
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (reqErr) {
      return { error: reqErr.message };
    }
    requestId = newReq?.id || null;
  }

  // 3. Mark enquiry as converted
  await supabase
    .from("customer_enquiries")
    .update({
      customer_id: customerId,
      converted_request_id: requestId,
      status: "converted",
      last_update_note: requestId
        ? "Converted to customer & service request"
        : "Converted to customer profile",
      updated_at: new Date().toISOString(),
    })
    .eq("id", enquiry.id)
    .eq("business_id", auth.businessId);

  await supabase.from("enquiry_updates").insert({
    enquiry_id: enquiry.id,
    business_id: auth.businessId,
    update_type: "converted",
    previous_status: enquiry.status,
    new_status: "converted",
    note: requestId
      ? "Converted to Customer & Service Request"
      : "Converted to Customer Profile",
    whatsapp_sent: false,
    created_by: auth.user.id,
  });

  revalidatePath("/enquiries");
  revalidatePath("/customers");
  revalidatePath("/requests");

  return { success: true, customerId: customerId || undefined, requestId: requestId || undefined };
}
