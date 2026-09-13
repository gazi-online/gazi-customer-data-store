"use client";

import { ServiceRequestPriority } from "@/types/service";
import { AlertTriangle, Flame, ShieldAlert, ArrowDown } from "lucide-react";

interface RequestPriorityBadgeProps {
  priority: ServiceRequestPriority;
  className?: string;
}

export function RequestPriorityBadge({ priority, className = "" }: RequestPriorityBadgeProps) {
  let style = "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  let label = "Normal";
  let Icon = AlertTriangle;

  switch (priority) {
    case "urgent":
      style = "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 font-bold";
      label = "Urgent";
      Icon = Flame;
      break;
    case "high":
      style = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 font-semibold";
      label = "High";
      Icon = ShieldAlert;
      break;
    case "normal":
      style = "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
      label = "Normal";
      Icon = AlertTriangle;
      break;
    case "low":
      style = "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
      label = "Low";
      Icon = ArrowDown;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-semibold border ${style} ${className}`}
    >
      {priority === "urgent" && <Icon className="h-3 w-3 text-red-600 dark:text-red-400 shrink-0" />}
      {priority === "high" && <Icon className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />}
      <span>{label}</span>
    </span>
  );
}
