"use client";

import React from 'react';
import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts';

type Props = {
  monthTotal: number;
  daysOpen: number;
  ytdTotal: number;
  monthLabel: string; // e.g. "MARCH"
  monthlyTrend: { monthLabel: string; total: number }[];
};

export function MonthStatsBar({ monthTotal, daysOpen, ytdTotal, monthLabel, monthlyTrend }: Props) {
  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center gap-6 border border-white/5">
      {/* Stat: Month Total */}
      <div className="text-center min-w-[100px]">
        <div className="text-3xl font-black text-foreground">{monthTotal.toLocaleString()}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
          {monthLabel} TOTAL
        </div>
      </div>

      <div className="h-10 w-px bg-muted hidden sm:block" />

      {/* Stat: Days Open */}
      <div className="text-center min-w-[100px]">
        <div className="text-3xl font-black text-foreground">{daysOpen}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
          DAYS OPEN IN {monthLabel}
        </div>
      </div>

      <div className="h-10 w-px bg-muted hidden sm:block" />

      {/* Stat: YTD Total */}
      <div className="text-center min-w-[100px]">
        <div className="text-3xl font-black text-foreground">{ytdTotal.toLocaleString()}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">YTD TOTAL</div>
      </div>

      {/* Mini Bar Chart */}
      <div className="ml-auto h-14 w-36 hidden md:block">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyTrend} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Bar dataKey="total" fill="#7c3aed" radius={[2, 2, 0, 0]} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 11 }}
              formatter={(v: unknown) => [(v as number).toLocaleString(), 'Entries']}
              labelFormatter={(label) => label}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
