import { z } from "zod";

export const serviceSchema = z.object({
  id: z.string().optional(),
  service_code: z.string().min(1, "Service code is required"),
  service_name: z.string().min(1, "Service name is required"),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  default_price: z.coerce.number().min(0, "Price must be at least 0"),
  status: z.enum(['active', 'inactive']).default('active'),
});

export type ServiceFormData = z.infer<typeof serviceSchema>;

export const customerServiceSchema = z.object({
  id: z.string().optional(),
  customer_id: z.string().min(1, "Customer ID is required"),
  service_id: z.string().min(1, "Service ID is required"),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled', 'archived']).default('pending'),
  amount: z.coerce.number().min(0, "Amount must be at least 0"),
  payment_status: z.enum(['unpaid', 'partial', 'paid', 'waived']).default('unpaid'),
  service_date: z.string().min(1, "Service date is required"),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CustomerServiceFormData = z.infer<typeof customerServiceSchema>;
