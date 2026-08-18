import { z } from "zod";

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';
export type PaymentStatus = 'recorded' | 'voided' | 'refunded';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'cheque' | 'other';
export type CustomerServicePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'waived';

export interface InvoiceItem {
  id?: string;
  invoice_id?: string;
  customer_service_id?: string | null;
  service_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  line_total: number;
  created_at?: string;
}

export interface Invoice {
  id?: string;
  invoice_number: string;
  customer_id: string;
  invoice_date: string;
  due_date?: string | null;
  status: InvoiceStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  cancelled_at?: string | null;
  items?: InvoiceItem[];
}

export interface Payment {
  id?: string;
  customer_id: string;
  payment_number: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference_number?: string | null;
  status: PaymentStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  voided_at?: string | null;
}

export interface PaymentAllocation {
  id?: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  created_at?: string;
}

// Zod Schemas for decimal-safe input validation
export const invoiceItemSchema = z.object({
  id: z.string().optional(),
  invoice_id: z.string().optional(),
  customer_service_id: z.string().nullable().optional(),
  service_id: z.string().nullable().optional(),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit_price: z.number().nonnegative("Unit price cannot be negative"),
  discount_amount: z.number().nonnegative().default(0),
  tax_amount: z.number().nonnegative().default(0),
  line_total: z.number().nonnegative("Line total cannot be negative"),
});

export const invoiceSchema = z.object({
  id: z.string().optional(),
  invoice_number: z.string().min(1, "Invoice number is required"),
  customer_id: z.string().uuid("Invalid customer ID"),
  invoice_date: z.string(),
  due_date: z.string().nullable().optional(),
  status: z.enum(['draft', 'issued', 'partially_paid', 'paid', 'cancelled']),
  subtotal: z.number().nonnegative(),
  discount_amount: z.number().nonnegative().default(0),
  tax_amount: z.number().nonnegative().default(0),
  total_amount: z.number().nonnegative(),
  paid_amount: z.number().nonnegative().default(0),
  due_amount: z.number().nonnegative().default(0),
  notes: z.string().nullable().optional(),
});

export const paymentSchema = z.object({
  id: z.string().optional(),
  customer_id: z.string().uuid("Invalid customer ID"),
  payment_number: z.string().min(1, "Payment number is required"),
  amount: z.number().positive("Payment amount must be greater than 0"),
  payment_date: z.string(),
  payment_method: z.enum(['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other']),
  reference_number: z.string().nullable().optional(),
  status: z.enum(['recorded', 'voided', 'refunded']).default('recorded'),
  notes: z.string().nullable().optional(),
});

export const paymentAllocationSchema = z.object({
  id: z.string().optional(),
  payment_id: z.string().uuid("Invalid payment ID"),
  invoice_id: z.string().uuid("Invalid invoice ID"),
  amount: z.number().positive("Allocation amount must be greater than 0"),
});
