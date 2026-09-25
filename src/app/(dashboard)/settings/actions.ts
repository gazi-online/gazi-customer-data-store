"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export interface BusinessSettingsData {
  id: number;
  business_name: string;
  legal_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  invoice_prefix: string | null;
  default_invoice_terms: string | null;
  invoice_footer: string | null;
  upi_id: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
}

export interface TeamMemberItem {
  userId: string;
  businessId: string;
  role: 'owner' | 'admin' | 'operator';
  status: 'active' | 'suspended';
  email: string | null;
  createdAt: string;
}

export async function getBusinessSettings(): Promise<BusinessSettingsData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_settings")
    .select(`
      id,
      business_name,
      legal_name,
      address_line1,
      address_line2,
      city,
      district,
      state,
      pincode,
      phone,
      email,
      gstin,
      invoice_prefix,
      default_invoice_terms,
      invoice_footer,
      upi_id,
      bank_name,
      bank_account_name,
      bank_account_number,
      bank_ifsc
    `)
    .limit(1)
    .single();

  if (error) {
    console.error("Error fetching business_settings:", error);
    return null;
  }
  return data;
}

export async function updateBusinessSettings(formData: Partial<BusinessSettingsData>) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    throw new Error("Authentication required");
  }

  // Verify caller membership and role (must be owner or admin)
  const { data: membership } = await supabase
    .from("business_memberships")
    .select("role, status")
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Only shop owners or administrators can modify business settings");
  }

  const { error } = await supabase
    .from("business_settings")
    .update({
      business_name: formData.business_name || "Gazi Online",
      legal_name: formData.legal_name || null,
      address_line1: formData.address_line1 || null,
      address_line2: formData.address_line2 || null,
      city: formData.city || null,
      district: formData.district || null,
      state: formData.state || null,
      pincode: formData.pincode || null,
      phone: formData.phone || null,
      email: formData.email || null,
      gstin: formData.gstin || null,
      invoice_prefix: formData.invoice_prefix || "INV",
      default_invoice_terms: formData.default_invoice_terms || null,
      invoice_footer: formData.invoice_footer || null,
      upi_id: formData.upi_id || null,
      bank_name: formData.bank_name || null,
      bank_account_name: formData.bank_account_name || null,
      bank_account_number: formData.bank_account_number || null,
      bank_ifsc: formData.bank_ifsc || null,
      updated_at: new Date().toISOString(),
      updated_by: userData.user.id,
    })
    .eq("id", formData.id || 1);

  if (error) {
    throw new Error(`Failed to update business settings: ${error.message}`);
  }

  revalidatePath("/settings");
  revalidatePath("/invoices");
  return { success: true };
}

export async function getTeamMembers(): Promise<TeamMemberItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_memberships")
    .select(`
      user_id,
      business_id,
      role,
      status,
      created_at
    `);

  if (error) {
    console.error("Error fetching team members:", error);
    return [];
  }

  return (data || []).map((m: Record<string, unknown>) => ({
    userId: String(m.user_id),
    businessId: String(m.business_id),
    role: m.role as 'owner' | 'admin' | 'operator',
    status: m.status as 'active' | 'suspended',
    email: m.user_id ? "Staff Member" : null,
    createdAt: String(m.created_at),
  }));
}
