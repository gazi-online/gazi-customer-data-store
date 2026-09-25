import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeNextPath } from "@/lib/auth/safeRedirect";
import { getMfaAssuranceLevel, listMfaFactors } from "@/lib/auth/mfa";
import { determinePostAuthRedirect } from "@/lib/auth/mfaEnforcement";

/**
 * Standard Supabase Auth Callback Route Handler.
 * Strictly used for standard OAuth and non-reset sign-in flows.
 * Explicitly DOES NOT grant special session provenance.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const safeNext = getSafeNextPath(nextParam || "/dashboard");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const [assurance, factorsResult] = await Promise.all([
        getMfaAssuranceLevel(supabase),
        listMfaFactors(supabase),
      ]);

      const targetPath = determinePostAuthRedirect({
        isAal2: assurance.isAal2,
        hasVerifiedFactor: factorsResult.hasVerifiedFactor && factorsResult.verified.length > 0,
        safeNext,
      });

      return NextResponse.redirect(new URL(targetPath, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback_failed", origin));
}
