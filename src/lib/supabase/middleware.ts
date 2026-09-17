import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const claims = claimsError ? null : claimsData?.claims;
  const isAuthenticated = Boolean(claims);

  const pathname = request.nextUrl.pathname;

  const protectedRoutes = [
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
  ];

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  const isAuthRoute = pathname.startsWith("/login");

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

  if (!isAuthenticated && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithSession(url);
  }

  if (isAuthenticated && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return redirectWithSession(url);
  }

  // Redirect root to dashboard if logged in, otherwise login
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = isAuthenticated ? "/dashboard" : "/login";
    return redirectWithSession(url);
  }

  return supabaseResponse;
}
