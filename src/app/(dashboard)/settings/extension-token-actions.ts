"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";
import {
  generatePairingToken,
  listPairingTokens,
  revokePairingToken,
  ExtensionTokenPublicInfo,
} from "@/lib/auth/extensionAuth";

interface ActiveMembership {
  business_id: string;
  role: string;
  status: string;
}

async function resolveCallerMembership(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Authentication required.");
  }

  const { data: membership, error: memError } = await supabase
    .from("business_memberships")
    .select("business_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (memError || !membership?.business_id) {
    throw new Error("Access denied: Active business membership required.");
  }

  return { user, membership: membership as unknown as ActiveMembership };
}

export async function createExtensionPairingTokenAction(params: {
  name?: string;
  expiresInDays?: number;
}): Promise<{
  success: boolean;
  plaintextToken?: string;
  record?: ExtensionTokenPublicInfo;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    await requireAal2(supabase);

    const { user, membership } = await resolveCallerMembership(supabase);

    const rawName = params.name ? params.name.trim() : "";
    const name = rawName || "Workstation Extension";
    if (name.length < 2 || name.length > 80) {
      return { success: false, error: "Device or token name must be between 2 and 80 characters." };
    }

    const days = params.expiresInDays && [7, 30, 90].includes(params.expiresInDays)
      ? params.expiresInDays
      : 30;

    const result = await generatePairingToken({
      businessId: membership.business_id,
      userId: user.id,
      name,
      scopes: ["customers:search", "customers:form_fill"],
      expiresInDays: days,
      dbClientOverride: supabase,
    });

    revalidatePath("/settings");

    return {
      success: true,
      plaintextToken: result.plaintextToken,
      record: result.record,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create pairing token.",
    };
  }
}

export async function listExtensionPairingTokensAction(): Promise<{
  success: boolean;
  tokens?: ExtensionTokenPublicInfo[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    await requireAal2(supabase);

    const { membership } = await resolveCallerMembership(supabase);

    const tokens = await listPairingTokens(membership.business_id, supabase);

    return {
      success: true,
      tokens,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to list pairing tokens.",
    };
  }
}

export async function revokeExtensionPairingTokenAction(tokenId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    if (!tokenId || typeof tokenId !== "string") {
      return { success: false, error: "Invalid token ID." };
    }

    const supabase = await createClient();
    await requireAal2(supabase);

    const { membership } = await resolveCallerMembership(supabase);

    await revokePairingToken(tokenId, membership.business_id, supabase);

    revalidatePath("/settings");

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to revoke pairing token.",
    };
  }
}
