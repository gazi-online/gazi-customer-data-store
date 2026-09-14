"use server";

import { createClient } from "@/lib/supabase/server";
import {
  RequestDrawerData,
  RequestDrawerResult,
  RequestDrawerDocument,
  RequestDrawerHistoryItem,
  RequestDrawerInvoiceItem,
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
    // 1. Fetch narrow request details with joined customer, service, documents, and status history
    const { data: row, error: fetchError } = await supabase
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
      .single();

    if (fetchError) {
      // Safe operational query failure without leaking Postgres internals
      return { data: null, error: "Failed to query service request.", errorCode: "query_failed" };
    }

    if (!row) {
      return { data: null, error: "Service request not found or access denied.", errorCode: "not_found" };
    }

    // 2. Fetch linked invoices through invoice_items (supports 0, 1, or multiple linked invoices)
    const { data: invItemRows, error: invError } = await supabase
      .from("invoice_items")
      .select(`
        id,
        invoice_id,
        invoice:invoices(
          id,
          invoice_number,
          status,
          total_amount,
          due_amount,
          invoice_date
        )
      `)
      .eq("customer_service_id", requestId);

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
    };

    return { data: drawerData, error: null, errorCode: null };
  } catch {
    console.error("Unexpected error in getServiceRequestDrawerData");
    return { data: null, error: "An unexpected error occurred while loading request details.", errorCode: "query_failed" };
  }
}
