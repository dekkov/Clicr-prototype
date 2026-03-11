"use client";

import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Users } from 'lucide-react';
import { computeHourlyOccupancy, computeDayGenderRatio } from '@/lib/calendarUtils';
import type { CountEvent, IDScanEvent } from '@/lib/types';

type Props = {
  dateStr: string;          // YYYY-MM-DD
  events: CountEvent[];
  scans: IDScanEvent[];
  venueId: string;
};

export function DayDetailPanel({ dateStr, events, scans, venueId }: Props) {
  const hourlyData = useMemo(
    () => computeHourlyOccupancy(events, venueId, dateStr),
    [events, venueId, dateStr]
  );

  const gender = useMemo(
    () => computeDayGenderRatio(events, scans, venueId, dateStr),
    [events, scans, venueId, dateStr]
  );

  const throughput = hourlyData.reduce((sum, h) => sum + h.entries, 0);
  const peakOcc = Math.max(...hourlyData.map(h => h.occupancy), 0);

  const formattedDate = format(new Date(dateStr + 'T12:00:00'), 'EEEE, MMMM do');

  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden animate-[fade-in_0.3s_ease-out]">
      {/* Panel Header */}
      <div className="px-6 py-4 border-b border-white/5">
        <h3 className="text-lg font-bold text-foreground">{formattedDate}</h3>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Capacity Area Chart */}
        <div className="lg:col-span-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Capacity</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="occGrad-day" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="entGrad-day" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                <XAxis
                  dataKey="hourLabel"
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 11 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: any, name: string) => [v, name === 'occupancy' ? 'Occupancy' : 'Entries']) as any}
                />
                <Area
                  type="monotone"
                  dataKey="occupancy"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="url(#occGrad-day)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="entries"
                  stroke="#06b6d4"
                  strokeWidth={1.5}
                  fill="url(#entGrad-day)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="flex flex-col gap-4 justify-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Key Metrics</p>

          {/* Gender Ratio */}
          {gender.total > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <Users className="w-8 h-8 text-blue-400" />
                <span className="text-xs text-blue-400 font-bold">{gender.malePercent}%</span>
              </div>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-pink-500 rounded-full"
                  style={{ width: `${gender.malePercent}%` }}
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <Users className="w-8 h-8 text-pink-400" />
                <span className="text-xs text-pink-400 font-bold">{gender.femalePercent}%</span>
              </div>
            </div>
          )}

          {/* Throughput */}
          <div>
            <div className="text-4xl font-black text-foreground tabular-nums">
              {throughput.toLocaleString()}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
              Total Throughput
            </div>
          </div>

          {/* Peak */}
          <div>
            <div className="text-2xl font-bold text-violet-400 tabular-nums">
              {peakOcc.toLocaleString()}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
              Peak Occupancy
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
