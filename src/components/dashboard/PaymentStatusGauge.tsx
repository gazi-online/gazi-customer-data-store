"use client";

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";
import type { PaymentGaugeData } from "@/app/(dashboard)/dashboard/actions";

function formatINR(v: number) {
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + "Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + "L";
  if (v >= 1000) return "₹" + (v / 1000).toFixed(1) + "K";
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Colour for the rate: 0–49 red, 50–74 amber, 75–89 blue, 90–100 green
function rateColor(rate: number) {
  if (rate >= 90) return "#22c55e";
  if (rate >= 75) return "#3b82f6";
  if (rate >= 50) return "#f59e0b";
  return "#ef4444";
}

interface StatusPillProps {
  label: string;
  count: number;
  color: string;
}

function StatusPill({ label, count, color }: StatusPillProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
      </div>
      <span className="text-xs font-bold font-mono text-zinc-800 dark:text-zinc-200 tabular-nums">{count}</span>
    </div>
  );
}

interface Props {
  data: PaymentGaugeData;
}

export function PaymentStatusGauge({ data }: Props) {
  const { collectionRate, totalBilled, totalCollected, totalOutstanding, statusCounts } = data;
  const color = rateColor(collectionRate);
  const noData = totalBilled === 0;

  // Recharts RadialBarChart data: single bar value 0–100
  const chartData = [{ name: "rate", value: noData ? 0 : collectionRate, fill: noData ? "#e4e4e7" : color }];

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6 flex flex-col"
      aria-label="Payment Collection Status"
    >
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Payment Collection</h2>
        <p className="text-xs text-zinc-500 mt-0.5">All-time collection rate</p>
      </div>

      {/* Semicircle gauge */}
      <div className="relative h-44 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="80%"
            innerRadius="70%"
            outerRadius="100%"
            startAngle={180}
            endAngle={0}
            data={chartData}
            barSize={18}
          >
            {/* Full-arc background track */}
            <RadialBar
              background={{ fill: "var(--gauge-track, #f4f4f5)" }}
              dataKey="value"
              cornerRadius={9}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Center label — rate % */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-1"
          aria-label={`Collection rate: ${collectionRate}%`}
        >
          {noData ? (
            <span className="text-sm text-zinc-400 dark:text-zinc-600">No invoices yet</span>
          ) : (
            <>
              <span className="text-3xl font-extrabold font-mono leading-none" style={{ color }}>
                {collectionRate}%
              </span>
              <span className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-widest font-semibold">
                Collected
              </span>
            </>
          )}
        </div>
      </div>

      {/* INR summary row */}
      {!noData && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl px-3 py-2 border border-emerald-100 dark:border-emerald-900/40">
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wide">Collected</p>
            <p className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
              {formatINR(totalCollected)}
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl px-3 py-2 border border-amber-100 dark:border-amber-900/40">
            <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide">Outstanding</p>
            <p className="text-sm font-bold font-mono text-amber-700 dark:text-amber-400 mt-0.5 tabular-nums">
              {formatINR(totalOutstanding)}
            </p>
          </div>
        </div>
      )}

      {/* Invoice status breakdown */}
      <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-0.5">
        <StatusPill label="Paid" count={statusCounts.paid} color="#22c55e" />
        <StatusPill label="Partially Paid" count={statusCounts.partial} color="#3b82f6" />
        <StatusPill label="Issued (open)" count={statusCounts.issued} color="#94a3b8" />
        <StatusPill label="Overdue" count={statusCounts.overdue} color="#ef4444" />
        <StatusPill label="Draft" count={statusCounts.draft} color="#e4e4e7" />
      </div>

      {/* Accessible SR summary */}
      <p className="sr-only">
        Collection rate: {collectionRate}%. Total billed: {formatINR(totalBilled)}. 
        Collected: {formatINR(totalCollected)}. Outstanding: {formatINR(totalOutstanding)}.
        {statusCounts.paid} paid, {statusCounts.partial} partial, {statusCounts.issued} open, 
        {statusCounts.overdue} overdue, {statusCounts.draft} draft invoices.
      </p>
    </div>
  );
}
