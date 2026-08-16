"use server";

import { createClient } from "@/lib/supabase/server";

export async function getDashboardStats() {
  const supabase = await createClient();
  
  const { count: totalCustomers } = await supabase
    .from("customers")
    .select("*", { count: 'exact', head: true });

  const { count: activeCustomers } = await supabase
    .from("customers")
    .select("*", { count: 'exact', head: true })
    .eq("status", "active");

  const { count: inactiveCustomers } = await supabase
    .from("customers")
    .select("*", { count: 'exact', head: true })
    .eq("status", "inactive");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: todayEntries } = await supabase
    .from("customers")
    .select("*", { count: 'exact', head: true })
    .gte("created_at", today.toISOString());

  const { count: activeServices } = await supabase
    .from("customer_services")
    .select("*", { count: 'exact', head: true })
    .in("status", ["pending", "in_progress"]);

  return {
    totalCustomers: totalCustomers || 0,
    activeCustomers: activeCustomers || 0,
    inactiveCustomers: inactiveCustomers || 0,
    todayEntries: todayEntries || 0,
    activeServices: activeServices || 0,
  };
}

export async function getRecentCustomers() {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, middle_name, last_name, phone, status, created_at, photo_url")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);
  return data;
}
