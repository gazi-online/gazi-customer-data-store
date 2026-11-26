"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";
import { getDocumentSignedUrl } from "@/app/(dashboard)/documents/actions";
import {
  normalizeWhatsAppPhone,
  renderTemplate,
} from "@/lib/communications/communicationEngine";
import {
  isWhatsAppConfigured,
  sendWhatsAppMedia,
  sendWhatsAppText,
} from "@/lib/whatsapp/openwaClient";

export async function getWhatsAppConfigStatusAction(): Promise<{
  configured: boolean;
}> {
  const supabase = await createClient();
  await requireAal2(supabase);
  return { configured: isWhatsAppConfigured() };
}

async function resolveCustomerPhone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string,
  explicitPhone?: string | null
): Promise<string> {
  if (explicitPhone) {
    const normalized = normalizeWhatsAppPhone(explicitPhone);
    if (normalized) return normalized;
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("phone")
    .eq("id", customerId)
    .single();

  const normalized = normalizeWhatsAppPhone(customer?.phone);
  if (!normalized) {
    throw new Error("Customer does not have a valid WhatsApp phone number.");
  }
  return normalized;
}

export async function sendWhatsAppMessageAction(params: {
  customerId: string;
  customerServiceId?: string | null;
  phone?: string | null;
  message: string;
  templateKey?: string | null;
}) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Authentication required");
  }

  const trimmedMessage = params.message.trim();
  if (!trimmedMessage) {
    throw new Error("Message cannot be empty.");
  }

  const phone = await resolveCustomerPhone(supabase, params.customerId, params.phone);
  const result = await sendWhatsAppText({ phone, text: trimmedMessage });

  const { data: comm, error: dbError } = await supabase
    .from("customer_communications")
    .insert({
      customer_id: params.customerId,
      customer_service_id: params.customerServiceId || null,
      channel: "whatsapp",
      direction: "outbound",
      template_key: params.templateKey || null,
      message_snapshot: trimmedMessage.slice(0, 500),
      outcome: "contacted",
      notes: `Sent directly via OpenWA${result?.id ? ` (ID: ${result.id})` : ""}`,
      created_by: user.id,
    })
    .select()
    .single();

  if (dbError) {
    console.error("[sendWhatsAppMessageAction] DB log error:", dbError);
  }

  revalidatePath("/communications");
  revalidatePath(`/customers/${params.customerId}`);
  if (params.customerServiceId) {
    revalidatePath(`/requests/${params.customerServiceId}`);
  }

  return { success: true, messageId: result?.id || null, communication: comm || null };
}

export async function sendDocumentViaWhatsAppAction(params: {
  customerId: string;
  documentId: string;
  customerServiceId?: string | null;
  caption?: string;
}) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Authentication required");
  }

  const [{ data: doc }, phone, signedRes] = await Promise.all([
    supabase
      .from("customer_documents")
      .select("id, document_name, source_filename, mime_type")
      .eq("id", params.documentId)
      .eq("customer_id", params.customerId)
      .single(),
    resolveCustomerPhone(supabase, params.customerId),
    getDocumentSignedUrl(params.documentId),
  ]);

  if (!doc) {
    throw new Error("Document not found for this customer.");
  }
  if (!signedRes?.signedUrl) {
    throw new Error(signedRes?.error || "Failed to generate document access link.");
  }

  const filename = doc.source_filename || `${doc.document_name || "document"}.pdf`;
  const caption =
    params.caption?.trim() || `Here is your document: ${doc.document_name || filename}`;

  const result = await sendWhatsAppMedia({
    phone,
    url: signedRes.signedUrl,
    filename,
    caption,
    mimeType: doc.mime_type,
  });

  await supabase.from("customer_communications").insert({
    customer_id: params.customerId,
    customer_service_id: params.customerServiceId || null,
    channel: "whatsapp",
    direction: "outbound",
    template_key: "document_share",
    message_snapshot: `[Document: ${filename}] ${caption}`.slice(0, 500),
    outcome: "contacted",
    notes: `Document sent via OpenWA${result?.id ? ` (ID: ${result.id})` : ""}`,
    created_by: user.id,
  });

  revalidatePath("/communications");
  revalidatePath(`/customers/${params.customerId}`);
  if (params.customerServiceId) {
    revalidatePath(`/requests/${params.customerServiceId}`);
  }

  return { success: true, messageId: result?.id || null };
}

export async function sendEciAcknowledgmentReceiptAction(params: {
  customerId: string;
  customerServiceId?: string | null;
  applicationReference: string;
  serviceName?: string | null;
  requestNumber?: string | null;
  portalName?: string | null;
  documentId?: string | null;
}) {
  const supabase = await createClient();
  await requireAal2(supabase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Authentication required");
  }

  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabase
      .from("customers")
      .select("first_name, middle_name, last_name, phone")
      .eq("id", params.customerId)
      .single(),
    supabase.from("business_settings").select("business_name").limit(1).single(),
  ]);

  const customerName = [customer?.first_name, customer?.middle_name, customer?.last_name]
    .filter(Boolean)
    .join(" ");
  const shopName = settings?.business_name || "Gazi Cyber Data Store";

  const baseMessage = renderTemplate("eci_acknowledgment", {
    customer_name: customerName || "Customer",
    service_name: params.serviceName || "Voter / ECI Form",
    request_number: params.requestNumber || "—",
    application_reference: params.applicationReference,
    shop_name: shopName,
  });

  const fullMessage = params.portalName
    ? `${baseMessage}\nPortal: ${params.portalName}`
    : baseMessage;

  const textRes = await sendWhatsAppMessageAction({
    customerId: params.customerId,
    customerServiceId: params.customerServiceId,
    phone: customer?.phone,
    message: fullMessage,
    templateKey: "eci_acknowledgment",
  });

  if (params.documentId) {
    await sendDocumentViaWhatsAppAction({
      customerId: params.customerId,
      documentId: params.documentId,
      customerServiceId: params.customerServiceId,
      caption: `ECI Acknowledgment Receipt (Ref: ${params.applicationReference})`,
    });
  }

  return { success: true, messageId: textRes.messageId };
}
