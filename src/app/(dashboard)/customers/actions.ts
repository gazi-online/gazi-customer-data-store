"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CustomerFormData } from "@/types/customer";

export async function getCustomers(searchQuery?: string, statusFilter?: string) {
  const supabase = await createClient();
  let query = supabase.from("customers").select("*").order("created_at", { ascending: false });

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
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
  
  if (error) throw new Error(error.message);
  return data;
}

export async function createCustomer(data: CustomerFormData) {
  const supabase = await createClient();
  
  const { error } = await supabase.from("customers").insert([data]);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomer(id: string, data: CustomerFormData) {
  const supabase = await createClient();
  
  const { error } = await supabase.from("customers").update(data).eq("id", id);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient();
  
  const { error } = await supabase.from("customers").delete().eq("id", id);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/customers");
  return { success: true };
}
