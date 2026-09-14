"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerServiceStatus } from "@/types/service";
import { RequestStatusTransitionModal } from "./RequestStatusTransitionModal";
import { RefreshCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface RequestWorkspaceActionsProps {
  request: {
    id: string;
    requestNumber: string | null;
    status: CustomerServiceStatus;
    applicationReference: string | null;
  };
}

export function RequestWorkspaceActions({ request }: RequestWorkspaceActionsProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-xs cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
        title="Update Workflow Status"
        aria-label="Update Workflow Status"
      >
        <RefreshCw className="h-4 w-4" />
        <span>Update Status</span>
      </button>

      <RequestStatusTransitionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        requestId={request.id}
        requestNumber={request.requestNumber}
        currentStatus={request.status}
        existingApplicationReference={request.applicationReference}
        onSuccess={() => {
          setIsModalOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

interface CopyButtonProps {
  value: string;
  label: string;
}

export function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Copied ${label} to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors rounded-md min-h-[28px] min-w-[28px] flex items-center justify-center"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
