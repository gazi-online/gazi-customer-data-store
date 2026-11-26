import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { verifyOpenWAWebhookSignature } from "@/lib/whatsapp/openwaClient";
import { normalizeWhatsAppPhone } from "@/lib/communications/communicationEngine";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseAdmin(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function extractLocal10Digits(rawFrom: string): string | null {
  const stripped = rawFrom.replace(/@(c|g|s\.whatsapp)\.us$|@s\.whatsapp\.net$/i, "");
  const digits = stripped.replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return null;
}

export async function POST(request: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const signature =
    request.headers.get("x-openwa-signature") || request.headers.get("x-signature");

  if (!verifyOpenWAWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 401 });
  }

  let payload: {
    event?: string;
    session?: string;
    data?: Record<string, unknown>;
    timestamp?: number;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const event = payload?.event;
  const data = payload?.data || {};

  // Ignore group messages, status broadcasts, or non-inbound events
  if (event !== "message.received") {
    return NextResponse.json({ received: true, ignored: event || "unknown" });
  }

  const rawFrom = String(data.from || data.chatId || "");
  if (!rawFrom || rawFrom.endsWith("@g.us") || rawFrom === "status@broadcast") {
    return NextResponse.json({ received: true, ignored: "non_direct_chat" });
  }

  if (data.fromMe === true) {
    return NextResponse.json({ received: true, ignored: "outbound_echo" });
  }

  const local10 = extractLocal10Digits(rawFrom);
  if (!local10) {
    return NextResponse.json({ received: true, ignored: "invalid_phone" });
  }

  const normalized12 = normalizeWhatsAppPhone(local10) || `91${local10}`;
  const messageText = String(
    data.body || data.text || data.caption || "(Media / Non-text WhatsApp message)"
  ).trim();
  const senderName = String(
    data.notifyName ||
      (data._data as { notifyName?: string } | undefined)?.notifyName ||
      "WhatsApp Contact"
  ).trim();

  try {
    const supabase = getAdminSupabase();

    // 1. Match existing customer by phone (10-digit or 91+10-digit)
    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, business_id")
      .is("deleted_at", null)
      .or(`phone.ilike.%${local10}%,phone.eq.${normalized12}`)
      .limit(1);

    let customerId = existingCustomers?.[0]?.id as string | undefined;
    let createdNewCustomer = false;

    // 2. Auto-create customer if no match found
    if (!customerId) {
      const { data: defaultBiz } = await supabase
        .from("business_settings")
        .select("business_id")
        .limit(1)
        .single();

      let businessId = defaultBiz?.business_id as string | undefined;
      if (!businessId) {
        const { data: fallbackMembership } = await supabase
          .from("business_memberships")
          .select("business_id")
          .eq("status", "active")
          .limit(1)
          .single();
        businessId = fallbackMembership?.business_id as string | undefined;
      }

      if (businessId) {
        const nameParts = senderName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || "WhatsApp";
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "Lead";

        const { data: created, error: createErr } = await supabase
          .from("customers")
          .insert({
            business_id: businessId,
            first_name: firstName.slice(0, 80),
            last_name: lastName.slice(0, 80),
            phone: local10,
            status: "active",
            notes: "Auto-created from incoming WhatsApp message",
          })
          .select("id")
          .single();

        if (!createErr && created?.id) {
          customerId = created.id;
          createdNewCustomer = true;
        }
      }
    }

    // 3. Log inbound message in customer_communications
    if (customerId) {
      await supabase.from("customer_communications").insert({
        customer_id: customerId,
        channel: "whatsapp",
        direction: "inbound",
        message_snapshot: messageText.slice(0, 500),
        outcome: "contacted",
        notes: createdNewCustomer
          ? `Inbound WhatsApp from ${senderName} (customer auto-created)`
          : `Inbound WhatsApp from ${senderName}`,
      });
    }

    return NextResponse.json({
      received: true,
      customerId: customerId || null,
      createdNewCustomer,
    });
  } catch (err) {
    console.error("[WhatsApp Webhook] Error processing message:", err);
    return NextResponse.json({ received: true, warning: "logged_with_error" });
  }
}
