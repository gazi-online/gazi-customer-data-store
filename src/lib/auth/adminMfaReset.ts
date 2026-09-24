import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { getMfaAssuranceLevel } from "@/lib/auth/mfa";

// Runtime server-only boundary: Prevent privileged module execution in client/browser environments
if (typeof window !== "undefined") {
  throw new Error("Security violation: adminMfaReset must only be executed in a server environment.");
}

export interface AdminMfaResetResult {
  success: boolean;
  message?: string;
  error?: string;
  removedFactorCount?: number;
}

export interface MfaSecurityAuditEvent {
  action: "MFA_ADMIN_RESET" | "MFA_OWN_UNENROLL" | "MFA_LOST_HELP_VIEWED";
  actorUserId: string;
  targetUserId?: string;
  businessId?: string;
  factorId?: string;
  timestamp: string;
}

/**
 * Server-side security audit logger.
 * Strictly NEVER logs:
 * - TOTP secrets, seeds, or URIs
 * - OTP codes
 * - Access tokens or refresh tokens
 * - Passwords
 * - Service role or signing keys
 */
export function logMfaSecurityEvent(event: MfaSecurityAuditEvent): void {
  // Structured JSON audit event without any sensitive credentials or secrets
  const sanitized = {
    action: event.action,
    actor_user_id: event.actorUserId,
    target_user_id: event.targetUserId ?? null,
    business_id: event.businessId ?? null,
    factor_id: event.factorId ?? null,
    timestamp: event.timestamp || new Date().toISOString(),
  };

  // Safe server event emission (database audit schema does not exist; schema migration blocked per spec)
  if (process.env.NODE_ENV !== "test") {
    console.info("[MFA_SECURITY_AUDIT]", JSON.stringify(sanitized));
  }
}

/**
 * Retrieves the server-only admin Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Strictly server-side: never exposed to browser or client bundles.
 * Fails closed if the secret is missing or empty.
 */
export function getAdminSupabaseClient(
  urlOverride?: string,
  serviceKeyOverride?: string
): SupabaseClient | null {
  const url = urlOverride ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = serviceKeyOverride ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || typeof serviceKey !== "string" || serviceKey.length < 20) {
    return null;
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export interface AdminMfaResetOptions {
  actingClient?: SupabaseClient;
  adminClientOverride?: SupabaseClient;
}

/**
 * Executes a privileged Admin MFA Reset for a locked-out staff member.
 * Security invariants:
 * 1. Acting admin must be authenticated.
 * 2. Acting admin must have an active AAL2 session (elevation required).
 * 3. Acting admin must have the 'owner' role in business_memberships (re-resolved server-side).
 * 4. Target user must be an active member in the same business tenant (status === 'active').
 * 5. Acting admin cannot reset their own factor via admin reset (must use self-service with AAL2).
 * 6. Only removes target user's MFA factor(s). Does NOT reset password, change role, or modify data.
 * 7. Fails closed if server-only admin client credentials are unavailable.
 * 8. Partial factor deletions fail closed (never report success if any factor removal fails).
 */
export async function executeAdminMfaReset(
  targetUserId: string,
  options?: AdminMfaResetOptions
): Promise<AdminMfaResetResult> {
  try {
    if (!targetUserId || typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
      return {
        success: false,
        error: "Target user ID is required.",
      };
    }

    const cleanTargetUserId = targetUserId.trim();

    // 1. Resolve acting client
    let userClient = options?.actingClient;
    if (!userClient) {
      const { createClient: createServerClient } = await import("@/lib/supabase/server");
      userClient = await createServerClient();
    }

    // 2. Authenticate acting user
    const {
      data: { user: actingUser },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !actingUser) {
      return {
        success: false,
        error: "Authentication required.",
      };
    }

    // 3. Step-up assurance check: Acting admin MUST have AAL2
    const assurance = await getMfaAssuranceLevel(userClient);
    if (assurance.currentLevel !== "aal2") {
      return {
        success: false,
        error: "Elevated security verification required. You must authenticate with MFA (AAL2) to perform an admin reset.",
      };
    }

    // 4. Re-resolve authoritative role from business_memberships (never trust client claims)
    const { data: membership, error: membershipError } = await userClient
      .from("business_memberships")
      .select("role, status, business_id")
      .eq("user_id", actingUser.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (membershipError || !membership) {
      return {
        success: false,
        error: "Access denied. Active business membership required.",
      };
    }

    if (membership.role !== "owner") {
      return {
        success: false,
        error: "Only shop owners are authorized to perform emergency MFA resets.",
      };
    }

    // 5. Self-reset prevention: Admins must use self-service MFA management
    if (cleanTargetUserId === actingUser.id) {
      return {
        success: false,
        error: "Administrators cannot reset their own MFA through admin reset. Use self-service in Account Security Settings.",
      };
    }

    // 6. Target user tenant and status validation: Target must be active in the same business
    const { data: targetMembership, error: targetError } = await userClient
      .from("business_memberships")
      .select("user_id, business_id, role, status")
      .eq("user_id", cleanTargetUserId)
      .eq("business_id", membership.business_id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (targetError || !targetMembership || targetMembership.status !== "active") {
      return {
        success: false,
        error: "Target user not found, not active, or does not belong to your shop.",
      };
    }

    // 7. Obtain server-only admin Supabase client
    const adminClient = options?.adminClientOverride ?? getAdminSupabaseClient();
    if (!adminClient) {
      return {
        success: false,
        error: "Admin MFA reset service is not configured. Service role credentials required.",
      };
    }

    // 8. Retrieve target user's factors via Supabase Admin API
    const { data: factorsData, error: listError } = await adminClient.auth.admin.mfa.listFactors({
      userId: cleanTargetUserId,
    });

    if (listError || !factorsData) {
      return {
        success: false,
        error: "Failed to inspect target user's MFA factors.",
      };
    }

    const factors = factorsData.factors || [];
    if (factors.length === 0) {
      return {
        success: true,
        message: "Target user does not have any active MFA factors to reset.",
        removedFactorCount: 0,
      };
    }

    // 9. Remove target user's MFA factors with fail-closed error handling
    const totalFactors = factors.length;
    let removedCount = 0;
    let failedCount = 0;

    for (const factor of factors) {
      const { error: deleteError } = await adminClient.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: cleanTargetUserId,
      });

      if (!deleteError) {
        removedCount++;
        logMfaSecurityEvent({
          action: "MFA_ADMIN_RESET",
          actorUserId: actingUser.id,
          targetUserId: cleanTargetUserId,
          businessId: String(membership.business_id),
          factorId: factor.id,
          timestamp: new Date().toISOString(),
        });
      } else {
        failedCount++;
      }
    }

    // Fail closed: Never report full success if any factor deletion failed
    if (failedCount > 0) {
      return {
        success: false,
        error: `MFA reset was incomplete. Failed to remove ${failedCount} of ${totalFactors} factor(s). The administrator must retry or verify the account.`,
        removedFactorCount: removedCount,
      };
    }

    return {
      success: true,
      message: `Successfully reset ${removedCount} MFA factor(s) for the target user. They must sign in again and re-enroll MFA.`,
      removedFactorCount: removedCount,
    };
  } catch {
    return {
      success: false,
      error: "An unexpected error occurred during admin MFA reset.",
    };
  }
}
