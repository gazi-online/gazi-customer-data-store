import { NextRequest, NextResponse } from "next/server";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";
import { createClient } from "@/lib/supabase/server";
import {
  serializeFormFillCustomer,
  type FormFillCustomerRecord,
} from "@/lib/extension/formFillCustomer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
// Keep this allow-list aligned with FormFillCustomerDTO, never use select("*").
const CUSTOMER_FIELDS =
  "id, customer_code, first_name, middle_name, last_name, date_of_birth, gender, phone, email, voter_id_number, address, city, post_office, district, state, pincode, father_name, mother_name, spouse_name";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
) {
  // This marker is not authentication; the Supabase session, AAL2, and RLS
  // remain the authoritative access controls.
  if (request.headers.get("x-gcds-extension") !== "1") {
    return jsonResponse({ error: "Extension request required." }, 403);
  }

  if (request.nextUrl.searchParams.get("scope") !== "voter") {
    return jsonResponse({ error: "Unsupported form-fill scope." }, 400);
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return jsonResponse({ error: "Invalid customer ID." }, 400);
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return jsonResponse({ error: "Service temporarily unavailable." }, 500);
  }

  try {
    await requireAal2(supabase);
  } catch (error) {
    const isUnauthenticated =
      error instanceof Error && error.message === "Authentication required.";
    return jsonResponse(
      {
        error: isUnauthenticated
          ? "Authentication required."
          : "AAL2 assurance required.",
      },
      isUnauthenticated ? 401 : 403,
    );
  }

  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_FIELDS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: "Unable to retrieve customer." }, 500);
  }
  if (!data) {
    return jsonResponse({ error: "Customer not found." }, 404);
  }

  return jsonResponse(
    { customer: serializeFormFillCustomer(data as FormFillCustomerRecord) },
    200,
  );
}