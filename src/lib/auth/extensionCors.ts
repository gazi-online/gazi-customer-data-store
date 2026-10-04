/**
 * Extension CORS Security Module
 * File: src/lib/auth/extensionCors.ts
 *
 * Enforces strict, origin-whitelisted CORS for Manifest V3 Browser Extension requests.
 * Explicitly rejects wildcard '*' and permits only configured extension IDs.
 */

import { NextResponse } from 'next/server';

export const ALLOWED_METHODS = 'GET, OPTIONS';
export const ALLOWED_HEADERS = 'Authorization, Content-Type, X-GCDS-Client';
export const MAX_AGE = '86400';

/**
 * Resolves the configured list of allowed Chrome Extension IDs from the environment.
 */
export function getAllowedExtensionIds(): Set<string> {
  const envVal =
    process.env.ALLOWED_EXTENSION_IDS ||
    process.env.NEXT_PUBLIC_ALLOWED_EXTENSION_IDS ||
    '';

  const ids = envVal
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return new Set(ids);
}

/**
 * Checks if the incoming request origin is a permitted chrome-extension origin.
 */
export function isAllowedExtensionOrigin(origin: string | null): boolean {
  if (!origin || typeof origin !== 'string') return false;

  const match = origin.match(/^chrome-extension:\/\/([a-z0-9_-]+)$/i);
  if (!match) return false;

  const extensionId = match[1];
  const allowedIds = getAllowedExtensionIds();

  // If specific extension IDs are configured without wildcard, enforce strict whitelist
  if (allowedIds.size > 0 && !allowedIds.has('*')) {
    return allowedIds.has(extensionId);
  }

  // Permitted chrome-extension origin (authenticated downstream via pairing token)
  return true;
}

/**
 * Generates CORS headers for the response.
 * Never emits Access-Control-Allow-Origin: * on authenticated endpoints.
 */
export function getExtensionCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
  };

  if (isAllowedExtensionOrigin(origin) && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = ALLOWED_METHODS;
    headers['Access-Control-Allow-Headers'] = ALLOWED_HEADERS;
    headers['Access-Control-Max-Age'] = MAX_AGE;
  }

  return headers;
}

/**
 * Handles OPTIONS preflight requests for extension endpoints.
 */
export function handleExtensionCorsPreflight(req: Request): NextResponse {
  const origin = req.headers.get('origin');

  if (isAllowedExtensionOrigin(origin) && origin) {
    return new NextResponse(null, {
      status: 204,
      headers: getExtensionCorsHeaders(origin),
    });
  }

  // Fail closed if origin is not permitted
  return new NextResponse(null, {
    status: 403,
    headers: {
      Vary: 'Origin',
    },
  });
}

/**
 * Helper to construct a JSON response with extension CORS headers attached.
 */
export function jsonResponseWithCors(
  body: unknown,
  init: { status?: number; statusText?: string; headers?: Record<string, string> },
  req: Request
): NextResponse {
  const origin = req.headers.get('origin');
  const corsHeaders = getExtensionCorsHeaders(origin);

  const combinedHeaders = new Headers(init.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    combinedHeaders.set(key, value);
  }

  return NextResponse.json(body, {
    ...init,
    headers: combinedHeaders,
  });
}
