import type { SupabaseClient, User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import {
  getMfaAssuranceLevel,
  listMfaFactors,
  type MfaAssuranceLevel,
  type MfaAssuranceState,
  type MfaFactorSummary,
} from "@/lib/auth/mfa";
import { getSafeNextPath } from "@/lib/auth/safeRedirect";

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

export const MFA_VERIFY_PATH = "/mfa/verify";
export const MFA_ENROLLMENT_PATH = "/settings/security/mfa";
export const LOGIN_PATH = "/login";
export const DASHBOARD_PATH = "/dashboard";

export const PUBLIC_AUTH_ROUTES = [
  LOGIN_PATH,
  "/logout",
  "/forgot-password",
  "/update-password",
  "/auth/confirm",
  "/auth/callback",
  "/api/bengali-suggestions",
] as const;

export const PROTECTED_APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/operations",
  "/communications",
  "/requests",
  "/customers",
  "/invoices",
  "/payments",
  "/documents",
  "/services",
  "/reports",
  "/settings",
  "/api/dashboard",
] as const;

// ============================================================================
// ROUTE CLASSIFICATION HELPERS
// ============================================================================

export function isMfaVerifyRoute(pathname: string): boolean {
  return pathname === MFA_VERIFY_PATH || pathname.startsWith(`${MFA_VERIFY_PATH}/`);
}

export function isMfaEnrollmentRoute(pathname: string): boolean {
  return pathname === MFA_ENROLLMENT_PATH || pathname.startsWith(`${MFA_ENROLLMENT_PATH}/`);
}

export function isPublicOrAuthRoute(pathname: string): boolean {
  return PUBLIC_AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function isProtectedAppRoute(pathname: string): boolean {
  // MFA enrollment route is an explicit exception inside /settings
  if (isMfaEnrollmentRoute(pathname)) {
    return false;
  }
  return PROTECTED_APP_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// ============================================================================
// STATE MACHINE & ROUTE ACCESS EVALUATOR
// ============================================================================

export interface RouteAuthState {
  isAuthenticated: boolean;
  isAal2: boolean;
  hasVerifiedFactor: boolean;
  safeNext?: string;
}

export interface RouteAccessEvaluation {
  allowed: boolean;
  redirectPath?: string;
  reason: string;
}

/**
 * Pure, deterministic route access evaluator.
 * Implements the 4-state security model for GCDS:
 *   STATE A: Unauthenticated -> /login
 *   STATE B: Authenticated AAL1 + NO verified factor -> /settings/security/mfa (mandatory enrollment)
 *   STATE C: Authenticated AAL1 + verified factor -> /mfa/verify (mandatory challenge)
 *   STATE D: Authenticated AAL2 -> protected application
 *
 * Guarantees zero redirect loops across all states and routes.
 */
export function evaluateRouteAccess(
  pathname: string,
  state: RouteAuthState
): RouteAccessEvaluation {
  const cleanPath = pathname.split("?")[0];
  const safeNext = getSafeNextPath(state.safeNext || pathname);

  // --------------------------------------------------------------------------
  // STATE A: Unauthenticated
  // --------------------------------------------------------------------------
  if (!state.isAuthenticated) {
    if (isProtectedAppRoute(cleanPath) || isMfaVerifyRoute(cleanPath) || isMfaEnrollmentRoute(cleanPath) || cleanPath === "/") {
      const query = safeNext && safeNext !== DASHBOARD_PATH ? `?next=${encodeURIComponent(safeNext)}` : "";
      return {
        allowed: false,
        redirectPath: `${LOGIN_PATH}${query}`,
        reason: "Unauthenticated request to protected route requires login.",
      };
    }
    return {
      allowed: true,
      reason: "Public or authentication route accessible without session.",
    };
  }

  // --------------------------------------------------------------------------
  // STATE D: Authenticated AAL2 (Highest Assurance)
  // Must have at least one active verified factor. Stale AAL2 with zero factors blocked.
  // --------------------------------------------------------------------------
  if (state.isAal2 && state.hasVerifiedFactor) {
    if (cleanPath === LOGIN_PATH || cleanPath === "/") {
      return {
        allowed: false,
        redirectPath: DASHBOARD_PATH,
        reason: "AAL2 user accessing login/root redirected to dashboard.",
      };
    }
    if (isMfaVerifyRoute(cleanPath)) {
      return {
        allowed: false,
        redirectPath: safeNext && safeNext !== MFA_VERIFY_PATH ? safeNext : DASHBOARD_PATH,
        reason: "AAL2 user already satisfied MFA; redirected to destination.",
      };
    }
    return {
      allowed: true,
      reason: "AAL2 user granted access to protected application route.",
    };
  }

  // --------------------------------------------------------------------------
  // STATE C: Authenticated AAL1 + Verified Factor Exists (Challenge Required)
  // --------------------------------------------------------------------------
  if (state.hasVerifiedFactor) {
    if (isMfaVerifyRoute(cleanPath)) {
      return {
        allowed: true,
        reason: "AAL1 user with verified factor allowed on challenge screen.",
      };
    }
    // Allow recovery, confirm, callback, and signout routes
    if (
      cleanPath === "/logout" ||
      cleanPath === "/update-password" ||
      cleanPath === "/auth/confirm" ||
      cleanPath === "/auth/callback" ||
      cleanPath === "/forgot-password"
    ) {
      return {
        allowed: true,
        reason: "Auth/recovery workflow route accessible during AAL1.",
      };
    }
    // All other routes (protected app, root, login, settings, enrollment) must challenge
    const query = safeNext && safeNext !== DASHBOARD_PATH && safeNext !== MFA_VERIFY_PATH
      ? `?next=${encodeURIComponent(safeNext)}`
      : "";
    return {
      allowed: false,
      redirectPath: `${MFA_VERIFY_PATH}${query}`,
      reason: "AAL1 user with verified factor must complete MFA challenge.",
    };
  }

  // --------------------------------------------------------------------------
  // STATE B: Authenticated AAL1 + NO Verified Factor (Enrollment Required)
  // --------------------------------------------------------------------------
  if (isMfaEnrollmentRoute(cleanPath)) {
    return {
      allowed: true,
      reason: "AAL1 user without verified factor allowed on mandatory enrollment route.",
    };
  }
  // Allow recovery, confirm, callback, and signout routes
  if (
    cleanPath === "/logout" ||
    cleanPath === "/update-password" ||
    cleanPath === "/auth/confirm" ||
    cleanPath === "/auth/callback" ||
    cleanPath === "/forgot-password"
  ) {
    return {
      allowed: true,
      reason: "Auth/recovery workflow route accessible during AAL1.",
    };
  }
  // All other routes (protected app, root, login, mfa verify) must enroll
  const query = safeNext && safeNext !== DASHBOARD_PATH && safeNext !== MFA_ENROLLMENT_PATH && safeNext !== MFA_VERIFY_PATH
    ? `?next=${encodeURIComponent(safeNext)}`
    : "";
  return {
    allowed: false,
    redirectPath: `${MFA_ENROLLMENT_PATH}${query}`,
    reason: "Authenticated user with no verified factor must complete mandatory MFA enrollment.",
  };
}

// ============================================================================
// POST-AUTHENTICATION REDIRECT RESOLVER
// ============================================================================

export interface DeterminePostAuthRedirectParams {
  isAal2: boolean;
  hasVerifiedFactor: boolean;
  safeNext?: string | null;
}

/**
 * Determines the authoritative post-login / post-callback redirect path.
 * Guarantees password alone NEVER directly accesses protected dashboard.
 */
export function determinePostAuthRedirect(params: DeterminePostAuthRedirectParams): string {
  const safeNext = getSafeNextPath(params.safeNext);

  if (params.isAal2 && params.hasVerifiedFactor) {
    return safeNext;
  }

  if (params.hasVerifiedFactor) {
    return safeNext && safeNext !== DASHBOARD_PATH
      ? `${MFA_VERIFY_PATH}?next=${encodeURIComponent(safeNext)}`
      : MFA_VERIFY_PATH;
  }

  return safeNext && safeNext !== DASHBOARD_PATH && safeNext !== MFA_ENROLLMENT_PATH && safeNext !== MFA_VERIFY_PATH
    ? `${MFA_ENROLLMENT_PATH}?next=${encodeURIComponent(safeNext)}`
    : MFA_ENROLLMENT_PATH;
}

// ============================================================================
// SERVER-SIDE AAL2 AUTHORIZATION GUARD
// ============================================================================

export interface Aal2GuardResult {
  user: User;
  assurance: MfaAssuranceState;
}

/**
 * Authoritative server-side AAL2 assurance guard.
 * Fails closed if:
 *   - No active session / unauthenticated
 *   - Current session assurance level is not 'aal2'
 * Never relies on client headers, cookies/storage, query params, or React state.
 */
export async function requireAal2(supabaseClient?: SupabaseClient): Promise<Aal2GuardResult> {
  let supabase = supabaseClient;
  if (!supabase) {
    const { createClient } = await import("@/lib/supabase/server");
    supabase = await createClient();
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Authentication required.");
  }

  const assurance = await getMfaAssuranceLevel(supabase);

  if (!assurance.isAal2) {
    throw new Error("AAL2 assurance required. Mandatory MFA verification is active.");
  }

  const factors = await listMfaFactors(supabase);
  if (!factors.hasVerifiedFactor || factors.verified.length === 0) {
    throw new Error("AAL2 assurance required. Active verified factor required.");
  }

  return { user, assurance };
}

/**
 * Non-throwing helper to check authoritative AAL2 status server-side.
 */
export async function isAal2Authoritative(supabase: SupabaseClient): Promise<boolean> {
  try {
    const assurance = await getMfaAssuranceLevel(supabase);
    if (!assurance.isAal2) return false;
    const factors = await listMfaFactors(supabase);
    return factors.hasVerifiedFactor && factors.verified.length > 0;
  } catch {
    return false;
  }
}

export interface AuthoritativeMfaState {
  user: User | null;
  isAuthenticated: boolean;
  currentLevel: MfaAssuranceLevel | null;
  isAal2: boolean;
  hasVerifiedFactor: boolean;
  verifiedFactors: MfaFactorSummary[];
}

/**
 * Loads authoritative MFA and user state directly from Supabase Auth.
 */
export async function resolveAuthoritativeMfaState(supabase: SupabaseClient): Promise<AuthoritativeMfaState> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        user: null,
        isAuthenticated: false,
        currentLevel: null,
        isAal2: false,
        hasVerifiedFactor: false,
        verifiedFactors: [],
      };
    }

    const [assurance, factorsResult] = await Promise.all([
      getMfaAssuranceLevel(supabase),
      listMfaFactors(supabase),
    ]);

    const hasVerifiedFactor = factorsResult.hasVerifiedFactor && factorsResult.verified.length > 0;
    const isAal2 = assurance.isAal2 && hasVerifiedFactor;

    return {
      user,
      isAuthenticated: true,
      currentLevel: assurance.currentLevel,
      isAal2,
      hasVerifiedFactor,
      verifiedFactors: factorsResult.verified,
    };
  } catch {
    return {
      user: null,
      isAuthenticated: false,
      currentLevel: null,
      isAal2: false,
      hasVerifiedFactor: false,
      verifiedFactors: [],
    };
  }
}

// ============================================================================
// MIDDLEWARE ENFORCEMENT HOOK
// ============================================================================

/**
 * Enforces centralized MFA route access policy within Next.js middleware.
 * Returns a redirect NextResponse if access is denied, or null if allowed.
 */
export async function enforceMfaRoutePolicy(
  request: NextRequest,
  supabaseResponse: NextResponse,
  supabase: SupabaseClient,
  redirectWithSession: (url: URL) => NextResponse
): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;

  // 1. Resolve user session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = Boolean(user);

  // 2. Unauthenticated branch
  if (!isAuthenticated) {
    const evalResult = evaluateRouteAccess(pathname, {
      isAuthenticated: false,
      isAal2: false,
      hasVerifiedFactor: false,
    });

    if (!evalResult.allowed && evalResult.redirectPath) {
      const url = request.nextUrl.clone();
      const safeNext = getSafeNextPath(pathname + request.nextUrl.search);
      url.pathname = LOGIN_PATH;
      if (safeNext && safeNext !== DASHBOARD_PATH) {
        url.search = `?next=${encodeURIComponent(safeNext)}`;
      } else {
        url.search = "";
      }
      return redirectWithSession(url);
    }
    return null;
  }

  // 3. Authenticated branch -> query authoritative assurance and verified factors
  const [assurance, factorsResult] = await Promise.all([
    getMfaAssuranceLevel(supabase),
    listMfaFactors(supabase),
  ]);

  const isAal2 = assurance.isAal2;
  const hasVerifiedFactor = factorsResult.hasVerifiedFactor && factorsResult.verified.length > 0;

  const evalResult = evaluateRouteAccess(pathname, {
    isAuthenticated: true,
    isAal2,
    hasVerifiedFactor,
    safeNext: pathname + request.nextUrl.search,
  });

  if (!evalResult.allowed && evalResult.redirectPath) {
    const url = request.nextUrl.clone();
    if (evalResult.redirectPath.includes("?")) {
      const [basePath, queryString] = evalResult.redirectPath.split("?");
      url.pathname = basePath;
      url.search = queryString ? `?${queryString}` : "";
    } else {
      url.pathname = evalResult.redirectPath;
      url.search = "";
    }
    return redirectWithSession(url);
  }

  return null;
}
