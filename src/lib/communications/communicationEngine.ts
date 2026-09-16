/**
 * ==============================================================================
 * GCDS Phase 2E: Communication & Reminder Engine
 * File: src/lib/communications/communicationEngine.ts
 * ==============================================================================
 */

export type CommunicationChannel =
  | 'whatsapp'
  | 'phone'
  | 'sms'
  | 'email'
  | 'in_person'
  | 'other';

export type CommunicationDirection = 'outbound' | 'inbound';

export type CommunicationOutcome =
  | 'contacted'
  | 'no_answer'
  | 'will_visit'
  | 'docs_awaited'
  | 'resolved'
  | 'note_added'
  | 'other';

export interface CommunicationTemplate {
  key: string;
  name: string;
  category: 'followup' | 'renewal' | 'service' | 'payment';
  text: string;
}

export const COMMUNICATION_TEMPLATES: Record<string, CommunicationTemplate> = {
  followup_reminder: {
    key: 'followup_reminder',
    name: 'Follow-up Reminder',
    category: 'followup',
    text: 'Namaskar {{customer_name}}, this is a follow-up reminder from {{shop_name}} regarding your service {{service_name}} (Ref: {{request_number}}). Scheduled follow-up: {{follow_up_date}}. Please visit us or reply if you need any assistance.',
  },
  doc_renewal_reminder: {
    key: 'doc_renewal_reminder',
    name: 'Document Renewal Reminder',
    category: 'renewal',
    text: 'Namaskar {{customer_name}}, your {{document_name}} is due for renewal on {{expiry_date}}. Please visit {{shop_name}} with the original documents to process your renewal on time.',
  },
  doc_expired: {
    key: 'doc_expired',
    name: 'Document Expired Alert',
    category: 'renewal',
    text: 'Namaskar {{customer_name}}, your {{document_name}} has expired on {{expiry_date}}. Please visit {{shop_name}} as soon as possible for renewal.',
  },
  docs_required: {
    key: 'docs_required',
    name: 'Documents Required',
    category: 'service',
    text: 'Namaskar {{customer_name}}, additional documents are required for your service {{service_name}} (Ref: {{request_number}}). Please visit {{shop_name}} with the required paperwork.',
  },
  service_ready: {
    key: 'service_ready',
    name: 'Service Ready / Collection',
    category: 'service',
    text: 'Namaskar {{customer_name}}, your service {{service_name}} (Ref: {{request_number}}) is ready for collection at {{shop_name}}. Please visit during working hours.',
  },
  service_completed: {
    key: 'service_completed',
    name: 'Service Completed',
    category: 'service',
    text: 'Namaskar {{customer_name}}, your service {{service_name}} (Ref: {{request_number}}) has been successfully completed. Thank you for choosing {{shop_name}}.',
  },
  payment_reminder: {
    key: 'payment_reminder',
    name: 'Payment Balance Reminder',
    category: 'payment',
    text: 'Namaskar {{customer_name}}, an amount of ₹{{amount_due}} is pending for your service {{service_name}} (Ref: {{request_number}}) at {{shop_name}}. Kindly clear the balance at your earliest convenience.',
  },
};

export interface TemplateVariables {
  customer_name?: string;
  service_name?: string;
  request_number?: string;
  follow_up_date?: string;
  document_name?: string;
  expiry_date?: string;
  amount_due?: string | number;
  shop_name?: string;
}

/**
 * Normalizes Indian mobile numbers into the format required for WhatsApp wa.me links.
 * Returns digits with country code '91' (e.g. 919876543210), or null if invalid.
 */
export function normalizeWhatsAppPhone(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;

  // 10 digits starting with 6-9 (Standard Indian mobile)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  // 12 digits starting with 91 followed by 6-9
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return digits;
  }
  // 11 digits starting with 0 followed by 6-9
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }
  // If already at least 10 digits, fallback to digits
  if (digits.length >= 10) {
    return digits;
  }
  return null;
}

/**
 * Safely renders a communication template with allowed variables.
 * Never executes arbitrary expressions.
 */
export function renderTemplate(templateKey: string, variables: TemplateVariables): string {
  const tmpl = COMMUNICATION_TEMPLATES[templateKey];
  const templateStr = tmpl ? tmpl.text : '';
  if (!templateStr) return '';

  const defaultShop = variables.shop_name || 'Gazi Cyber Data Store';

  return templateStr
    .replace(/\{\{customer_name\}\}/g, variables.customer_name || 'Customer')
    .replace(/\{\{service_name\}\}/g, variables.service_name || 'Service')
    .replace(/\{\{request_number\}\}/g, variables.request_number || '—')
    .replace(/\{\{follow_up_date\}\}/g, variables.follow_up_date || 'Today')
    .replace(/\{\{document_name\}\}/g, variables.document_name || 'Document')
    .replace(/\{\{expiry_date\}\}/g, variables.expiry_date || '—')
    .replace(/\{\{amount_due\}\}/g, String(variables.amount_due || '0'))
    .replace(/\{\{shop_name\}\}/g, defaultShop);
}

/**
 * Generates an operator-safe WhatsApp deep link URL.
 * Does not send messages automatically; opens WhatsApp for manual operator review.
 */
export function generateWhatsAppLink(
  rawPhone: string | null | undefined,
  message: string
): string | null {
  const normalized = normalizeWhatsAppPhone(rawPhone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export interface ContactQueueItem {
  id: string;
  type: 'followup_today' | 'followup_overdue' | 'followup_upcoming' | 'doc_expiring' | 'doc_expired' | 'request_action';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  requestId: string | null;
  requestNumber: string | null;
  serviceName: string | null;
  documentId: string | null;
  documentName: string | null;
  reason: string;
  dueDate: string | null;
  amountDue?: number;
  recommendedTemplate: string;
}
