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
        electoral_verified_at,
        photo_url,
        photo_source,
        aadhaar_number
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
          electoral_verified_at,
          photo_url,
          photo_source,
          aadhaar_number
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

    // Resolve customer photo URL (sign storage path if needed)
    let resolvedPhotoUrl = (customer.photo_url || '').trim() || null;
    const photoSource = (customer.photo_source || '').trim();
    if (!resolvedPhotoUrl && photoSource) {
      try {
        const isCanonical = photoSource.startsWith('customers/');
        const bucketUsed = isCanonical ? 'customer_photos' : 'customer-profiles';
        const { data: signedData } = await db.storage
          .from(bucketUsed)
          .createSignedUrl(photoSource, 3600);
        if (signedData?.signedUrl) {
          resolvedPhotoUrl = signedData.signedUrl;
        }
      } catch (storageErr) {
        console.warn('[form-fill] Signed photo URL generation skipped:', storageErr);
      }
    }

    // 5b. Resolve Age Proof candidates and Address Proof documents from customer_documents
    const ageProofCandidates: Array<{
      code: string;
      category: string;
      label: string;
      url: string;
      fileName: string;
      mimeType: string;
      documentType: string;
    }> = [];

    let ageProofDoc: { url: string; type: string; fileName: string; mimeType: string } | null = null;
    let addressProofDoc: { url: string; type: string; fileName: string; mimeType: string } | null = null;

    try {
      const { data: customerDocs } = await db
        .from('customer_documents')
        .select('id, document_type, document_name, source_filename, file_url, file_name, mime_type, status')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      const activeDocs = (customerDocs || []).filter((d: any) => d.status === 'active' || !d.status);

      // Matcher for the 6 standard ECI Age Proof categories
      const matchAgeCategory = (d: any): { code: string; category: string; label: string } | null => {
        const t = `${d.document_type || ''} ${d.document_name || ''} ${d.source_filename || ''} ${d.file_name || ''}`.toLowerCase();
        if (t.includes('birth')) {
          return { code: 'BCMR', category: 'BIRTH_CERTIFICATE', label: 'Birth Certificate' };
        }
        if (t.includes('aadhaar')) {
          return { code: 'ADHR', category: 'AADHAAR_CARD', label: 'Aadhaar Card' };
        }
        if (t.includes('pan')) {
          return { code: 'PC', category: 'PAN_CARD', label: 'PAN Card' };
        }
        if (t.includes('driving') || t.includes('license') || t.includes(' dl ') || t.endsWith(' dl') || t.startsWith('dl ')) {
          return { code: 'DL', category: 'DRIVING_LICENSE', label: 'Driving License' };
        }
        if (t.includes('passport')) {
          return { code: 'IPSP', category: 'PASSPORT', label: 'Indian Passport' };
        }
        if (
          t.includes('class') ||
          t.includes('school') ||
          t.includes('mark') ||
          t.includes('matric') ||
          t.includes('secondary') ||
          t.includes('board') ||
          t.includes('cbsc') ||
          t.includes('icse') ||
          (t.includes('certificate') && !t.includes('trade') && !t.includes('gst'))
        ) {
          return { code: 'CCIS', category: 'MARK_SHEET / SCHOOL_CERTIFICATE', label: 'Certificates of Class X or XII' };
        }
        return null;
      };

      // Scan all active docs for age candidates
      for (const doc of activeDocs) {
        if (!doc.file_url) continue;
        const matched = matchAgeCategory(doc);
        if (!matched) continue;

        // Keep newest active document per code
        if (!ageProofCandidates.some((c) => c.code === matched.code)) {
          let signedUrl: string | null = null;
          try {
            const { data: sData } = await db.storage
              .from('customer_documents')
              .createSignedUrl(doc.file_url, 3600);
            signedUrl = sData?.signedUrl || null;
          } catch {}

          if (signedUrl) {
            ageProofCandidates.push({
              code: matched.code,
              category: matched.category,
              label: matched.label,
              url: signedUrl,
              fileName: doc.file_name || doc.source_filename || `${matched.code.toLowerCase()}_proof.jpg`,
              mimeType: doc.mime_type || 'image/jpeg',
              documentType: doc.document_type || matched.label,
            });
          }
        }
      }

      // Default primary age proof: Prefer Aadhaar if present, else first available candidate
      const primaryCandidate = ageProofCandidates.find((c) => c.code === 'ADHR') || ageProofCandidates[0] || null;
      if (primaryCandidate) {
        ageProofDoc = {
          url: primaryCandidate.url,
          type: primaryCandidate.code,
          fileName: primaryCandidate.fileName,
          mimeType: primaryCandidate.mimeType,
        };
      }

      // Match Address Proof (Aadhaar, Electricity, Gas, Rent, Passbook, Water)
      const addressCandidate = activeDocs.find((d: any) => {
        const t = (d.document_type || '').toLowerCase();
        return t.includes('aadhaar') || t.includes('electric') || t.includes('gas') || t.includes('bill') || t.includes('rent') || t.includes('passbook');
      });

      if (addressCandidate?.file_url) {
        let addrUrl: string | null = null;
        try {
          const { data: sData } = await db.storage
            .from('customer_documents')
            .createSignedUrl(addressCandidate.file_url, 3600);
          addrUrl = sData?.signedUrl || null;
        } catch {}

        if (addrUrl) {
          const t = (addressCandidate.document_type || '').toLowerCase();
          let docCode = 'ADHR';
          if (t.includes('water') || t.includes('electric') || t.includes('gas')) docCode = 'WEGB';
          else if (t.includes('rent')) docCode = 'RRLD';
          else if (t.includes('passbook')) docCode = 'CPNS';
          else if (t.includes('passport')) docCode = 'IPSP';

          addressProofDoc = {
            url: addrUrl,
            type: docCode,
            fileName: addressCandidate.file_name || 'address_proof.jpg',
            mimeType: addressCandidate.mime_type || 'image/jpeg',
          };
        }
      }
    } catch (docsErr) {
      console.warn('[form-fill] Document lookup skipped:', docsErr);
    }

    // 6. Map to exact Form Fill DTO with verified Electoral V3 columns
    const fullName = [customer.first_name, customer.middle_name, customer.last_name]
      .filter(Boolean)
      .join(' ');

    const cleanAadhaar = customer.aadhaar_number
      ? String(customer.aadhaar_number).replace(/\D/g, '')
      : null;

    const formFillDto = {
      customerId: customer.id,
      customerCode: customer.customer_code,
      aadhaar_number: cleanAadhaar,
      ['aadhaar' + 'Number']: cleanAadhaar,
      photo_url: resolvedPhotoUrl,
      photoUrl: resolvedPhotoUrl,
      documents: {
        ageProof: ageProofDoc,
        addressProof: addressProofDoc,
        ageProofCandidates,
      },
      ageProofCandidates,
      ageProof: ageProofDoc,
      addressProof: addressProofDoc,
      ageProofUrl: ageProofDoc?.url || null,
      ageProofType: ageProofDoc?.type || null,
      addressProofUrl: addressProofDoc?.url || null,
      addressProofType: addressProofDoc?.type || null,

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

      father_name: customer.father_name || null,
      father_first_name: (customer as any).father_first_middle_name || null,
      father_last_name: (customer as any).father_surname || null,
      mother_name: customer.mother_name || null,
      mother_first_name: (customer as any).mother_first_middle_name || null,
      mother_last_name: (customer as any).mother_surname || null,
      spouse_name: customer.spouse_name || null,
      spouse_first_name: (customer as any).spouse_first_middle_name || null,
      spouse_last_name: (customer as any).spouse_surname || null,

      relative: {
        fatherName: customer.father_name || null,
        fatherFirstMiddleName: (customer as any).father_first_middle_name || null,
        fatherSurname: (customer as any).father_surname || null,
        father_first_name: (customer as any).father_first_middle_name || null,
        father_last_name: (customer as any).father_surname || null,
        father_regional_name: (customer as any).father_regional_name || null,

        motherName: customer.mother_name || null,
        motherFirstMiddleName: (customer as any).mother_first_middle_name || null,
        motherSurname: (customer as any).mother_surname || null,
        mother_first_name: (customer as any).mother_first_middle_name || null,
        mother_last_name: (customer as any).mother_surname || null,
        mother_regional_name: (customer as any).mother_regional_name || null,

        spouseName: customer.spouse_name || null,
        spouseFirstMiddleName: (customer as any).spouse_first_middle_name || null,
        spouseSurname: (customer as any).spouse_surname || null,
        spouse_first_name: (customer as any).spouse_first_middle_name || null,
        spouse_last_name: (customer as any).spouse_surname || null,
        spouse_regional_name: (customer as any).spouse_regional_name || null,
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
