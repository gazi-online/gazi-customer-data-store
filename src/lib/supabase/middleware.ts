import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { enforceMfaRoutePolicy } from "@/lib/auth/mfaEnforcement";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          supabaseResponse = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );

          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              supabaseResponse.headers.set(key, value)
            );
          }
        },
      },
    }
  );

  function redirectWithSession(url: URL) {
    const response = NextResponse.redirect(url);

    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });

    supabaseResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") {
        response.headers.set(key, value);
      }
    });

    return response;
  }

  // Centralized mandatory MFA route policy enforcement
  const policyResponse = await enforceMfaRoutePolicy(
    request,
    supabaseResponse,
    supabase,
    redirectWithSession
  );
  if (policyResponse) {
    return policyResponse;
  }

  return supabaseResponse;
}
