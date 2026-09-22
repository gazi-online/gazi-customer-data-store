"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { softDeleteCustomer, restoreCustomer } from "@/app/(dashboard)/customers/actions";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, DASHBOARD_MEMORY_SCOPE } from "@/lib/queryKeys";

interface CustomerDeleteButtonProps {
  customerId: string;
  customerName?: string;
  redirectTo?: string;
  onDeleted?: (id: string) => void;
  onRestored?: (id: string) => void;
  variant?: "icon" | "button";
}

export function CustomerDeleteButton({
  customerId,
  customerName,
  redirectTo,
  onDeleted,
  onRestored,
  variant = "icon",
}: CustomerDeleteButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      const res = await softDeleteCustomer(customerId);
      if (res.error) {
        toast.error(res.error || "Failed to delete customer");
        setIsDeleting(false);
        return;
      }

      setIsOpen(false);
      setIsDeleting(false);

      if (onDeleted) {
        onDeleted(customerId);
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.customers.lists(DASHBOARD_MEMORY_SCOPE),
      });

      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }

      // Show temporary Undo toast for 10 seconds
      toast(customerName ? `Customer "${customerName}" deleted` : "Customer deleted", {
        duration: 10000,
        description: "You can undo this deletion within 10 seconds.",
        action: {
          label: "Undo",
          onClick: async () => {
            const toastId = toast.loading("Restoring customer...");
            try {
              const restoreRes = await restoreCustomer(customerId);
              if (restoreRes.success) {
                toast.success(customerName ? `Customer "${customerName}" restored` : "Customer restored", { id: toastId });
                onRestored?.(customerId);
                await queryClient.invalidateQueries({
                  queryKey: queryKeys.customers.lists(DASHBOARD_MEMORY_SCOPE),
                });
                router.refresh();
              } else {
                toast.error(restoreRes.error || "Failed to restore customer", { id: toastId });
              }
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Failed to restore customer", { id: toastId });
            }
          },
        },
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete customer");
      setIsDeleting(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="p-1.5 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          title="Delete Customer"
          aria-label="Delete Customer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center px-3.5 py-2 min-h-[44px] sm:min-h-0 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-lg text-sm font-medium transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Customer
        </button>
      )}

      {/* Confirmation Dialog Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
                Delete customer?
              </h3>
              <button
                type="button"
                onClick={() => !isDeleting && setIsOpen(false)}
                disabled={isDeleting}
                aria-label="Close dialog"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              This customer will be removed from the active customer list. You can undo this action for a short time.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 min-h-[44px] sm:min-h-0 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] sm:min-h-0 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
