/**
 * Extension Customer Form-Fill API Endpoint
 * File: src/app/api/extension/customers/[id]/form-fill/route.ts
 *
 * GET /api/extension/customers/{id}/form-fill
 *
 * Authoritatively retrieves customer identity and Electoral V3 details for voter form filling.
 * Strictly verifies tenant boundary and customer accessibility (returns 404 for missing/cross-tenant).
 * Strictly excludes Aadhaar, PAN, GST, documents, images, and financial records.
 */

import { NextRequest, NextResponse } from 'next/server';
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

    // 4. Query customer with explicit projection — strictly omitting Aadhaar, PAN, GST, documents
    const initialQuery = await db
      .from('customers')
      .select(`
        id,
        customer_code,
        first_name,
        middle_name,
        last_name,
        original_language_name,
        date_of_birth,
        gender,
        phone,
        email,
        father_name,
        father_first_middle_name,
        father_surname,
        mother_name,
        mother_first_middle_name,
        mother_surname,
        spouse_name,
        spouse_first_middle_name,
        spouse_surname,
        address,
        city,
        post_office,
        pincode,
        district,
        state,
        country,
        voter_id_number,
        assembly_constituency,
        assembly_constituency_number,
        electoral_part_number,
        electoral_serial_number,
        electoral_verification_status,
        electoral_verified_at
      `)
      .eq('id', id)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .maybeSingle();

    let customer: any = initialQuery.data;
    let error: any = initialQuery.error;

    if (error && error.message && error.message.includes('father_first_middle_name')) {
      // Graceful fallback for environments before 20261006221500 migration is applied
      const fallback = await db
        .from('customers')
        .select(`
          id,
          customer_code,
          first_name,
          middle_name,
          last_name,
          original_language_name,
          date_of_birth,
          gender,
          phone,
          email,
          father_name,
          mother_name,
          spouse_name,
          address,
          city,
          post_office,
          pincode,
          district,
          state,
          country,
          voter_id_number,
          assembly_constituency,
          assembly_constituency_number,
          electoral_part_number,
          electoral_serial_number,
          electoral_verification_status,
          electoral_verified_at
        `)
        .eq('id', id)
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .maybeSingle();
      customer = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return jsonResponseWithCors(
        {
          error: 'Database error retrieving customer details.',
          code: 'DATABASE_QUERY_ERROR',
        },
        { status: 500 },
        req
      );
    }

    // 5. Fail closed: return 404 for missing or cross-tenant customers
    // Prevents customer ID enumeration attacks across different shops
    if (!customer) {
      return jsonResponseWithCors(
        {
          error: 'Customer not found or inaccessible.',
          code: 'CUSTOMER_NOT_FOUND',
        },
        { status: 404 },
        req
      );
    }

    // 6. Map to exact Form Fill DTO with verified Electoral V3 columns
    const fullName = [customer.first_name, customer.middle_name, customer.last_name]
      .filter(Boolean)
      .join(' ');

    const formFillDto = {
      customerId: customer.id,
      customerCode: customer.customer_code,

      name: {
        firstName: customer.first_name,
        middleName: customer.middle_name || null,
        lastName: customer.last_name,
        fullName,
        originalLanguageName: customer.original_language_name || null,
      },

      dateOfBirth: customer.date_of_birth || null,
      gender: customer.gender || null,
      mobile: customer.phone,
      email: customer.email || null,

      relative: {
        fatherName: customer.father_name || null,
        fatherFirstMiddleName: (customer as any).father_first_middle_name || null,
        fatherSurname: (customer as any).father_surname || null,

        motherName: customer.mother_name || null,
        motherFirstMiddleName: (customer as any).mother_first_middle_name || null,
        motherSurname: (customer as any).mother_surname || null,

        spouseName: customer.spouse_name || null,
        spouseFirstMiddleName: (customer as any).spouse_first_middle_name || null,
        spouseSurname: (customer as any).spouse_surname || null,
      },

      address: {
        streetAddress: customer.address || '',
        cityTownVillage: customer.city || null,
        postOffice: customer.post_office || null,
        pincode: customer.pincode || null,
        district: customer.district || null,
        state: customer.state || null,
        country: customer.country || 'India',
      },

      epic: customer.voter_id_number || null,

      electoral: {
        assemblyConstituencyName: customer.assembly_constituency || null,
        assemblyConstituencyNumber: customer.assembly_constituency_number || null,
        partNumber: customer.electoral_part_number || null,
        serialNumber: customer.electoral_serial_number || null,
        verificationStatus: customer.electoral_verification_status || 'unverified',
        verifiedAt: customer.electoral_verified_at || null,
      },
    };

    return jsonResponseWithCors(formFillDto, { status: 200 }, req);
  } catch {
    return jsonResponseWithCors(
      {
        error: 'Internal server error processing form-fill request.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
      req
    );
  }
}
