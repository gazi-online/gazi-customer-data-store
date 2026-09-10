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
import { useState, useMemo } from "react";
import { Info, UserPlus, ShieldCheck, Activity } from "lucide-react";
import type { CustomerGrowthPoint } from "@/app/(dashboard)/dashboard/actions";

const PERIODS = [
  { label: "7D", value: "7d", days: 7 },
  { label: "30D", value: "30d", days: 30 },
  { label: "90D", value: "90d", days: 90 },
  { label: "1Y", value: "1y", days: 365 },
] as const;

type Period = (typeof PERIODS)[number]["value"];

interface Props {
  initialData: CustomerGrowthPoint[];
  initialPeriod?: Period;
  onPeriodChange?: (period: Period) => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const count = payload[0].value ?? 0;
  return (
    <div
      className="bg-slate-900 text-white border border-slate-800 rounded-xl shadow-xl px-3 py-2 text-xs z-50 pointer-events-none"
      role="tooltip"
      aria-label={`Customer growth tooltip for ${label}`}
    >
      <div className="font-bold flex items-center gap-1.5 text-slate-200">
        <span className="w-2 h-2 rounded-full bg-indigo-400" />
        {label}
      </div>
      <div className="text-indigo-200 font-mono text-[11px] mt-0.5">
        {count} new customer{count !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export function CustomerGrowthChart({
  initialData,
  initialPeriod = "30d",
  onPeriodChange,
}: Props) {
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
      // fallback: keep existing data
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const totalInPeriod = data.reduce((acc, curr) => acc + curr.customers, 0);
    const countPoints = data.length || 1;
    const avgDaily = (totalInPeriod / countPoints).toFixed(1);
    const peak = Math.max(...data.map((d) => d.customers), 0);
    return { totalInPeriod, avgDaily, peak };
  }, [data]);

  const hasNoPoints = data.length === 0;

  return (
    <section
      className="bg-white rounded-[18px] border border-slate-200 p-6 shadow-[0_4px_18px_rgba(15,23,42,0.04)]"
      aria-label="Customer Growth & Verification Trend"
    >
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 gap-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Customer Growth Trend
            </h2>
            {stats.totalInPeriod === 0 && !loading && !hasNoPoints && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                No customer growth data for this period
              </span>
            )}
            <span
              title="Customer registration and onboarding volume over selected time period"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Info className="h-4 w-4" />
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Customer registration and verification volume over time
          </p>
        </div>

        {/* Timeframe Selector */}
        <div
          className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/70"
          role="group"
          aria-label="Timeframe selector"
        >
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriod(p.value)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                period === p.value
                  ? "bg-violet-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              aria-pressed={period === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accessible Text Summary */}
      <div className="sr-only" aria-live="polite">
        Customer growth chart for {period}: {stats.totalInPeriod} total new customers registered, with an average of {stats.avgDaily} per day.
      </div>

      {/* Chart Canvas */}
      <div className="py-6 relative">
        <div className="w-full h-64 relative" aria-hidden="true">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
            </div>
          ) : hasNoPoints ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <Activity className="h-9 w-9 opacity-40 text-violet-500" />
              <p className="text-sm font-semibold text-slate-700">No customer growth data for this period</p>
              <p className="text-xs text-slate-400">Add customers to view trend visualization</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.16} />
                    <stop offset="60%" stopColor="#3B82F6" stopOpacity={0.03} />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#7C3AED" />
                    <stop offset="50%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#2563EB" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E2E8F0" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, stats.peak > 0 ? "auto" : 5]}
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="customers"
                  stroke="url(#lineGradient)"
                  strokeWidth={2.5}
                  fill="url(#chartGradient)"
                  dot={false}
                  activeDot={{ r: 5, fill: "#7C3AED", strokeWidth: 2, stroke: "#FFFFFF" }}
                  isAnimationActive
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Micro-stats strip */}
      <div className="pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <UserPlus className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">
              +{stats.avgDaily} / day
            </div>
            <div className="text-[11px] text-slate-400">Avg Daily Registrations</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">
              +{stats.totalInPeriod} in window
            </div>
            <div className="text-[11px] text-slate-400">Period Total Onboarding</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">
              {stats.peak} peak / day
            </div>
            <div className="text-[11px] text-slate-400">Highest Volume Single Day</div>
          </div>
        </div>
      </div>
    </section>
  );
}

