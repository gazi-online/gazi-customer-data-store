export type EnquirySource = "walk_in" | "phone" | "whatsapp" | "referral" | "other";

export type EnquiryStatus =
  | "new"
  | "in_progress"
  | "follow_up"
  | "quoted"
  | "converted"
  | "closed";

export type EnquiryPriority = "low" | "normal" | "high" | "urgent";

export type EnquiryUpdateType =
  | "created"
  | "note"
  | "status_change"
  | "follow_up"
  | "whatsapp_sent"
  | "converted";

export interface EnquiryRow {
  id: string;
  business_id: string;
  enquiry_number: string;
  customer_id: string | null;
  customer_name: string;
  phone: string;
  email: string | null;
  service_id: string | null;
  service_name?: string | null;
  subject: string;
  details: string | null;
  source: EnquirySource;
  status: EnquiryStatus;
  priority: EnquiryPriority;
  quoted_amount: number | null;
  follow_up_at: string | null;
  last_update_note: string | null;
  converted_request_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EnquiryUpdateRow {
  id: string;
  enquiry_id: string;
  business_id: string;
  update_type: EnquiryUpdateType;
  previous_status: string | null;
  new_status: string | null;
  note: string;
  follow_up_at: string | null;
  whatsapp_sent: boolean;
  created_by: string;
  created_at: string;
}

export interface EnquirySummaryStats {
  total: number;
  open: number;
  followUpDue: number;
  converted: number;
}

export interface EnquiryFormCustomerOption {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  phone: string | null;
  email: string | null;
}

export interface EnquiryFormServiceOption {
  id: string;
  service_name: string;
  service_code: string;
  default_price: number;
}
