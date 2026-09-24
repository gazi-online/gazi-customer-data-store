"use server";

import { executeAdminMfaReset, AdminMfaResetResult } from "@/lib/auth/adminMfaReset";
import { revalidatePath } from "next/cache";

/**
 * Server Action for privileged Admin MFA Reset.
 * Restricted strictly to active Shop Owners with an active AAL2 session.
 * Re-validates all authorization invariants server-side.
 */
export async function adminResetMfaAction(
  targetUserId: string
): Promise<AdminMfaResetResult> {
  const result = await executeAdminMfaReset(targetUserId);

  if (result.success) {
    revalidatePath("/settings");
  }

  return result;
}
