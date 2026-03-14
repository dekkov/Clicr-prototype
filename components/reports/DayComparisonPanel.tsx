"use client";

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { ComparisonStats } from '@/lib/comparison-utils';

type HourlyData = { hour: number; occupancy: number };

interface DayComparisonPanelProps {
  dayALabel: string;
  dayBLabel: string;
  dayAHourly: HourlyData[];
  dayBHourly: HourlyData[];
  stats: ComparisonStats;
  onClear: () => void;
}

type StatKey = keyof ComparisonStats;

const STAT_LABELS: Record<StatKey, string> = {
  totalEntries: 'Total Entries',
  peakOccupancy: 'Peak Occupancy',
  scansProcessed: 'Scans Processed',
  denialRate: 'Denial Rate',
  genderRatio: 'Gender Ratio (M/F)',
};

const STAT_ORDER: StatKey[] = [
  'totalEntries',
  'peakOccupancy',
  'scansProcessed',
  'denialRate',
  'genderRatio',
];

function deltaColor(delta: string): string {
  if (delta === '—') return 'text-zinc-500';
  if (delta.startsWith('↑')) return 'text-green-400';
  if (delta.startsWith('↓')) return 'text-red-400';
  return 'text-zinc-500';
}

/** Merge Day A and Day B hourly arrays into a single array keyed by hour (0-23). */
function mergeHourly(
  dayA: HourlyData[],
  dayB: HourlyData[]
): { hour: number; hourLabel: string; dayA: number; dayB: number }[] {
  const mapA = new Map(dayA.map((d) => [d.hour, d.occupancy]));
  const mapB = new Map(dayB.map((d) => [d.hour, d.occupancy]));

  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    hourLabel: `${h}:00`,
    dayA: mapA.get(h) ?? 0,
    dayB: mapB.get(h) ?? 0,
  }));
}

export function DayComparisonPanel({
  dayALabel,
  dayBLabel,
  dayAHourly,
  dayBHourly,
  stats,
  onClear,
}: DayComparisonPanelProps) {
  const chartData = mergeHourly(dayAHourly, dayBHourly);

  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden animate-[fade-in_0.3s_ease-out]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">
          Day Comparison
          <span className="ml-3 text-sm font-normal text-muted-foreground">
            {dayALabel} vs {dayBLabel}
          </span>
        </h3>
        <button
          onClick={onClear}
          className="text-xs uppercase tracking-wider text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          Clear Comparison
        </button>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Overlay AreaChart */}
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Hourly Occupancy
          </p>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="cmpGradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="cmpGradB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="hourLabel"
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    fontSize: 11,
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: any, name: string) => [
                    value,
                    name === 'dayA' ? dayALabel : dayBLabel,
                  ]) as any}
                  labelFormatter={(label) => `Hour: ${label}`}
                />
                <Legend
                  formatter={(value) => (value === 'dayA' ? dayALabel : dayBLabel)}
                  wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                />
                <Area
                  type="monotone"
                  dataKey="dayA"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#cmpGradA)"
                  fillOpacity={0.1}
                  dot={false}
                  name="dayA"
                />
                <Area
                  type="monotone"
                  dataKey="dayB"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#cmpGradB)"
                  fillOpacity={0.1}
                  dot={false}
                  name="dayB"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats Table */}
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Statistics
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Metric
                  </th>
                  <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-blue-400 font-medium">
                    {dayALabel}
                  </th>
                  <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-purple-400 font-medium">
                    {dayBLabel}
                  </th>
                  <th className="text-right py-2 pl-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Delta
                  </th>
                </tr>
              </thead>
              <tbody>
                {STAT_ORDER.map((key, i) => {
                  const row = stats[key];
                  return (
                    <tr
                      key={key}
                      className={
                        i % 2 === 0
                          ? 'bg-white/[0.02]'
                          : ''
                      }
                    >
                      <td className="py-2.5 pr-4 text-zinc-300 font-medium">
                        {STAT_LABELS[key]}
                      </td>
                      <td className="py-2.5 px-4 text-right text-blue-300 tabular-nums">
                        {String(row.dayA)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-purple-300 tabular-nums">
                        {String(row.dayB)}
                      </td>
                      <td className={`py-2.5 pl-4 text-right tabular-nums font-semibold ${deltaColor(row.delta)}`}>
                        {row.delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
