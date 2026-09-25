"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMfaAssuranceLevel, listMfaFactors } from "@/lib/auth/mfa";
import { getSafeNextPath } from "@/lib/auth/safeRedirect";
import { determinePostAuthRedirect } from "@/lib/auth/mfaEnforcement";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const nextParam = formData.get("next") as string | null;
  const safeNext = getSafeNextPath(nextParam || "/dashboard");
  
  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Authoritatively resolve post-password MFA state
  const [assurance, factorsResult] = await Promise.all([
    getMfaAssuranceLevel(supabase),
    listMfaFactors(supabase),
  ]);

  const targetPath = determinePostAuthRedirect({
    isAal2: assurance.isAal2,
    hasVerifiedFactor: factorsResult.hasVerifiedFactor && factorsResult.verified.length > 0,
    safeNext,
  });

  revalidatePath("/", "layout");
  redirect(targetPath);
}
