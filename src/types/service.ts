import { CustomerDocument } from "./document";

export type ServiceStatus = 'active' | 'inactive';

// Currently persisted legacy status union (Phase 1 database constraint)
export type CustomerServiceStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'archived';

// Alias for domain consistency with current persistence
export type ServiceRequestStatus = CustomerServiceStatus;

// Planned Phase 2 expanded workflow status union (deferred until FSM implementation)
export type ServiceRequestWorkflowStatus =
  | 'pending'
  | 'in_progress'
  | 'draft'
  | 'documents_pending'
  | 'ready_to_submit'
  | 'submitted'
  | 'in_process'
  | 'action_required'
  | 'rejected'
  | 'completed'
  | 'delivered'
  | 'cancelled'
  | 'archived';

export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'waived';

export interface Service {
  id: string;
  service_code: string;
  service_name: string;
  category: string | null;
  description: string | null;
  default_price: number;
  status: ServiceStatus;
  created_at: string;
  updated_at: string;
}

export interface CustomerService {
  id: string;
  customer_id: string;
  service_id: string;
  status: CustomerServiceStatus;
  amount: number;
  payment_status: PaymentStatus;
  service_date: string;
  due_date: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;

  // Milestone 10 Service Request extensions
  request_number?: string | null;
  application_reference?: string | null;
  portal_name?: string | null;
  priority?: ServiceRequestPriority;
  delivered_at?: string | null;
  rejection_reason?: string | null;
}

// Canonical alias: customer_services is the physical storage for ServiceRequest
export type ServiceRequest = CustomerService;

export interface ServiceRequestDocument {
  id: string;
  customer_service_id: string;
  document_id: string;
  requirement_tag: string;
  is_verified: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ServiceRequestDocumentWithDetails extends ServiceRequestDocument {
  document: CustomerDocument;
}

export interface ServiceRequestStatusHistory {
  id: string;
  customer_service_id: string;
  from_status: string | null;
  to_status: string;
  notes: string | null;
  changed_by: string | null;
  created_at: string;
}

// Joined type for UI
export interface CustomerServiceWithDetails extends CustomerService {
  service: Service;
}

export interface ServiceRequestWithDetails extends CustomerServiceWithDetails {
  documents?: ServiceRequestDocumentWithDetails[];
  status_history?: ServiceRequestStatusHistory[];
}
