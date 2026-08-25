"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";
import type { CustomerGrowthPoint } from "@/app/(dashboard)/dashboard/actions";

const PERIODS = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "6 Months", value: "6m" },
  { label: "1 Year", value: "1y" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

interface Props {
  initialData: CustomerGrowthPoint[];
  initialPeriod?: Period;
  onPeriodChange?: (period: Period) => void;
  isLoading?: boolean;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl px-4 py-3 text-sm"
      role="tooltip"
      aria-label={`Customer growth tooltip for ${label}`}
    >
      <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{label}</p>
      <p className="text-blue-600 dark:text-blue-400 font-mono font-bold">
        {payload[0].value} new customer{payload[0].value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function CustomerGrowthChart({ initialData, initialPeriod = "30d", onPeriodChange, isLoading }: Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [data, setData] = useState<CustomerGrowthPoint[]>(initialData);
  const [loading, setLoading] = useState(false);

  async function handlePeriod(p: Period) {
    if (p === period) return;
    setPeriod(p);
    setLoading(true);
    onPeriodChange?.(p);

    try {
      const res = await fetch(`/api/dashboard/customer-growth?period=${p}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data ?? []);
      }
    } catch {
      // fallback: keep old data
    } finally {
      setLoading(false);
    }
  }

  const isEmpty = !loading && data.every((d) => d.customers === 0);

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6"
      aria-label="Customer Growth Chart"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            Customer Growth
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">New customers over time</p>
        </div>
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden" role="group" aria-label="Period selector">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriod(p.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
                period === p.value
                  ? "bg-blue-600 text-white"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              aria-pressed={period === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-56" aria-hidden="true">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 gap-2">
            <svg className="h-10 w-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.5L7.5 9l4.5 4.5 4.5-5.25L21 9" />
            </svg>
            <p className="text-sm">No customer activity in this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="cgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="10%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" strokeOpacity={0.5} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--chart-axis, #71717a)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--chart-axis, #71717a)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="customers"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fill="url(#cgGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
