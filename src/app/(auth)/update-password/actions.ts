"use server";

import { createClient } from "@/lib/supabase/server";
import {
  hasRecoveryAuthorization,
  clearRecoveryAuthorization,
} from "@/lib/auth/recoverySession";

export interface UpdatePasswordActionResult {
  success: boolean;
  error?: string;
}

/**
 * Server Action to update the user's password following a validated recovery link.
 * Strictly requires BOTH an active authenticated session AND explicit recovery
 * authorization provenance (HttpOnly recovery marker).
 * Clears the recovery marker and signs out the recovery session on success
 * to enforce a fresh authentication cycle.
 * Does NOT remove or alter any enrolled MFA factors.
 */
export async function updatePasswordAction(
  formData: FormData
): Promise<UpdatePasswordActionResult> {
  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    return {
      success: false,
      error: "New password and password confirmation are required.",
    };
  }

  if (!newPassword || newPassword.length < 6) {
    return {
      success: false,
      error: "Password must be at least 6 characters.",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      success: false,
      error: "Passwords do not match.",
    };
  }

  try {
    // 1. Enforce explicit recovery authorization provenance
    const isRecoveryAuthorized = await hasRecoveryAuthorization();
    if (!isRecoveryAuthorized) {
      return {
        success: false,
        error: "Password reset requires an active recovery session. Please request a new recovery link.",
      };
    }

    const supabase = await createClient();

    // 2. Enforce active user session
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Your recovery link has expired or is invalid. Please request a new recovery link.",
      };
    }

    // 3. Update password via Supabase Auth
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      const msg = updateError.message.toLowerCase();
      if (msg.includes("same as") || msg.includes("different")) {
        return {
          success: false,
          error: "Please choose a different password than your previous one.",
        };
      }
      return {
        success: false,
        error: "Failed to update password. Please try again or request a new recovery link.",
      };
    }

    // 4. Consume/clear recovery marker
    await clearRecoveryAuthorization();

    // 5. Terminate recovery session to require fresh login
    await supabase.auth.signOut();

    return {
      success: true,
    };
  } catch {
    return {
      success: false,
      error: "An unexpected error occurred while updating your password.",
    };
  }
}
