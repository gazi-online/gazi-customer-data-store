import { createClient } from "@/lib/supabase/server";
import { renderTemplate, normalizeWhatsAppPhone } from "@/lib/communications/communicationEngine";
import { isAutoNotifyEnabled, sendWhatsAppText } from "@/lib/whatsapp/openwaClient";

export interface AutoNotifyParams {
  customerId: string;
  customerServiceId?: string | null;
  templateKey:
    | "welcome_customer"
    | "docs_required"
    | "service_ready"
    | "service_completed"
    | "eci_acknowledgment"
    | "payment_reminder";
  variables?: {
    serviceName?: string | null;
    requestNumber?: string | null;
    applicationReference?: string | null;
    amountDue?: number | string | null;
  };
  userId?: string | null;
}

/**
 * Non-blocking automatic WhatsApp notification helper.
 * Fetches customer phone + shop name, sends message via OpenWA, and records communication.
 * Never throws so primary business mutations never fail due to WhatsApp outage.
 */
export async function sendAutoWhatsAppNotification(params: AutoNotifyParams): Promise<void> {
  try {
    if (!isAutoNotifyEnabled()) {
      return;
    }

    const supabase = await createClient();

    const [{ data: customer }, { data: settings }] = await Promise.all([
      supabase
        .from("customers")
        .select("id, first_name, middle_name, last_name, phone")
        .eq("id", params.customerId)
        .single(),
      supabase.from("business_settings").select("business_name").limit(1).single(),
    ]);

    if (!customer?.phone) {
      return;
    }

    const normalized = normalizeWhatsAppPhone(customer.phone);
    if (!normalized) {
      return;
    }

    const customerName = [customer.first_name, customer.middle_name, customer.last_name]
      .filter(Boolean)
      .join(" ");
    const shopName = settings?.business_name || "Gazi Cyber Data Store";

    const message = renderTemplate(params.templateKey, {
      customer_name: customerName || "Customer",
      service_name: params.variables?.serviceName || "Service",
      request_number: params.variables?.requestNumber || "—",
      application_reference: params.variables?.applicationReference || "—",
      amount_due: params.variables?.amountDue ?? "0",
      shop_name: shopName,
    });

    if (!message) {
      return;
    }

    await sendWhatsAppText({ phone: normalized, text: message });

    await supabase.from("customer_communications").insert({
      customer_id: params.customerId,
      customer_service_id: params.customerServiceId || null,
      channel: "whatsapp",
      direction: "outbound",
      template_key: params.templateKey,
      message_snapshot: message.slice(0, 500),
      outcome: "contacted",
      notes: "Auto-sent via OpenWA",
      ...(params.userId ? { created_by: params.userId } : {}),
    });
  } catch (err) {
    console.warn("[sendAutoWhatsAppNotification] Skipped/failed:", err);
  }
}

export interface EnquiryWhatsAppParams {
  customerId?: string | null;
  customerName: string;
  phone: string;
  templateKey: "enquiry_received" | "enquiry_update" | "enquiry_followup";
  enquiryNumber: string;
  subject: string;
  updateMessage?: string;
  customText?: string;
  userId?: string | null;
}

/**
 * Sends a WhatsApp message for an enquiry (works for both walk-in leads and existing customers).
 * Returns true if sent successfully, false otherwise. Never throws.
 */
export async function sendEnquiryWhatsAppNotification(
  params: EnquiryWhatsAppParams
): Promise<boolean> {
  try {
    if (!isAutoNotifyEnabled()) {
      return false;
    }

    const normalized = normalizeWhatsAppPhone(params.phone);
    if (!normalized) {
      return false;
    }

    const supabase = await createClient();
    const { data: settings } = await supabase
      .from("business_settings")
      .select("business_name")
      .limit(1)
      .single();

    const shopName = settings?.business_name || "Gazi Cyber Data Store";

    const message = params.customText?.trim()
      ? params.customText.trim()
      : renderTemplate(params.templateKey, {
          customer_name: params.customerName || "Customer",
          enquiry_number: params.enquiryNumber,
          enquiry_subject: params.subject,
          update_message: params.updateMessage || "Status updated.",
          shop_name: shopName,
        });

    if (!message) {
      return false;
    }

    await sendWhatsAppText({ phone: normalized, text: message });

    if (params.customerId) {
      await supabase.from("customer_communications").insert({
        customer_id: params.customerId,
        customer_service_id: null,
        channel: "whatsapp",
        direction: "outbound",
        template_key: params.customText?.trim() ? null : params.templateKey,
        message_snapshot: message.slice(0, 500),
        outcome: "contacted",
        notes: `Enquiry ${params.enquiryNumber}`,
        ...(params.userId ? { created_by: params.userId } : {}),
      });
    }

    return true;
  } catch (err) {
    console.warn("[sendEnquiryWhatsAppNotification] Skipped/failed:", err);
    return false;
  }
}
