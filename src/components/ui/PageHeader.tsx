import React, { ReactNode, isValidElement } from "react";
import { LucideIcon } from "lucide-react";

export type PageHeaderIconVariant = "badge" | "gradient" | "plain";

export interface PageHeaderProps {
  title: string;
  description?: string | ReactNode;
  icon?: LucideIcon | ReactNode;
  iconVariant?: PageHeaderIconVariant;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  iconVariant = "badge",
  actions,
  className = "",
}: PageHeaderProps) {
  const renderIcon = () => {
    if (!Icon) return null;

    if (isValidElement(Icon)) {
      return Icon;
    }

    const Component = Icon as LucideIcon;

    if (iconVariant === "gradient") {
      return (
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0 mt-0.5 sm:mt-0">
          <Component className="h-5 w-5" />
        </div>
      );
    }

    if (iconVariant === "badge") {
      return (
        <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-violet-50 dark:bg-violet-950/50 border border-violet-100 dark:border-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0 shadow-xs mt-0.5 sm:mt-0">
          <Component className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
        </div>
      );
    }

    // plain
    return <Component className="h-7 w-7 text-violet-600 shrink-0" />;
  };

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 ${className}`}
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        {renderIcon()}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight truncate">
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full sm:w-auto shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
