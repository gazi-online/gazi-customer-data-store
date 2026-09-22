"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Save, AlertCircle } from "lucide-react";
import { ServiceFormData, serviceSchema } from "@/app/(dashboard)/services/schema";
import { upsertService, checkDuplicateServiceCode } from "@/app/(dashboard)/services/actions";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";

export function ServiceForm({ 
  service, 
  onClose,
  onSuccess
}: { 
  service?: ServiceFormData;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors } } = useForm<any>({
    resolver: zodResolver(serviceSchema),
    defaultValues: service || {
      service_code: "",
      service_name: "",
      category: "",
      description: "",
      default_price: 0,
      status: "active"
    }
  });

  const onSubmit = async (data: ServiceFormData) => {
    setIsSubmitting(true);
    setGlobalError(null);
    try {
      // Check duplicate code
      const { hasDuplicate } = await checkDuplicateServiceCode(data.service_code, data.id);
      if (hasDuplicate) {
        setGlobalError(`Service code '${data.service_code}' already exists.`);
        setIsSubmitting(false);
        return;
      }

      const result = await upsertService(data);
      if (result.error) {
        setGlobalError(result.error);
      } else {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.services.displayCatalogs(DASHBOARD_MEMORY_SCOPE),
        });
        onSuccess();
      }
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : "An unexpected error occurred.");
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
            {service?.id ? "Edit Service" : "Add New Service"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
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

          <form id="service-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Service Code *</label>
                <input
                  {...register("service_code")}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. PAN-NEW"
                />
                {errors.service_code && <p className="text-xs text-red-500 mt-1">{errors.service_code.message as string}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Service Name *</label>
                <input
                  {...register("service_name")}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="New PAN Card Application"
                />
                {errors.service_name && <p className="text-xs text-red-500 mt-1">{errors.service_name.message as string}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Category</label>
              <input
                {...register("category")}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. PAN Services"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
              <textarea
                {...register("description")}
                rows={3}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Brief description of the service"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Default Price (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("default_price")}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.default_price && <p className="text-xs text-red-500 mt-1">{errors.default_price.message as string}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Status</label>
                <select
                  {...register("status")}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <p className="text-xs text-zinc-500 mt-1">Inactive services cannot be assigned to new customers.</p>
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0 flex justify-end space-x-3">
          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 min-h-[44px] sm:min-h-0 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            Cancel
          </button>
          <button 
            type="submit"
            form="service-form"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] sm:min-h-0 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
