"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Save, AlertCircle } from "lucide-react";
import { CustomerServiceFormData, customerServiceSchema } from "@/app/(dashboard)/services/schema";
import { upsertCustomerService } from "@/app/(dashboard)/services/actions";
import { Service } from "@/types/service";

export function AssignServiceForm({ 
  customerId,
  availableServices,
  customerService, 
  onClose,
  onSuccess
}: { 
  customerId: string;
  availableServices: Service[];
  customerService?: CustomerServiceFormData;
  onClose: () => void;
  onSuccess: () => void;
}) {
  console.log(`[TRACE] AssignServiceForm services: ${availableServices?.length || 0}`);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<any>({
    resolver: zodResolver(customerServiceSchema),
    defaultValues: customerService || {
      customer_id: customerId,
      service_id: "",
      status: "pending",
      amount: 0,
      payment_status: "unpaid",
      service_date: new Date().toISOString().split('T')[0],
      due_date: null,
      notes: ""
    }
  });

  const selectedServiceId = watch("service_id");

  // When service changes, update default price
  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sId = e.target.value;
    setValue("service_id", sId, { shouldValidate: true });
    
    if (!customerService?.id && sId) {
      const selectedSvc = availableServices.find(s => s.id === sId);
      if (selectedSvc) {
        setValue("amount", Number(selectedSvc.default_price ?? (selectedSvc as any).price ?? 0));
      }
    }
  };

  const onSubmit = async (data: CustomerServiceFormData) => {
    setIsSubmitting(true);
    setGlobalError(null);
    try {
      const result = await upsertCustomerService(data);
      if (result.error) {
        setGlobalError(result.error);
      } else {
        onSuccess();
      }
    } catch (err: any) {
      setGlobalError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900 shrink-0">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {customerService?.id ? "Update Service" : "Assign New Service"}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto">
          {globalError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg flex items-start text-red-600 dark:text-red-400 text-sm">
              <AlertCircle className="h-5 w-5 mr-3 shrink-0 mt-0.5" />
              <span>{globalError}</span>
            </div>
          )}

          <form id="assign-service-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Service *</label>
              <select
                disabled={!!customerService?.id} // Cannot change service once assigned
                value={selectedServiceId}
                onChange={handleServiceChange}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="" disabled>Select a service...</option>
                {availableServices.map(svc => {
                  const displayPrice = Number(svc.default_price ?? (svc as any).price ?? 0);
                  return (
                    <option key={svc.id} value={svc.id}>
                      {svc.service_name} — ₹{displayPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </option>
                  );
                })}
              </select>
              {errors.service_id && <p className="text-xs text-red-500 mt-1">{errors.service_id.message as string}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Status</label>
                <select
                  {...register("status")}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Payment Status</label>
                <select
                  {...register("payment_status")}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                  <option value="waived">Waived</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("amount")}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message as string}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Service Date *</label>
                <input
                  type="date"
                  {...register("service_date")}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.service_date && <p className="text-xs text-red-500 mt-1">{errors.service_date.message as string}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
              <textarea
                {...register("notes")}
                rows={3}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Optional notes or remarks"
              />
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0 flex justify-end space-x-3">
          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button 
            type="submit"
            form="assign-service-form"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-70"
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2"></span>
                Saving...
              </span>
            ) : (
              <span className="flex items-center">
                <Save className="mr-2 h-4 w-4" /> Save Service
              </span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
