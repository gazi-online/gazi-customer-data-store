"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ServiceDistPoint } from "@/app/(dashboard)/dashboard/actions";

const COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#f97316", "#ec4899", "#8b5cf6",
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl px-4 py-3 text-sm"
      role="tooltip"
    >
      <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{label}</p>
      <p className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
        {payload[0].value} service{payload[0].value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

interface Props {
  data: ServiceDistPoint[];
}

export function ServicesChart({ data }: Props) {
  const isEmpty = data.length === 0;

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6"
      aria-label="Services Distribution Chart"
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Services Overview</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Service types by frequency</p>
      </div>

      {isEmpty ? (
        <div className="h-48 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 gap-2">
          <svg className="h-10 w-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">No service data available</p>
        </div>
      ) : (
        <div className="h-52" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" strokeOpacity={0.5} horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--chart-axis, #71717a)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={88}
                tick={{ fontSize: 10, fill: "var(--chart-axis, #71717a)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--chart-grid, #e4e4e7)", opacity: 0.4 }} />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                maxBarSize={18}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.name}>{d.name}: {d.count}</li>
        ))}
      </ul>
    </div>
  );
}
