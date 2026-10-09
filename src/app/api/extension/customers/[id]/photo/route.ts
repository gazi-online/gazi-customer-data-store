/**
 * Extension Customer Photo API Endpoint
 * File: src/app/api/extension/customers/[id]/photo/route.ts
 *
 * GET /api/extension/customers/{id}/photo
 *
 * Narrowly scoped, authenticated photo retrieval for Electoral Form-Fill workflow.
 * Strictly verifies tenant boundary (business_id) and pairing token authorization.
 * Excludes all unrelated customer PII, documents, and credentials.
 * Provides image metadata, dimensions, and secure short-lived access.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import sharp from 'sharp';
import { validateExtensionAuth } from '@/lib/auth/extensionAuth';
import {
  handleExtensionCorsPreflight,
  jsonResponseWithCors,
  isAllowedExtensionOrigin,
} from '@/lib/auth/extensionCors';
import { getAdminSupabaseClient } from '@/lib/auth/adminMfaReset';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function OPTIONS(req: NextRequest) {
  return handleExtensionCorsPreflight(req);
}

export async function GET(req: NextRequest, context: RouteContext) {
  // 0. Verify origin if present
  const origin = req.headers.get('origin');
  if (origin && !isAllowedExtensionOrigin(origin)) {
    return new NextResponse(
      JSON.stringify({ error: 'Disallowed origin.', code: 'FORBIDDEN_ORIGIN' }),
      { status: 403, headers: { 'Content-Type': 'application/json', Vary: 'Origin' } }
    );
  }

  // 1. Authenticate & authorize token with 'customers:form_fill' scope
  const authRes = await validateExtensionAuth(req, 'customers:form_fill');
  if (!authRes.authorized || !authRes.context) {
    return jsonResponseWithCors(
      {
        error: authRes.error || 'Authentication required.',
        code: authRes.code || 'UNAUTHORIZED',
      },
      { status: authRes.status || 401 },
      req
    );
  }

  const { businessId } = authRes.context;

  // 2. Validate customer UUID parameter
  const { id } = await context.params;
  if (!id || !UUID_REGEX.test(id)) {
    return jsonResponseWithCors(
      {
        error: 'Invalid customer ID format. Must be a valid UUID.',
        code: 'INVALID_CUSTOMER_ID',
      },
      { status: 400 },
      req
    );
  }

  try {
    // 3. Resolve database client (server-side authenticated)
    const adminDb = getAdminSupabaseClient();
    const db = adminDb || (await createServerSupabaseClient());

    // 4. Query customer with minimal projection — strictly tenant isolated
    const { data: customer, error } = await db
      .from('customers')
      .select('id, customer_code, photo_source, photo_url')
      .eq('id', id)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      console.error('[extension-photo-api] Database query error:', error.message);
      return jsonResponseWithCors(
        { error: 'Failed to retrieve customer photo record.', code: 'QUERY_ERROR' },
        { status: 500 },
        req
      );
    }

    if (!customer) {
      return jsonResponseWithCors(
        { error: 'Customer not found.', code: 'CUSTOMER_NOT_FOUND' },
        { status: 404 },
        req
      );
    }

    const photoSource = (customer.photo_source || '').trim();
    const photoUrl = (customer.photo_url || '').trim();

    if (!photoSource && !photoUrl) {
      return jsonResponseWithCors(
        {
          hasPhoto: false,
          photo: null,
          message: 'No customer photograph available in GCDS.',
        },
        { status: 200 },
        req
      );
    }

    // 5. Attempt retrieval from Supabase Storage (canonical customer_photos or legacy customer-profiles)
    if (photoSource) {
      try {
        const isCanonical = photoSource.startsWith('customers/');
        const bucketUsed = isCanonical ? 'customer_photos' : 'customer-profiles';

        let downloadData: Blob | null = null;

        const { data: storageData, error: storageError } = await db.storage
          .from(bucketUsed)
          .download(photoSource);

        if (!storageError && storageData) {
          downloadData = storageData;
        }

        if (downloadData) {
          const arrayBuf = await downloadData.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const sizeBytes = buffer.byteLength;

          // Read image dimensions and metadata safely via sharp
          let width: number | null = null;
          let height: number | null = null;
          let format = 'jpeg';
          try {
            const meta = await sharp(buffer).metadata();
            width = meta.width ?? null;
            height = meta.height ?? null;
            format = meta.format ?? 'jpeg';
          } catch {
            // Non-fatal if sharp parsing is unable to decode dimensions
          }

          const mimeType =
            format === 'png'
              ? 'image/png'
              : format === 'webp'
              ? 'image/webp'
              : 'image/jpeg';
          const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

          // Also generate short-lived signed URL (300 seconds)
          let signedUrl: string | null = null;
          try {
            const { data: signedData } = await db.storage
              .from(bucketUsed)
              .createSignedUrl(photoSource, 300);
            signedUrl = signedData?.signedUrl ?? null;
          } catch {
            // Optional fallback
          }

          return jsonResponseWithCors(
            {
              hasPhoto: true,
              photo: {
                customerId: customer.id,
                customerCode: customer.customer_code,
                fileName: path.basename(photoSource) || 'profile_photo.jpg',
                mimeType,
                format,
                sizeBytes,
                width,
                height,
                dataUrl,
                signedUrl,
                expiresIn: 300,
              },
            },
            { status: 200 },
            req
          );
        }
      } catch (storageErr) {
        console.warn('[extension-photo-api] Storage download warning:', storageErr);
      }
    }

    // 6. Fallback if only photo_url exists (or download was bypassed)
    if (photoUrl) {
      return jsonResponseWithCors(
        {
          hasPhoto: true,
          photo: {
            customerId: customer.id,
            customerCode: customer.customer_code,
            fileName: 'profile_photo.jpg',
            mimeType: 'image/jpeg',
            format: 'jpeg',
            sizeBytes: null,
            width: null,
            height: null,
            dataUrl: photoUrl.startsWith('data:') ? photoUrl : null,
            signedUrl: photoUrl.startsWith('http') ? photoUrl : null,
            expiresIn: 300,
          },
        },
        { status: 200 },
        req
      );
    }

    return jsonResponseWithCors(
      {
        hasPhoto: false,
        photo: null,
        message: 'No readable customer photograph available.',
      },
      { status: 200 },
      req
    );
  } catch (err: any) {
    console.error('[extension-photo-api] Unexpected handler error:', err);
    return jsonResponseWithCors(
      { error: 'Internal server error while resolving customer photo.', code: 'SERVER_ERROR' },
      { status: 500 },
      req
    );
  }
}
