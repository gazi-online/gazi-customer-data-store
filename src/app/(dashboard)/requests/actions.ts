"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { uploadCustomerDocument } from "@/app/(dashboard)/documents/actions";
import { createInvoice } from "@/app/(dashboard)/invoices/actions";
import {
  RequestDrawerData,
  RequestDrawerResult,
  RequestDrawerDocument,
  RequestDrawerHistoryItem,
  RequestDrawerInvoiceItem,
  RequestBillingInvoice,
  RequestBillingSummary,
  calculateRequestBillingSummary,
  EligibleVaultDocument,
  RequestDocumentErrorCode,
  RequestDocumentMutationResult,
  normalizeRequirementTag,
  getIndiaLocalDate,
  isRequestOverdue,
} from "./types";
import { CustomerServiceStatus, ServiceRequestPriority, PaymentStatus } from "@/types/service";

const isValidUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

interface RawDocumentRow {
  id: string;
  requirement_tag?: string | null;
  is_verified?: boolean | null;
  created_at?: string | null;
  document?: {
    id?: string | null;
    document_type?: string | null;
    document_name?: string | null;
    source_filename?: string | null;
    status?: string | null;
    file_size?: number | null;
    uploaded_at?: string | null;
  } | null;
}

interface RawHistoryRow {
  id: string;
  from_status?: string | null;
  to_status: string;
  changed_by?: string | null;
  created_at: string;
}

interface RawInvoiceItemRow {
  id: string;
  invoice_id: string;
  invoice?: {
    id?: string | null;
    invoice_number?: string | null;
    status?: string | null;
    total_amount?: number | null;
    paid_amount?: number | null;
    due_amount?: number | null;
    invoice_date?: string | null;
  } | null;
}

interface RawCustomerRow {
  id?: string;
  customer_code?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}

interface RawServiceRow {
  id?: string;
  service_code?: string | null;
  service_name?: string | null;
  category?: string | null;
}

export async function getServiceRequestDrawerData(requestId: string): Promise<RequestDrawerResult> {
  if (!requestId || !isValidUuid(requestId)) {
    return { data: null, error: "Invalid service request ID format.", errorCode: "invalid_id" };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: "Authentication required to view service request details.", errorCode: "auth_required" };
  }

  try {
    // 1. Fetch request details and linked invoices concurrently
    const [requestRes, invItemRes] = await Promise.all([
      supabase
        .from("customer_services")
        .select(`
          id,
          request_number,
          status,
          priority,
          application_reference,
          portal_name,
          notes,
          rejection_reason,
          amount,
          payment_status,
          service_date,
          due_date,
          created_at,
          completed_at,
          delivered_at,
          archived_at,
          customer:customers(
            id,
            customer_code,
            first_name,
            middle_name,
            last_name,
            phone
          ),
          service:services(
            id,
            service_code,
            service_name,
            category
          ),
          documents:service_request_documents(
            id,
            requirement_tag,
            is_verified,
            created_at,
            document:customer_documents(
              id,
              document_type,
              document_name,
              source_filename,
              status,
              file_size,
              uploaded_at
            )
          ),
          status_history:service_request_status_history(
            id,
            from_status,
            to_status,
            changed_by,
            created_at
          )
        `)
        .eq("id", requestId)
        .single(),

      supabase
        .from("invoice_items")
        .select(`
          id,
          invoice_id,
          invoice:invoices(
            id,
            invoice_number,
            status,
            total_amount,
            paid_amount,
            due_amount,
            invoice_date
          )
        `)
        .eq("customer_service_id", requestId),
    ]);

    const { data: row, error: fetchError } = requestRes;
    const { data: invItemRows, error: invError } = invItemRes;

    if (fetchError) {
      // Safe operational query failure without leaking Postgres internals
      return { data: null, error: "Failed to query service request.", errorCode: "query_failed" };
    }

    if (!row) {
      return { data: null, error: "Service request not found or access denied.", errorCode: "not_found" };
    }

    if (invError) {
      // Non-fatal secondary query error; log technical code only without leaking PII
      console.error("Failed to fetch linked invoice items for drawer (code:", invError.code, ")");
    }

    // 3. Process documents (strictly safe metadata only)
    const rawDocs = (row.documents as unknown as RawDocumentRow[]) || [];
    const documents: RequestDrawerDocument[] = rawDocs.map((item) => {
      const doc = item.document || {};
      const displayName =
        doc.document_name ||
        doc.source_filename ||
        doc.document_type ||
        "Unnamed Document";

      return {
        id: item.id,
        requirementTag: item.requirement_tag || "general",
        isVerified: Boolean(item.is_verified),
        documentId: doc.id || "",
        documentType: doc.document_type || "Other",
        documentName: displayName,
        fileSize: doc.file_size ? Number(doc.file_size) : undefined,
        status: doc.status || "active",
        createdAt: item.created_at || doc.uploaded_at || "",
      };
    });

    // 4. Process status history (deterministic descending sort by timestamp)
    const rawHistory = (row.status_history as unknown as RawHistoryRow[]) || [];
    const statusHistory: RequestDrawerHistoryItem[] = rawHistory
      .map((h) => ({
        id: h.id,
        fromStatus: h.from_status || null,
        toStatus: h.to_status,
        changedBy: h.changed_by || null,
        createdAt: h.created_at,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 5. Process invoices (deduplicate by invoice_id)
    const seenInvoiceIds = new Set<string>();
    const invoices: RequestDrawerInvoiceItem[] = [];

    if (Array.isArray(invItemRows)) {
      for (const item of (invItemRows as unknown as RawInvoiceItemRow[])) {
        const inv = item.invoice;
        if (inv && inv.id && !seenInvoiceIds.has(inv.id)) {
          seenInvoiceIds.add(inv.id);
          invoices.push({
            id: item.id,
            invoiceId: inv.id,
            invoiceNumber: inv.invoice_number || "INV-UNKNOWN",
            status: inv.status || "draft",
            totalAmount: Number(inv.total_amount || 0),
            paidAmount: Number(inv.paid_amount || 0),
            dueAmount: Number(inv.due_amount || 0),
            invoiceDate: inv.invoice_date || "",
          });
        }
      }
    }

    const customerObj = (row.customer as unknown as RawCustomerRow) || {};
    const serviceObj = (row.service as unknown as RawServiceRow) || {};
    const indiaToday = getIndiaLocalDate();
    const isOverdue = isRequestOverdue(row.due_date, row.status as CustomerServiceStatus, indiaToday);

    const drawerData: RequestDrawerData = {
      id: row.id,
      requestNumber: row.request_number || null,
      status: row.status as CustomerServiceStatus,
      priority: (row.priority as ServiceRequestPriority) || "normal",
      applicationReference: row.application_reference || null,
      portalName: row.portal_name || null,
      notes: row.notes || null,
      rejectionReason: row.rejection_reason || null,
      amount: Number(row.amount || 0),
      paymentStatus: (row.payment_status as PaymentStatus) || "unpaid",
      serviceDate: row.service_date,
      dueDate: row.due_date || null,
      createdAt: row.created_at,
      completedAt: row.completed_at || null,
      deliveredAt: row.delivered_at || null,
      archivedAt: row.archived_at || null,
      isOverdue,

      customer: {
        id: customerObj.id || "",
        customerCode: customerObj.customer_code || null,
        firstName: customerObj.first_name || "",
        middleName: customerObj.middle_name || null,
        lastName: customerObj.last_name || "",
        phone: customerObj.phone || null,
      },

      service: {
        id: serviceObj.id || "",
        serviceCode: serviceObj.service_code || "",
        serviceName: serviceObj.service_name || "",
        category: serviceObj.category || null,
      },

      documents,
      statusHistory,
      invoices,
      billingSummary: calculateRequestBillingSummary(invoices),
    };

    return { data: drawerData, error: null, errorCode: null };
  } catch {
    console.error("Unexpected error in getServiceRequestDrawerData");
    return { data: null, error: "An unexpected error occurred while loading request details.", errorCode: "query_failed" };
  }
}

// ==============================================================================
// REQUEST DOCUMENT LIFECYCLE SERVER ACTIONS (PHASE 2C-2)
// ==============================================================================

/**
 * Fetch non-archived customer documents eligible for attachment to a service request.
 * Derives the owning customer_id strictly on the server under tenant RLS.
 */
export async function getEligibleRequestDocuments(
  requestId: string
): Promise<{
  data: EligibleVaultDocument[] | null;
  error: string | null;
  errorCode: RequestDocumentErrorCode | null;
}> {
  if (!isValidUuid(requestId)) {
    return { data: null, error: "Invalid service request ID format.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { data: null, error: "Authentication required.", errorCode: "auth_required" };
    }

    // 1. Resolve customer_id through request record under tenant RLS
    const { data: request, error: reqErr } = await supabase
      .from("customer_services")
      .select("id, customer_id")
      .eq("id", requestId)
      .single();

    if (reqErr || !request || !request.customer_id) {
      return { data: null, error: "Service request not found or access denied.", errorCode: "not_found" };
    }

    // 2. Fetch existing associations for this request to track already-used requirement tags
    const { data: existingAssocs, error: assocErr } = await supabase
      .from("service_request_documents")
      .select("document_id, requirement_tag")
      .eq("customer_service_id", requestId);

    if (assocErr) {
      console.error("[getEligibleRequestDocuments] Existing associations error:", assocErr.message);
      return { data: null, error: "Failed to retrieve existing associations.", errorCode: "query_failed" };
    }

    const tagsByDocId: Record<string, string[]> = {};
    for (const a of existingAssocs || []) {
      if (a.document_id) {
        if (!tagsByDocId[a.document_id]) tagsByDocId[a.document_id] = [];
        if (a.requirement_tag) tagsByDocId[a.document_id].push(a.requirement_tag);
      }
    }

    // 3. Query non-archived customer vault documents (active or superseded non-archived)
    const { data: docs, error: docErr } = await supabase
      .from("customer_documents")
      .select("id, document_type, document_name, source_filename, status, version, uploaded_at, file_size, archived_at")
      .eq("customer_id", request.customer_id)
      .neq("status", "archived")
      .is("archived_at", null)
      .order("uploaded_at", { ascending: false });

    if (docErr) {
      console.error("[getEligibleRequestDocuments] Documents query error:", docErr.message);
      return { data: null, error: "Failed to load customer documents.", errorCode: "query_failed" };
    }

    // 4. Transform into safe public representation (never expose file_url, storage path, OCR, AI JSON, raw actor UUID)
    const eligibleDocs: EligibleVaultDocument[] = (docs || []).map((d) => ({
      id: d.id,
      documentType: d.document_type || "Document",
      documentName: d.document_name || d.document_type || "Document",
      sourceFilename: d.source_filename || undefined,
      status: d.status || "active",
      version: Number(d.version || 1),
      uploadedAt: d.uploaded_at || new Date().toISOString(),
      fileSize: d.file_size ? Number(d.file_size) : undefined,
      existingTags: tagsByDocId[d.id] || [],
    }));

    return { data: eligibleDocs, error: null, errorCode: null };
  } catch {
    console.error("Unexpected error in getEligibleRequestDocuments");
    return { data: null, error: "An unexpected error occurred while loading eligible documents.", errorCode: "query_failed" };
  }
}

/**
 * Attach an existing non-archived customer vault document to a service request.
 * Enforces server-side same-customer ownership validation and canonical tag normalization.
 */
export async function attachDocumentToRequest(params: {
  requestId: string;
  documentId: string;
  requirementTag?: string;
  notes?: string;
}): Promise<RequestDocumentMutationResult> {
  const { requestId, documentId, requirementTag, notes } = params;

  if (!isValidUuid(requestId) || !isValidUuid(documentId)) {
    return { success: false, error: "Invalid ID format.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    // 1. Pre-validate ownership and non-archived status under tenant RLS
    const [csRes, docRes] = await Promise.all([
      supabase.from("customer_services").select("id, customer_id").eq("id", requestId).single(),
      supabase.from("customer_documents").select("id, customer_id, status, archived_at").eq("id", documentId).single(),
    ]);

    if (csRes.error || !csRes.data) {
      return { success: false, error: "Service request not found or access denied.", errorCode: "not_found" };
    }
    if (docRes.error || !docRes.data) {
      return { success: false, error: "Customer document not found or access denied.", errorCode: "not_found" };
    }

    if (csRes.data.customer_id !== docRes.data.customer_id) {
      return {
        success: false,
        error: "Customer integrity mismatch: Document does not belong to this service request's customer.",
        errorCode: "customer_mismatch",
      };
    }

    if (docRes.data.status === "archived" || docRes.data.archived_at) {
      return {
        success: false,
        error: "Cannot attach an archived document to a service request.",
        errorCode: "not_attachable",
      };
    }

    // 2. Canonical requirement tag normalization
    const normalizedTag = normalizeRequirementTag(requirementTag);

    // 3. Insert association record (created_by = auth.uid() strictly enforced)
    const { data: inserted, error: insertError } = await supabase
      .from("service_request_documents")
      .insert([{
        customer_service_id: requestId,
        document_id: documentId,
        requirement_tag: normalizedTag,
        notes: notes?.trim() || null,
        is_verified: false,
        created_by: user.id,
      }])
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505" || insertError.message?.includes("duplicate key")) {
        return {
          success: false,
          error: "This document is already attached to this request under the same requirement tag.",
          errorCode: "already_attached",
        };
      }
      console.error("[attachDocumentToRequest] Insert error:", insertError.message);
      return {
        success: false,
        error: "Failed to attach document to service request.",
        errorCode: "association_failed",
      };
    }

    // 4. Revalidate concrete paths
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/requests");
    if (csRes.data.customer_id) {
      revalidatePath(`/customers/${csRes.data.customer_id}`);
    }

    return {
      success: true,
      associationId: inserted.id,
      documentId,
      error: null,
      errorCode: null,
    };
  } catch {
    console.error("Unexpected error in attachDocumentToRequest");
    return { success: false, error: "An unexpected error occurred while attaching document.", errorCode: "query_failed" };
  }
}

/**
 * Upload a new file into the canonical customer Document Vault and attach it to the service request.
 * Server derives request.customer_id to prevent client tenant tampering.
 * Implements partial failure contract: if upload succeeds but attach fails, the vault document is preserved.
 */
export async function uploadAndAttachDocumentToRequest(params: {
  requestId: string;
  requirementTag?: string;
  formData: FormData;
}): Promise<RequestDocumentMutationResult> {
  const { requestId, requirementTag, formData } = params;

  if (!isValidUuid(requestId)) {
    return { success: false, error: "Invalid service request ID format.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    // 1. Fetch service request server-side to resolve trusted customer_id
    const { data: request, error: reqErr } = await supabase
      .from("customer_services")
      .select("id, customer_id")
      .eq("id", requestId)
      .single();

    if (reqErr || !request || !request.customer_id) {
      return { success: false, error: "Service request not found or access denied.", errorCode: "not_found" };
    }

    // 2. Override/set server-derived customer_id so client cannot spoof ownership
    formData.delete("customerId");
    formData.set("customer_id", request.customer_id);

    // 3. Delegate file upload and metadata persistence to canonical Document Vault pipeline
    const uploadRes = await uploadCustomerDocument(formData);
    if (!uploadRes || uploadRes.error || !uploadRes.documentId) {
      return {
        success: false,
        error: uploadRes?.error || "Failed to upload document file to customer vault.",
        errorCode: "upload_failed",
      };
    }

    const uploadedDocId = uploadRes.documentId;

    // 4. Attach newly created vault document to this request
    const attachRes = await attachDocumentToRequest({
      requestId,
      documentId: uploadedDocId,
      requirementTag,
    });

    if (!attachRes.success) {
      // Partial failure: Vault document was saved successfully, but association failed.
      return {
        success: false,
        partialSuccess: true,
        documentId: uploadedDocId,
        errorCode: "association_failed",
        error: "The document was saved to the customer's Document Vault, but could not be attached to this request.",
      };
    }

    return {
      success: true,
      documentId: uploadedDocId,
      associationId: attachRes.associationId,
      error: null,
      errorCode: null,
    };
  } catch {
    console.error("Unexpected error in uploadAndAttachDocumentToRequest");
    return { success: false, error: "An unexpected error occurred during upload and attachment.", errorCode: "query_failed" };
  }
}

/**
 * Detach a document association from a service request.
 * Deletes ONLY the service_request_documents association row.
 * The customer_documents vault record and storage objects are strictly preserved.
 */
export async function detachDocumentFromRequest(params: {
  requestId: string;
  associationId: string;
}): Promise<RequestDocumentMutationResult> {
  const { requestId, associationId } = params;

  if (!isValidUuid(requestId) || !isValidUuid(associationId)) {
    return { success: false, error: "Invalid ID format.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    // 1. Verify association belongs to this service request under tenant RLS
    const { data: assoc, error: fetchErr } = await supabase
      .from("service_request_documents")
      .select("id, customer_service_id, customer_services(customer_id)")
      .eq("id", associationId)
      .eq("customer_service_id", requestId)
      .single();

    if (fetchErr || !assoc) {
      return {
        success: false,
        error: "Document association not found or already removed.",
        errorCode: "not_found",
      };
    }

    // 2. Delete ONLY the service_request_documents link
    const { error: delErr } = await supabase
      .from("service_request_documents")
      .delete()
      .eq("id", associationId)
      .eq("customer_service_id", requestId);

    if (delErr) {
      console.error("[detachDocumentFromRequest] Delete error:", delErr.message);
      return { success: false, error: "Failed to detach document association.", errorCode: "query_failed" };
    }

    // 3. Revalidate concrete paths
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/requests");
    const custLink = assoc as unknown as { customer_services?: { customer_id?: string } | null };
    const custId = custLink?.customer_services?.customer_id;
    if (custId) {
      revalidatePath(`/customers/${custId}`);
    }

    return { success: true, error: null, errorCode: null };
  } catch {
    console.error("Unexpected error in detachDocumentFromRequest");
    return { success: false, error: "An unexpected error occurred while detaching document.", errorCode: "query_failed" };
  }
}

/**
 * Toggle verification state on a service_request_documents association.
 * Uses compare-and-set (CAS) optimistic concurrency based on expectedIsVerified.
 * Never modifies customer_documents.verified.
 */
export async function toggleDocumentVerification(params: {
  requestId: string;
  associationId: string;
  expectedIsVerified: boolean;
  isVerified: boolean;
}): Promise<RequestDocumentMutationResult> {
  const { requestId, associationId, expectedIsVerified, isVerified } = params;

  if (!isValidUuid(requestId) || !isValidUuid(associationId)) {
    return { success: false, error: "Invalid ID format.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    // Compare-and-set update strictly on the association record
    const { data: updated, error: updateErr } = await supabase
      .from("service_request_documents")
      .update({ is_verified: isVerified })
      .eq("id", associationId)
      .eq("customer_service_id", requestId)
      .eq("is_verified", expectedIsVerified)
      .select("id, is_verified, customer_services(customer_id)");

    if (updateErr) {
      console.error("[toggleDocumentVerification] Update error:", updateErr.message);
      return { success: false, error: "Failed to update verification status.", errorCode: "query_failed" };
    }

    if (!updated || updated.length === 0) {
      // Concurrency conflict: row was modified by another operator or already in target state
      return {
        success: false,
        error: "Verification state has changed concurrently. Please refresh and try again.",
        errorCode: "conflict",
      };
    }

    // Revalidate concrete paths
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/requests");
    revalidatePath("/dashboard");
    revalidatePath("/operations");
    const updatedLink = updated[0] as unknown as { customer_services?: { customer_id?: string } | null };
    const custId = updatedLink?.customer_services?.customer_id;
    if (custId) {
      revalidatePath(`/customers/${custId}`);
    }

    return { success: true, data: updated[0], error: null, errorCode: null };
  } catch {
    console.error("Unexpected error in toggleDocumentVerification");
    return { success: false, error: "An unexpected error occurred while toggling verification.", errorCode: "query_failed" };
  }
}

// ==============================================================================
// REQUEST BILLING SUMMARY & INVOICE GENERATION (PHASE 2C-3D)
// ==============================================================================

/**
 * Server action to fetch canonical billing summary for a specific request.
 * Derives totals strictly from linked invoice_items.customer_service_id.
 */
export async function getRequestBillingSummary(requestId: string): Promise<{
  data: RequestBillingSummary | null;
  error: string | null;
}> {
  if (!requestId || !isValidUuid(requestId)) {
    return { data: null, error: "Invalid request ID." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: "Authentication required." };
  }

  const { data: items, error: invError } = await supabase
    .from("invoice_items")
    .select(`
      id,
      invoice_id,
      invoice:invoices(
        id,
        invoice_number,
        status,
        total_amount,
        paid_amount,
        due_amount,
        invoice_date
      )
    `)
    .eq("customer_service_id", requestId);

  if (invError) {
    console.error("Error fetching request billing summary:", invError);
    return { data: null, error: "Failed to load request billing summary." };
  }

  const seen = new Set<string>();
  const invoices: RequestBillingInvoice[] = [];

  if (Array.isArray(items)) {
    for (const item of items) {
      const inv = item.invoice as {
        id?: string;
        invoice_number?: string;
        status?: string;
        total_amount?: number;
        paid_amount?: number;
        due_amount?: number;
        invoice_date?: string;
      } | null;
      if (inv && inv.id && !seen.has(inv.id)) {
        seen.add(inv.id);
        invoices.push({
          id: item.id,
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number || "INV-UNKNOWN",
          invoiceDate: inv.invoice_date || "",
          status: inv.status || "draft",
          totalAmount: Number(inv.total_amount || 0),
          paidAmount: Number(inv.paid_amount || 0),
          dueAmount: Number(inv.due_amount || 0),
        });
      }
    }
  }

  const summary = calculateRequestBillingSummary(invoices);
  return { data: summary, error: null };
}

/**
 * Server action to generate an invoice for a specific request.
 * Server derives customer_id and customer_service_id relationships from database.
 * Never trusts client customer_id/customer_service_id.
 */
export async function generateInvoiceForRequest(params: {
  requestId: string;
  idempotencyKey: string;
  description?: string;
  amount?: number;
  status?: "draft" | "issued";
  notes?: string;
}): Promise<{
  success: boolean;
  data?: {
    id: string;
    invoice_number: string;
    total_amount: number;
    status: string;
  };
  error?: string;
}> {
  const { requestId, idempotencyKey, description, amount, status = "issued", notes } = params;

  if (!requestId || !isValidUuid(requestId)) {
    return { success: false, error: "Invalid request ID." };
  }

  if (!idempotencyKey || !isValidUuid(idempotencyKey)) {
    return { success: false, error: "Invalid or missing idempotency key." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  // 1. Fetch request to derive customer_id, service_id, and default amounts server-side
  const { data: reqRow, error: reqError } = await supabase
    .from("customer_services")
    .select(`
      id,
      customer_id,
      service_id,
      amount,
      notes,
      service:services(id, service_name, default_price),
      customer:customers(id, first_name, last_name, customer_code)
    `)
    .eq("id", requestId)
    .single();

  if (reqError || !reqRow) {
    console.error("Failed to load service request for invoice generation:", reqError);
    return { success: false, error: "Service request not found or access denied." };
  }

  const serviceObj = (reqRow.service as { service_name?: string; default_price?: number } | null) || {};
  const lineDescription = description?.trim() || serviceObj.service_name || "Service Fee";
  const unitPrice =
    amount !== undefined && amount >= 0
      ? amount
      : Number(reqRow.amount) > 0
      ? Number(reqRow.amount)
      : Number(serviceObj.default_price || 0);

  const today = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // 2. Call canonical createInvoice with explicit client-provided idempotency key
  const invoiceRes = await createInvoice({
    customer_id: reqRow.customer_id,
    invoice_date: today,
    due_date: dueDate,
    notes: notes || reqRow.notes || null,
    status,
    idempotency_key: idempotencyKey,
    items: [
      {
        customer_service_id: reqRow.id,
        service_id: reqRow.service_id,
        description: lineDescription,
        quantity: 1,
        unit_price: unitPrice,
        discount_amount: 0,
        tax_amount: 0,
      },
    ],
  });

  if (invoiceRes.error || !invoiceRes.success) {
    return { success: false, error: invoiceRes.error || "Failed to create invoice." };
  }

  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/customers/${reqRow.customer_id}`);
  revalidatePath("/invoices");
  if (invoiceRes.data?.id) {
    revalidatePath(`/invoices/${invoiceRes.data.id}`);
  }
  revalidatePath("/dashboard");

  return {
    success: true,
    data: invoiceRes.data,
  };
}

// ==============================================================================
// PHASE 2D: SERVICE REQUEST FOLLOW-UP SERVER ACTIONS
// ==============================================================================

export interface FollowupMutationResult {
  success: boolean;
  followupId?: string;
  newFollowupId?: string;
  error?: string | null;
  errorCode?: string | null;
}

/**
 * Internal helper to revalidate request workspace and downstream operational queues
 */
async function revalidateRequestAndDownstream(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string
) {
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/dashboard");
  revalidatePath("/operations");

  try {
    const { data: csRow } = await supabase
      .from("customer_services")
      .select("customer_id")
      .eq("id", requestId)
      .maybeSingle();

    if (csRow?.customer_id) {
      revalidatePath(`/customers/${csRow.customer_id}`);
    }
  } catch {
    // Non-fatal if customer revalidation lookup fails
  }
}

/**
 * Schedule a new follow-up for a service request.
 * Enforces single active open follow-up per request via DB partial unique index.
 */
export async function scheduleFollowup(params: {
  requestId: string;
  followUpAt: string;
  note?: string | null;
}): Promise<FollowupMutationResult> {
  const { requestId, followUpAt, note } = params;

  if (!isValidUuid(requestId)) {
    return { success: false, error: "Invalid request ID format.", errorCode: "invalid_input" };
  }

  if (!followUpAt || isNaN(new Date(followUpAt).getTime())) {
    return { success: false, error: "A valid follow-up date and time is required.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    // Insert follow-up row (status = 'open')
    const { data, error } = await supabase
      .from("service_request_followups")
      .insert({
        customer_service_id: requestId,
        follow_up_at: new Date(followUpAt).toISOString(),
        note: note ? note.trim() : null,
        status: "open",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: "An active open follow-up already exists for this request. Reschedule or complete the existing one first.",
          errorCode: "already_exists",
        };
      }
      console.error("[scheduleFollowup] Insert error:", error.message);
      return { success: false, error: "Failed to schedule follow-up.", errorCode: "query_failed" };
    }

    await revalidateRequestAndDownstream(supabase, requestId);

    return { success: true, followupId: data.id };
  } catch (err: unknown) {
    console.error("[scheduleFollowup] Unexpected error:", err);
    return { success: false, error: "An unexpected error occurred.", errorCode: "internal_error" };
  }
}

/**
 * Reschedule an existing open follow-up via the canonical atomic RPC.
 * Closes the old row as 'rescheduled', records resolution note, creates new open row,
 * and maintains lineage via superseded_by.
 */
export async function rescheduleFollowup(params: {
  followupId: string;
  requestId: string;
  newFollowUpAt: string;
  newNote?: string | null;
  resolutionNote?: string | null;
}): Promise<FollowupMutationResult> {
  const { followupId, requestId, newFollowUpAt, newNote, resolutionNote } = params;

  if (!isValidUuid(followupId) || !isValidUuid(requestId)) {
    return { success: false, error: "Invalid ID format.", errorCode: "invalid_input" };
  }

  if (!newFollowUpAt || isNaN(new Date(newFollowUpAt).getTime())) {
    return { success: false, error: "A valid new follow-up date and time is required.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    const { data: newId, error } = await supabase.rpc("reschedule_service_request_followup", {
      p_old_followup_id: followupId,
      p_new_follow_up_at: new Date(newFollowUpAt).toISOString(),
      p_new_note: newNote ? newNote.trim() : null,
      p_resolution_note: resolutionNote ? resolutionNote.trim() : null,
    });

    if (error) {
      console.error("[rescheduleFollowup] RPC error:", error.message);
      if (
        error.message?.includes("Only open follow-ups") ||
        error.message?.includes("not found") ||
        error.code === "P0001" ||
        error.code === "P0002"
      ) {
        return {
          success: false,
          error: "This follow-up is no longer open or was already updated. Please refresh.",
          errorCode: "conflict",
        };
      }
      return { success: false, error: "Failed to reschedule follow-up.", errorCode: "rpc_failed" };
    }

    await revalidateRequestAndDownstream(supabase, requestId);

    return { success: true, newFollowupId: newId };
  } catch (err: unknown) {
    console.error("[rescheduleFollowup] Unexpected error:", err);
    return { success: false, error: "An unexpected error occurred while rescheduling.", errorCode: "internal_error" };
  }
}

/**
 * Mark an open follow-up as completed.
 * DB trigger unconditionally sets completed_at = now().
 */
export async function completeFollowup(params: {
  followupId: string;
  requestId: string;
  resolutionNote?: string | null;
}): Promise<FollowupMutationResult> {
  const { followupId, requestId, resolutionNote } = params;

  if (!isValidUuid(followupId) || !isValidUuid(requestId)) {
    return { success: false, error: "Invalid ID format.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    const { data: updatedRows, error } = await supabase
      .from("service_request_followups")
      .update({
        status: "completed",
        resolution_note: resolutionNote ? resolutionNote.trim() : null,
      })
      .eq("id", followupId)
      .eq("status", "open")
      .select("id");

    if (error) {
      console.error("[completeFollowup] Update error:", error.message);
      return { success: false, error: "Failed to complete follow-up.", errorCode: "query_failed" };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        error: "This follow-up is no longer open or was already updated. Please refresh.",
        errorCode: "conflict",
      };
    }

    await revalidateRequestAndDownstream(supabase, requestId);

    return { success: true, followupId };
  } catch (err: unknown) {
    console.error("[completeFollowup] Unexpected error:", err);
    return { success: false, error: "An unexpected error occurred.", errorCode: "internal_error" };
  }
}

/**
 * Cancel an open follow-up.
 */
export async function cancelFollowup(params: {
  followupId: string;
  requestId: string;
  resolutionNote?: string | null;
}): Promise<FollowupMutationResult> {
  const { followupId, requestId, resolutionNote } = params;

  if (!isValidUuid(followupId) || !isValidUuid(requestId)) {
    return { success: false, error: "Invalid ID format.", errorCode: "invalid_input" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Authentication required.", errorCode: "auth_required" };
    }

    const { data: updatedRows, error } = await supabase
      .from("service_request_followups")
      .update({
        status: "cancelled",
        resolution_note: resolutionNote ? resolutionNote.trim() : null,
      })
      .eq("id", followupId)
      .eq("status", "open")
      .select("id");

    if (error) {
      console.error("[cancelFollowup] Update error:", error.message);
      return { success: false, error: "Failed to cancel follow-up.", errorCode: "query_failed" };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        error: "This follow-up is no longer open or was already updated. Please refresh.",
        errorCode: "conflict",
      };
    }

    await revalidateRequestAndDownstream(supabase, requestId);

    return { success: true, followupId };
  } catch (err: unknown) {
    console.error("[cancelFollowup] Unexpected error:", err);
    return { success: false, error: "An unexpected error occurred.", errorCode: "internal_error" };
  }
}
