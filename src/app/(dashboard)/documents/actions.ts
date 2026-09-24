"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { AIProviderRegistry } from "@/lib/ai/providers";
import { PromptManager } from "@/lib/ai/prompts/PromptManager";
import { ExtractionCache } from "@/lib/ai/cache/ExtractionCache";
import { CustomerDocument, DocumentVaultRow, DocumentVaultResponse, AiImportHistoryRecord } from "@/types/document";
import { v4 as uuidv4 } from "uuid";
import { getKolkataDateString, getKolkataFutureDateString } from "@/lib/operations/dateUtils";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const PRIMARY_BUCKET = "customer_documents";
const FALLBACK_BUCKET = "customer-profiles";

/**
 * Helper to upload to Supabase storage with primary / fallback bucket support
 */
async function uploadToPrivateStorage(supabase: any, storagePath: string, file: File) {
  let bucketUsed = PRIMARY_BUCKET;
  let { data, error } = await supabase.storage
    .from(PRIMARY_BUCKET)
    .upload(storagePath, file, { cacheControl: '3600', upsert: false });

  if (error && (error.message?.includes("Bucket not found") || error.statusCode === '404' || (error as any).code === 'NoSuchBucket')) {
    bucketUsed = FALLBACK_BUCKET;
    const fallbackRes = await supabase.storage
      .from(FALLBACK_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false });
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  return { data, error, bucketUsed };
}

/**
 * Helper to create signed URL with primary / fallback bucket support
 */
async function createSignedUrlSafe(supabase: any, storagePath: string, expiresInSeconds = 900, options: any = {}) {
  let { data, error } = await supabase.storage
    .from(PRIMARY_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds, options);

  if (error && (error.message?.includes("Bucket not found") || error.statusCode === '404' || (error as any).code === 'NoSuchBucket')) {
    const fallbackRes = await supabase.storage
      .from(FALLBACK_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds, options);
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  return { data, error };
}

/**
 * Helper to remove object with primary / fallback bucket support
 */
async function removeStorageObjectSafe(supabase: any, storagePath: string) {
  let { data, error } = await supabase.storage
    .from(PRIMARY_BUCKET)
    .remove([storagePath]);

  if (error && (error.message?.includes("Bucket not found") || error.statusCode === '404' || (error as any).code === 'NoSuchBucket')) {
    const fallbackRes = await supabase.storage
      .from(FALLBACK_BUCKET)
      .remove([storagePath]);
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  return { data, error };
}

/**
 * Upload a customer document to private Supabase Storage
 * and insert metadata into customer_documents table.
 */
export async function uploadCustomerDocument(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  const customerId = formData.get("customer_id") as string | null;
  const documentType = formData.get("document_type") as string | null;
  const documentName = (formData.get("document_name") as string | null) || null;
  const documentNumber = (formData.get("document_number") as string | null) || null;
  const issueDate = (formData.get("issue_date") as string | null) || null;
  const expiryDate = (formData.get("expiry_date") as string | null) || null;
  const notes = (formData.get("notes") as string | null) || null;
  const side = (formData.get("side") as string) || "single";

  if (!file || !customerId || !documentType) {
    return { error: "Customer, Document Type, and File are required" };
  }

  // Validate File Size
  if (file.size === 0) {
    return { error: "Uploaded file is empty" };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "File size exceeds maximum allowed limit of 10MB" };
  }

  // Validate MIME Type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: `Unsupported file format (${file.type || 'unknown'}). Allowed: JPG, PNG, WEBP, PDF` };
  }

  // Verify Customer Exists
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, customer_code")
    .eq("id", customerId)
    .single();

  if (custErr || !customer) {
    return { error: "Invalid customer ID. Customer not found." };
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Generate collision-safe private storage path (Never expose Aadhaar/PAN in path)
  const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `customers/${customerId}/${uuidv4()}-${sanitizedOriginalName}`;

  // Upload to Supabase Private Storage
  const { error: uploadError, bucketUsed } = await uploadToPrivateStorage(supabase, storagePath, file);

  if (uploadError) {
    console.error("[uploadCustomerDocument] Storage upload error:", uploadError.message);
    return { error: "Failed to upload document file to secure storage" };
  }

  // Insert metadata into DB with graceful fallback for schema versions
  const fullPayload: any = {
    customer_id: customerId,
    document_type: documentType,
    document_name: documentName,
    document_number: documentNumber,
    issue_date: issueDate,
    expiry_date: expiryDate,
    notes: notes,
    file_url: storagePath,
    side: side,
    source_filename: file.name,
    file_size: file.size,
    mime_type: file.type,
    created_by: user?.id || null,
    status: 'active',
    version: 1,
    ai_processed: false,
    verified: false
  };

  let { data: insertedDoc, error: dbError } = await supabase
    .from("customer_documents")
    .insert([fullPayload])
    .select("id")
    .single();

  // If column mismatch occurs on older schema, fallback to core columns
  if (dbError && dbError.message?.includes("Could not find the")) {
    const corePayload: any = {
      customer_id: customerId,
      document_type: documentType,
      file_url: storagePath,
      document_number: documentNumber,
      notes: notes,
      verified: false
    };
    const retryRes = await supabase
      .from("customer_documents")
      .insert([corePayload])
      .select("id")
      .single();
    insertedDoc = retryRes.data;
    dbError = retryRes.error;
  }

  if (dbError) {
    console.error("[uploadCustomerDocument] Database insert error:", dbError.message);
    // Cleanup orphaned storage file
    await removeStorageObjectSafe(supabase, storagePath);
    return { error: "Failed to record document metadata" };
  }

  revalidatePath("/documents");
  revalidatePath(`/customers/${customerId}`);
  return { success: true, documentId: insertedDoc?.id };
}

/**
 * Backward compatibility alias for uploadDocument
 */
export async function uploadDocument(formData: FormData) {
  return uploadCustomerDocument(formData);
}

/**
 * Dedicated server action for cached Document Vault listings.
 *
 * ARCHITECTURAL & PRIVACY SAFETY BOUNDARY:
 * - Queries minimal fields needed for listing & filtering.
 * - Server-side search may temporarily evaluate customer.phone or document_number to preserve search UX,
 *   but the RETURNED client DTO strictly STRIPS:
 *     - file_url
 *     - signed_url
 *     - document_number
 *     - notes
 *     - AI JSON / extraction data
 *     - created_by
 *     - storage paths
 *     - customer phone
 *     - Aadhaar / PAN / KYC fields
 * - Returns clean DocumentVaultRow[] suitable for in-memory TanStack Query caching.
 * - View / Download operations remain on-demand via getDocumentSignedUrl(doc.id).
 */
/**
 * Tokenize human search input into safe search tokens.
 * Strips commas, parens, and excessive whitespace.
 */
function tokenizeDocumentSearchQuery(rawQuery: string): { normalizedQ: string; tokens: string[] } {
  const sanitized = (rawQuery || "").replace(/[,()]/g, " ").trim();
  const normalizedQ = sanitized.replace(/\s+/g, " ");
  const tokens = normalizedQ ? normalizedQ.split(" ").filter((t) => t.length > 0) : [];
  return { normalizedQ, tokens };
}

const MAX_DOCUMENT_SEARCH_CUSTOMER_IDS = 100;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Resolves customer IDs for relational search across customer identity fields
 * (first_name, middle_name, last_name, phone, customer_code).
 * Bounded by MAX_DOCUMENT_SEARCH_CUSTOMER_IDS with over-cap detection.
 */
async function resolveDocumentSearchCustomerIds(
  supabase: SupabaseServerClient,
  q: string
): Promise<{ customerIds: string[]; tooBroad: boolean }> {
  const { tokens } = tokenizeDocumentSearchQuery(q);
  if (tokens.length === 0) {
    return { customerIds: [], tooBroad: false };
  }

  let custQuery = supabase.from("customers").select("id").is("deleted_at", null);
  for (const token of tokens) {
    custQuery = custQuery.or(
      `first_name.ilike.%${token}%,middle_name.ilike.%${token}%,last_name.ilike.%${token}%,phone.ilike.%${token}%,customer_code.ilike.%${token}%`
    );
  }

  const { data, error } = await custQuery.limit(MAX_DOCUMENT_SEARCH_CUSTOMER_IDS + 1);
  if (error || !data) {
    return { customerIds: [], tooBroad: false };
  }

  if (data.length > MAX_DOCUMENT_SEARCH_CUSTOMER_IDS) {
    return { customerIds: [], tooBroad: true };
  }

  return { customerIds: data.map((c: { id: string | number }) => String(c.id)), tooBroad: false };
}

/**
 * Dedicated server action for cached Document Vault listings with bounded server pagination.
 *
 * ARCHITECTURAL & PRIVACY SAFETY BOUNDARY:
 * - Queries minimal fields needed for listing & filtering.
 * - Database-side search on document fields & relational customer identity fields.
 * - Bounded pagination with clamped pageSize (default 25, max 100).
 * - Server-side search may temporarily evaluate customer.phone or document_number to preserve search UX,
 *   but the RETURNED client DTO strictly STRIPS:
 *     - file_url
 *     - signed_url
 *     - document_number
 *     - notes
 *     - AI JSON / extraction data
 *     - created_by
 *     - storage paths
 *     - customer phone
 *     - Aadhaar / PAN / KYC fields
 * - Returns clean DocumentVaultRow[] suitable for in-memory TanStack Query caching.
 * - View / Download operations remain on-demand via getDocumentSignedUrl(doc.id).
 */
export async function getDocumentVaultRows(params?: {
  search?: string;
  documentType?: string;
  status?: string;
  renewalWindow?: string;
  page?: number;
  pageSize?: number;
}): Promise<DocumentVaultResponse> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      documents: [],
      totalCount: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      stats: { total: 0, active: 0, archived: 0, totalSizeBytes: 0 },
      error: "Authentication required. Please sign in again."
    };
  }

  const search = params?.search?.trim() || "";
  const documentType = params?.documentType?.trim() || "";
  const status = params?.status?.trim() || "all";
  const renewalWindow = params?.renewalWindow?.trim() || "all";

  // Bounded pagination: default 25, clamped [1, 100]
  const rawPage = params?.page ?? 1;
  const page = Math.max(1, Number.isInteger(rawPage) ? rawPage : 1);
  const rawPageSize = params?.pageSize ?? 25;
  const pageSize = Math.min(100, Math.max(1, Number.isInteger(rawPageSize) ? rawPageSize : 25));

  // 1. Relational search resolution if search term provided
  let matchingCustomerIds: string[] = [];
  let isSearchTooBroad = false;

  if (search) {
    const custRes = await resolveDocumentSearchCustomerIds(supabase, search);
    if (custRes.tooBroad) {
      isSearchTooBroad = true;
    } else {
      matchingCustomerIds = custRes.customerIds;
    }
  }

  // If search was too broad, return early with zero rows and safe metadata
  if (isSearchTooBroad) {
    return {
      documents: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      searchTooBroad: true,
      stats: { total: 0, active: 0, archived: 0, totalSizeBytes: 0 }
    };
  }

  // 2. Build primary paginated query on customer_documents
  let query = supabase
    .from("customer_documents")
    .select(`
      id,
      customer_id,
      document_type,
      document_name,
      document_number,
      status,
      source_filename,
      file_size,
      mime_type,
      expiry_date,
      uploaded_at,
      created_at,
      customer:customers (
        id,
        customer_code,
        first_name,
        middle_name,
        last_name,
        phone
      )
    `, { count: 'exact' });

  // Apply Renewal Window Filter
  if (renewalWindow && renewalWindow !== "all") {
    query = query.eq("status", "active").not("expiry_date", "is", null);
    const todayStr = getKolkataDateString();
    if (renewalWindow === "expired") {
      query = query.lt("expiry_date", todayStr);
    } else if (renewalWindow === "7d") {
      query = query.gte("expiry_date", todayStr).lte("expiry_date", getKolkataFutureDateString(7));
    } else if (renewalWindow === "30d") {
      query = query.gte("expiry_date", todayStr).lte("expiry_date", getKolkataFutureDateString(30));
    } else if (renewalWindow === "60d") {
      query = query.gte("expiry_date", todayStr).lte("expiry_date", getKolkataFutureDateString(60));
    }
  } else if (status && status !== "all") {
    try {
      query = query.eq("status", status);
    } catch {
      // Ignore if status column does not exist
    }
  }

  // Apply Document Type Filter
  if (documentType && documentType !== "all") {
    query = query.eq("document_type", documentType);
  }

  // Apply Search Filter (PostgREST DB-side)
  if (search) {
    const { normalizedQ, tokens } = tokenizeDocumentSearchQuery(search);
    const orConditions: string[] = [
      `document_name.ilike.%${normalizedQ}%`,
      `source_filename.ilike.%${normalizedQ}%`,
      `document_number.ilike.%${normalizedQ}%`,
      `document_type.ilike.%${normalizedQ}%`,
    ];

    if (tokens.length > 1) {
      for (const t of tokens) {
        orConditions.push(`document_name.ilike.%${t}%`);
        orConditions.push(`source_filename.ilike.%${t}%`);
      }
    }

    if (matchingCustomerIds.length > 0) {
      orConditions.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
    }

    query = query.or(orConditions.join(","));
  }

  // Range-based pagination calculation
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Execute primary bounded page query and parallel stats query
  let res: Awaited<ReturnType<typeof query.range>>;
  let statsTotal = 0;
  let statsActive = 0;
  let statsArchived = 0;
  let statsTotalSizeBytes = 0;

  try {
    const [pageRes, activeCountRes, archivedCountRes, totalCountRes, sizeRes] = await Promise.all([
      query
        .order("created_at", { ascending: false })
        .range(from, to),
      supabase
        .from("customer_documents")
        .select("id", { count: 'exact', head: true })
        .eq("status", "active"),
      supabase
        .from("customer_documents")
        .select("id", { count: 'exact', head: true })
        .eq("status", "archived"),
      supabase
        .from("customer_documents")
        .select("id", { count: 'exact', head: true }),
      supabase
        .from("customer_documents")
        .select("file_size")
        .not("file_size", "is", null)
    ]);

    res = pageRes;
    statsActive = activeCountRes.count ?? 0;
    statsArchived = archivedCountRes.count ?? 0;
    statsTotal = totalCountRes.count ?? 0;

    if (sizeRes.data && Array.isArray(sizeRes.data)) {
      statsTotalSizeBytes = sizeRes.data.reduce((sum: number, r: { file_size?: number | null }) => sum + (r.file_size || 0), 0);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load documents";
    console.error("[getDocumentVaultRows] Query failure:", message);
    return {
      documents: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      stats: { total: 0, active: 0, archived: 0, totalSizeBytes: 0 },
      error: message
    };
  }

  if (res.error) {
    console.error("[getDocumentVaultRows] Query error:", res.error.message);
    return {
      documents: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      stats: { total: 0, active: 0, archived: 0, totalSizeBytes: 0 },
      error: res.error.message
    };
  }

  interface RawVaultRow {
    id: string;
    customer_id: string;
    document_type: string;
    document_name?: string | null;
    document_number?: string | null;
    status?: string | null;
    source_filename?: string | null;
    file_size?: number | null;
    mime_type?: string | null;
    expiry_date?: string | null;
    uploaded_at?: string | null;
    created_at?: string;
    customer?: {
      id: string;
      customer_code: string;
      first_name: string;
      middle_name?: string | null;
      last_name: string;
      phone?: string | null;
    } | null;
  }

  const filteredTotalCount = res.count ?? 0;
  const rawDocs = (res.data || []) as unknown as RawVaultRow[];
  const totalPages = Math.ceil(filteredTotalCount / pageSize);

  // Strip all non-whitelisted fields before returning DTO
  const cleanRows: DocumentVaultRow[] = rawDocs.map((doc) => ({
    id: doc.id,
    customer_id: doc.customer_id,
    document_type: doc.document_type as DocumentVaultRow["document_type"],
    document_name: doc.document_name || null,
    status: (doc.status || "active") as DocumentVaultRow["status"],
    source_filename: doc.source_filename || null,
    file_size: doc.file_size || null,
    mime_type: doc.mime_type || null,
    expiry_date: doc.expiry_date || null,
    uploaded_at: doc.uploaded_at || doc.created_at || new Date().toISOString(),
    created_at: doc.created_at,
    customer: doc.customer ? {
      id: doc.customer.id,
      customer_code: doc.customer.customer_code,
      first_name: doc.customer.first_name,
      middle_name: doc.customer.middle_name || null,
      last_name: doc.customer.last_name,
    } : null,
  }));

  return {
    documents: cleanRows,
    totalCount: filteredTotalCount,
    page,
    pageSize,
    totalPages,
    stats: {
      total: statsTotal,
      active: statsActive,
      archived: statsArchived,
      totalSizeBytes: statsTotalSizeBytes
    }
  };
}

/**
 * Fetch all customer documents across the system with optional search,
 * filters, and short-lived signed URLs for preview/download.
 */
export async function getAllDocuments(params?: {
  search?: string;
  documentType?: string;
  status?: string;
  renewalWindow?: string;
  page?: number;
  limit?: number;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      documents: [],
      totalCount: 0,
      stats: { total: 0, active: 0, archived: 0, totalSizeBytes: 0 },
      error: "Authentication required. Please sign in again."
    };
  }

  const search = params?.search?.trim() || "";
  const documentType = params?.documentType?.trim() || "";
  const status = params?.status?.trim() || "all";
  const renewalWindow = params?.renewalWindow?.trim() || "all";

  // Build query
  let query = supabase
    .from("customer_documents")
    .select(`
      *,
      customer:customers (
        id,
        customer_code,
        first_name,
        middle_name,
        last_name,
        phone
      )
    `, { count: 'exact' });

  // Renewal Window Filter (strictly targets active versions with expiry_date)
  if (renewalWindow && renewalWindow !== "all") {
    query = query.eq("status", "active").not("expiry_date", "is", null);
    const todayStr = getKolkataDateString();
    if (renewalWindow === "expired") {
      query = query.lt("expiry_date", todayStr);
    } else if (renewalWindow === "7d") {
      query = query.gte("expiry_date", todayStr).lte("expiry_date", getKolkataFutureDateString(7));
    } else if (renewalWindow === "30d") {
      query = query.gte("expiry_date", todayStr).lte("expiry_date", getKolkataFutureDateString(30));
    } else if (renewalWindow === "60d") {
      query = query.gte("expiry_date", todayStr).lte("expiry_date", getKolkataFutureDateString(60));
    }
  } else if (status && status !== "all") {
    // Status Filter if not already filtered by renewal window
    try {
      query = query.eq("status", status);
    } catch {
      // Ignore if status column does not exist
    }
  }

  // Document Type Filter
  if (documentType && documentType !== "all") {
    query = query.eq("document_type", documentType);
  }

  let res: Awaited<ReturnType<(typeof query)["order"]>>;

  try {
    res = await query.order("created_at", { ascending: false });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load documents";

    console.error(
      "[getAllDocuments] Unexpected query failure:",
      message
    );

    return {
      documents: [],
      totalCount: 0,
      stats: {
        total: 0,
        active: 0,
        archived: 0,
        totalSizeBytes: 0
      },
      error: message
    };
  }

  if (res.error) {
    console.error("[getAllDocuments] Query error:", res.error.message);

    return {
      documents: [],
      totalCount: 0,
      stats: {
        total: 0,
        active: 0,
        archived: 0,
        totalSizeBytes: 0
      },
      error: res.error.message
    };
  }

  const documents = res.data || [];
  const count = res.count;

  let filteredDocs = documents || [];

  // Client-side search filtering across customer name, code, phone, filename, document_name, document_type
  if (search) {
    const q = search.toLowerCase();
    filteredDocs = filteredDocs.filter((doc: any) => {
      const custName = [doc.customer?.first_name, doc.customer?.middle_name, doc.customer?.last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const code = (doc.customer?.customer_code || "").toLowerCase();
      const phone = (doc.customer?.phone || "").toLowerCase();
      const docType = (doc.document_type || "").toLowerCase();
      const filename = (doc.source_filename || doc.file_url || "").toLowerCase();
      const docName = (doc.document_name || "").toLowerCase();
      const docNum = (doc.document_number || "").toLowerCase();

      return (
        custName.includes(q) ||
        code.includes(q) ||
        phone.includes(q) ||
        docType.includes(q) ||
        filename.includes(q) ||
        docName.includes(q) ||
        docNum.includes(q)
      );
    });
  }

  // Eliminate N+1 signed-URL generation on initial listing.
  // Load metadata immediately; signed URLs are fetched on-demand when preview or download is clicked.
  const docsWithMetadata: CustomerDocument[] = filteredDocs.map((doc: any) => ({
    ...doc,
    uploaded_at: doc.uploaded_at || doc.created_at,
    signed_url: ""
  }));

  // Compute summary stats
  const totalCount = count || filteredDocs.length;
  const activeCount = filteredDocs.filter((d: any) => d.status === 'active' || !d.status).length;
  const archivedCount = filteredDocs.filter((d: any) => d.status === 'archived').length;
  const totalSizeBytes = filteredDocs.reduce((acc: number, d: any) => acc + (d.file_size || 0), 0);

  return {
    documents: docsWithMetadata,
    totalCount,
    stats: {
      total: totalCount,
      active: activeCount,
      archived: archivedCount,
      totalSizeBytes
    }
  };
}

/**
 * Fetch documents for a specific customer.
 *
 * PERFORMANCE & SECURITY (P1A Fast Path):
 * - By default (signUrls = false), returns document metadata immediately with ZERO storage signed URL calls.
 * - View & Download operations are executed securely on-demand via getDocumentSignedUrl(doc.id).
 * - Callers that explicitly require batch pre-signed URLs may pass signUrls = true.
 */
export async function getCustomerDocuments(customerId: string, includeHistory = false, signUrls = false) {
  const supabase = await createClient();
  const query = supabase
    .from("customer_documents")
    .select("*")
    .eq("customer_id", customerId);

  const { data: documents, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[getCustomerDocuments] Error:", error.message);
    throw new Error(error.message);
  }

  let filtered = documents || [];
  if (!includeHistory) {
    filtered = filtered.filter((d: { status?: string }) => d.status === 'active' || !d.status);
  }

  // Fast path: Return metadata immediately without N Supabase Storage network round trips
  if (!signUrls) {
    return filtered.map((doc: Record<string, unknown>) => ({
      ...doc,
      uploaded_at: (doc.uploaded_at as string) || (doc.created_at as string),
      signed_url: undefined,
    })) as CustomerDocument[];
  }

  // Opt-in path: Generate short-lived signed URLs (15 mins) for callers that explicitly request them
  const docsWithUrls: CustomerDocument[] = await Promise.all(
    filtered.map(async (doc) => {
      let signedUrl = "";
      try {
        const { data } = await createSignedUrlSafe(supabase, doc.file_url, 15 * 60);
        signedUrl = data?.signedUrl || "";
      } catch {
        signedUrl = "";
      }

      return {
        ...doc,
        uploaded_at: doc.uploaded_at || doc.created_at,
        signed_url: signedUrl
      };
    })
  );

  return docsWithUrls;
}

/**
 * Request an on-demand fresh signed URL for viewing or downloading a private document.
 *
 * SECURITY ARCHITECTURE:
 * 1. Creates authenticated Supabase server client (auth cookie session)
 * 2. Fetches the customer_documents row by documentId
 * 3. Relies on existing DB/RLS authorization to restrict access to authorized tenants/users
 * 4. Obtains file_url from the server-fetched row (never trusts client-supplied storage path)
 * 5. Signs ONLY that server-resolved path
 * 6. Returns short-lived signed URL (15 mins)
 */
export async function getDocumentSignedUrl(documentId: string, download = false, customFilename?: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required to access documents" };
  }

  if (!documentId) {
    return { error: "Document ID is required" };
  }

  try {
    // 2 & 3: Fetch document row by document ID relying on Supabase RLS
    const { data: doc, error: fetchErr } = await supabase
      .from("customer_documents")
      .select("id, file_url, source_filename, document_name")
      .eq("id", documentId)
      .single();

    if (fetchErr || !doc) {
      console.error("[getDocumentSignedUrl] Document access denied or not found:", fetchErr?.message);
      return { error: "Document not found or access denied" };
    }

    // 4: Obtains file_url from the server-fetched row
    const storagePath = doc.file_url;
    if (!storagePath) {
      return { error: "Document has no associated file path" };
    }

    // 5: Signs ONLY that server-resolved path
    const options: { download?: string | boolean } = {};
    if (download) {
      options.download = customFilename || doc.source_filename || true;
    }

    const { data, error } = await createSignedUrlSafe(supabase, storagePath, 15 * 60, options);

    if (error || !data?.signedUrl) {
      console.error("[getDocumentSignedUrl] Error creating signed URL:", error?.message);
      return { error: "Failed to generate secure document access link" };
    }

    // 6: Returns short-lived signed URL
    return { signedUrl: data.signedUrl };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[getDocumentSignedUrl] Exception:", msg);
    return { error: "Failed to generate secure document link" };
  }
}

/**
 * Delete a customer document (hard delete from storage + DB or soft delete).
 */
export async function deleteCustomerDocument(documentId: string, hardDelete = true) {
  const supabase = await createClient();

  // Fetch document details first
  const { data: doc, error: fetchErr } = await supabase
    .from("customer_documents")
    .select("id, customer_id, file_url")
    .eq("id", documentId)
    .single();

  if (fetchErr || !doc) {
    return { error: "Document not found" };
  }

  if (hardDelete) {
    // Delete file from private storage
    if (doc.file_url) {
      const { error: storageErr } = await removeStorageObjectSafe(supabase, doc.file_url);

      if (storageErr) {
        console.warn("[deleteCustomerDocument] Warning removing storage object:", storageErr.message);
      }
    }

    // Delete record from DB
    const { error: dbErr } = await supabase
      .from("customer_documents")
      .delete()
      .eq("id", documentId);

    if (dbErr) {
      console.error("[deleteCustomerDocument] DB delete error:", dbErr.message);
      return { error: "Failed to delete document record" };
    }
  } else {
    // Soft delete / Archive
    const { error: archiveErr } = await supabase
      .from("customer_documents")
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", documentId);

    if (archiveErr) {
      return { error: archiveErr.message };
    }
  }

  revalidatePath("/documents");
  if (doc.customer_id) {
    revalidatePath(`/customers/${doc.customer_id}`);
  }

  return { success: true };
}

/**
 * Backward compatibility alias for deleteDocument
 */
export async function deleteDocument(documentId: string, _fileUrl?: string, customerId?: string) {
  const res = await deleteCustomerDocument(documentId, true);
  if (customerId) {
    revalidatePath(`/customers/${customerId}`);
  }
  return res;
}

export async function replaceDocument(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File;
  const customerId = formData.get("customer_id") as string;
  const oldDocumentId = formData.get("old_document_id") as string;
  const documentType = formData.get("document_type") as string;

  if (!file || !customerId || !oldDocumentId || !documentType) {
    return { error: "Missing required fields for replacement" };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: "Unsupported file format. Allowed: JPG, PNG, WEBP, PDF" };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "File size exceeds 10MB limit" };
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch old document version if exists
  const { data: oldDoc } = await supabase
    .from("customer_documents")
    .select("version, side")
    .eq("id", oldDocumentId)
    .single();

  const newVersion = (oldDoc?.version || 1) + 1;
  const side = oldDoc?.side || "single";

  const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `customers/${customerId}/${uuidv4()}-v${newVersion}-${sanitizedOriginalName}`;

  // Upload new file version to Private Storage
  const { error: uploadError } = await uploadToPrivateStorage(supabase, storagePath, file);

  if (uploadError) return { error: uploadError.message };

  // Insert new document version
  const { data: newDoc, error: insertError } = await supabase
    .from("customer_documents")
    .insert([{
      customer_id: customerId,
      document_type: documentType,
      file_url: storagePath,
      side: side,
      source_filename: file.name,
      file_size: file.size,
      mime_type: file.type,
      created_by: user?.id || null,
      status: 'active',
      version: newVersion,
      ai_processed: false,
      verified: false
    }])
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  // Mark old document as superseded by newDoc.id
  await supabase
    .from("customer_documents")
    .update({
      status: 'superseded',
      superseded_by: newDoc.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", oldDocumentId);

  revalidatePath("/documents");
  revalidatePath(`/customers/${customerId}`);
  return { success: true, newDocumentId: newDoc.id };
}

export async function archiveDocument(documentId: string, customerId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("customer_documents")
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", documentId);

  if (error) return { error: error.message };

  revalidatePath("/documents");
  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function getCustomerAiImports(customerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_import_history")
    .select(`
      id,
      created_by,
      customer_id,
      status,
      cache_hit,
      ai_provider,
      model_name,
      prompt_version,
      processing_time_ms,
      error_message,
      final_json,
      created_at
    `)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[getCustomerAiImports] Warning:", error.message);
    return [];
  }

  return (data || []) as unknown as AiImportHistoryRecord[];
}

export async function rerunExtraction(documentId: string, customerId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: doc, error: docErr } = await supabase
    .from("customer_documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docErr || !doc) return { error: "Document not found" };

  // Download document buffer from storage
  let fileBufferRes = await supabase.storage.from(PRIMARY_BUCKET).download(doc.file_url);
  if (fileBufferRes.error) {
    fileBufferRes = await supabase.storage.from(FALLBACK_BUCKET).download(doc.file_url);
  }

  if (fileBufferRes.error || !fileBufferRes.data) return { error: "Failed to download document file for AI re-run" };

  const buffer = await fileBufferRes.data.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = doc.mime_type || 'image/png';

  const providerName = process.env.DEFAULT_AI_PROVIDER || 'gemini';
  const promptVersion = process.env.PROMPT_VERSION || 'v1';
  const modelName = 'gemini-flash-latest';

  const finalPrompt = PromptManager.generateFinalPrompt({
    provider: providerName as any,
    version: promptVersion as any,
    documentTypes: [doc.document_type]
  });

  const fileDataArray = [{ base64Data: base64, mimeType }];
  const requestHash = ExtractionCache.computeRequestHash({
    files: fileDataArray,
    documentTypes: [doc.document_type],
    promptVersion,
    modelName
  });

  // Check Extraction Cache
  const cacheRes = await ExtractionCache.lookupCache(supabase, user.id, requestHash);
  let extractionResult: any = null;
  const cacheHit = cacheRes.hit;

  if (cacheHit && cacheRes.resultJson) {
    extractionResult = {
      status: 'success',
      parsedJson: cacheRes.resultJson,
      modelName,
      processingTimeMs: cacheRes.lookupMs,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0
    };
  } else {
    const provider = AIProviderRegistry.getProvider(providerName);
    extractionResult = await provider.extractData(
      "You are a highly accurate Document Extraction AI.",
      finalPrompt,
      fileDataArray
    );

    if (extractionResult.status === 'success' && extractionResult.parsedJson) {
      await ExtractionCache.saveCache(supabase, {
        requestHash,
        userId: user.id,
        provider: providerName,
        modelName: extractionResult.modelName || modelName,
        promptVersion,
        resultJson: extractionResult.parsedJson
      });
    }
  }

  // Create NEW AI Import History record linked to customer_id & document_ids
  const { data: newHistory, error: histErr } = await supabase
    .from("ai_import_history")
    .insert([{
      created_by: user.id,
      customer_id: customerId,
      document_ids: [documentId],
      original_images: JSON.stringify([doc.source_filename || doc.document_type]),
      ai_raw_response: "[REDACTED FOR PRIVACY]",
      final_json: extractionResult.parsedJson || null,
      ai_provider: providerName,
      prompt_version: promptVersion,
      status: extractionResult.status,
      processing_time_ms: extractionResult.processingTimeMs || 0,
      input_tokens: extractionResult.inputTokens || 0,
      output_tokens: extractionResult.outputTokens || 0,
      estimated_cost: extractionResult.estimatedCost || 0,
      model_name: extractionResult.modelName || modelName,
      cache_hit: cacheHit,
      error_message: extractionResult.errorMessage || null
    }])
    .select("id")
    .single();

  if (histErr) console.error("[rerunExtraction] Error logging history:", histErr.message);

  revalidatePath("/documents");
  revalidatePath(`/customers/${customerId}`);
  return {
    success: true,
    data: extractionResult.parsedJson,
    historyId: newHistory?.id,
    cacheHit
  };
}
