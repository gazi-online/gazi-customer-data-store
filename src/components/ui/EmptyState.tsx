import React, { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string | ReactNode;
  action?: ReactNode;
  bordered?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bordered = false,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`p-8 sm:p-12 text-center flex flex-col items-center justify-center motion-surface-enter ${
        bordered
          ? "border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-zinc-900"
          : ""
      } ${className}`}
    >
      {Icon && (
        <Icon className="h-10 w-10 sm:h-12 sm:w-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3 shrink-0" />
      )}
      <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
