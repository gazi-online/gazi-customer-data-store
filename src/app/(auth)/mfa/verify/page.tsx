import { createClient } from "@/lib/supabase/server";
import { getMfaAssuranceLevel, listMfaFactors } from "@/lib/auth/mfa";
import { getSafeNextPath } from "@/lib/auth/safeRedirect";
import { redirect } from "next/navigation";
import { MfaChallengeView } from "@/components/auth/MfaChallengeView";
import Link from "next/link";
import Image from "next/image";
import { ShieldAlert, ArrowRight, ShieldCheck } from "lucide-react";

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

  // State D: Authenticated AAL1 + NO verified factor -> do NOT fabricate a challenge
  if (!factorsResult.hasVerifiedFactor || factorsResult.verified.length === 0) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[420px] bg-white rounded-[22px] border border-slate-200/80 shadow-[0_12px_36px_-6px_rgba(99,102,241,0.09),0_2px_8px_-2px_rgba(0,0,0,0.04)] p-6 sm:p-8 text-center space-y-5">
          <div className="flex flex-col items-center">
            <Image
              src="/branding/gazi-online-logo.jpg"
              alt="Gazi Online"
              width={72}
              height={72}
              priority
              className="w-14 h-14 object-contain rounded-full mb-3"
            />
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-3">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Two-Step Verification Not Set Up
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
              Your account does not have an active authenticator app configured. You can set up two-step verification in settings or continue to the dashboard.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2.5">
            <Link
              href={safeNext}
              className="inline-flex items-center justify-center gap-2 w-full h-11 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-xs"
            >
              <span>Continue to Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/settings/security/mfa"
              className="inline-flex items-center justify-center gap-2 w-full h-11 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs sm:text-sm font-bold rounded-xl transition-colors border border-violet-200/60"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Set Up Authenticator App</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // State C: Authenticated AAL1 + verified TOTP factor -> show challenge UI
  // Deterministic factor selection: pick primary verified factor
  const primaryFactor = factorsResult.verified[0];

  return (
    <MfaChallengeView
      factorId={primaryFactor.id}
      factorName={primaryFactor.friendlyName || "Authenticator App"}
      safeNext={safeNext}
    />
  );
}
