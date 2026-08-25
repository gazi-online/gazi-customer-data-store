"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { RevenuePoint } from "@/app/(dashboard)/dashboard/actions";

function formatINR(v: number) {
  if (v >= 100000) return "₹" + (v / 100000).toFixed(1) + "L";
  if (v >= 1000) return "₹" + (v / 1000).toFixed(1) + "K";
  return "₹" + v.toLocaleString("en-IN");
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const paid = payload.find((p: any) => p.dataKey === "paid");
  const outstanding = payload.find((p: any) => p.dataKey === "outstanding");
  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl px-4 py-3 text-sm min-w-[160px]"
      role="tooltip"
      aria-label={`Revenue tooltip for ${label}`}
    >
      <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-2 border-b border-zinc-100 dark:border-zinc-800 pb-1">
        {label}
      </p>
      {paid && (
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Paid</span>
          <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
            {paid.value.toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 })}
          </span>
        </div>
      )}
      {outstanding && (
        <div className="flex justify-between gap-4">
          <span className="text-amber-600 dark:text-amber-400 font-medium">Outstanding</span>
          <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
            {outstanding.value.toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 })}
          </span>
        </div>
      )}
    </div>
  );
}

interface Props {
  data: RevenuePoint[];
}

export function RevenueChart({ data }: Props) {
  const isEmpty = data.every((d) => d.paid === 0 && d.outstanding === 0);

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6"
      aria-label="Revenue Overview Chart"
    >
      <div className="mb-5">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Revenue Overview</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Paid collections vs outstanding receivables</p>
      </div>

      <div className="h-56" aria-hidden="true">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 gap-2">
            <svg className="h-10 w-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">No payment data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -10 }} barGap={2} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "var(--chart-axis, #71717a)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--chart-axis, #71717a)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatINR}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--chart-grid, #e4e4e7)", opacity: 0.4 }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => (
                  <span style={{ color: "var(--chart-axis, #71717a)" }}>
                    {value === "paid" ? "Paid" : "Outstanding"}
                  </span>
                )}
              />
              <Bar
                dataKey="paid"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="outstanding"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
