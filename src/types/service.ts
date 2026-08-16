export type ServiceStatus = 'active' | 'inactive';
export type CustomerServiceStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
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
}

// Joined type for UI
export interface CustomerServiceWithDetails extends CustomerService {
  service: Service;
}
