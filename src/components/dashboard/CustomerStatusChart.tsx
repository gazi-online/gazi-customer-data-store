"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { StatusDistPoint } from "@/app/(dashboard)/dashboard/actions";

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value, color } = payload[0].payload;
  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl px-4 py-3 text-sm"
      role="tooltip"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: color }} />
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{name}</span>
      </div>
      <p className="text-zinc-900 dark:text-zinc-100 font-mono font-bold">{value} customer{value !== 1 ? "s" : ""}</p>
    </div>
  );
}

interface Props {
  data: StatusDistPoint[];
}

export function CustomerStatusChart({ data }: Props) {
  const isEmpty = data.length === 0 || data.every((d) => d.value === 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6"
      aria-label="Customer Status Distribution Chart"
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Customer Status</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Distribution of active vs inactive</p>
      </div>

      {isEmpty ? (
        <div className="h-48 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 gap-2">
          <svg className="h-10 w-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm">No customer data yet</p>
        </div>
      ) : (
        <div className="relative h-52" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) => (
                  <span style={{ color: "var(--chart-axis, #71717a)" }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center total */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" aria-label={`Total ${total} customers`}>
            <span className="text-2xl font-bold text-zinc-900 dark:text-white">{total}</span>
            <span className="text-xs text-zinc-500">Total</span>
          </div>
        </div>
      )}

      {/* Accessible text summary */}
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.name}>{d.name}: {d.value} customers</li>
        ))}
      </ul>
    </div>
  );
}
