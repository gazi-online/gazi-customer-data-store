import { createClient } from "@/lib/supabase/server";
import { getMfaAssuranceLevel, listMfaFactors } from "@/lib/auth/mfa";
import { getSafeNextPath } from "@/lib/auth/safeRedirect";
import { redirect } from "next/navigation";
import { MfaChallengeView } from "@/components/auth/MfaChallengeView";

export const dynamic = "force-dynamic";

interface MfaVerifyPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function MfaVerifyPage({ searchParams }: MfaVerifyPageProps) {
  const resolvedSearchParams = await searchParams;
  const safeNext = getSafeNextPath(resolvedSearchParams?.next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // State A: Unauthenticated -> redirect to /login
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(safeNext)}`);
  }

  // State B: Authenticated + Current AAL2 -> no challenge needed -> safe return to destination
  const assurance = await getMfaAssuranceLevel(supabase);
  if (assurance.isAal2) {
    redirect(safeNext);
  }

  // State C & D: Check enrolled factors
  const factorsResult = await listMfaFactors(supabase);

  // State D: Authenticated AAL1 + NO verified factor -> Mandatory enrollment required
  if (!factorsResult.hasVerifiedFactor || factorsResult.verified.length === 0) {
    const enrollDest = safeNext && safeNext !== "/dashboard"
      ? `/settings/security/mfa?next=${encodeURIComponent(safeNext)}`
      : "/settings/security/mfa";
    redirect(enrollDest);
  }

  // State C: Authenticated AAL1 + verified TOTP factor(s) -> show challenge UI with factor selection
  const verifiedFactors = factorsResult.verified;
  const primaryFactor = verifiedFactors[0];

  return (
    <MfaChallengeView
      factorId={primaryFactor.id}
      factorName={primaryFactor.friendlyName || "Authenticator App"}
      factors={verifiedFactors.map((f) => ({
        id: f.id,
        friendlyName: f.friendlyName || "Authenticator App",
        factorType: f.factorType,
        createdAt: f.createdAt,
      }))}
      safeNext={safeNext}
    />
  );
}
