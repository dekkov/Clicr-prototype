// components/reports/CalendarGrid.tsx
"use client";

import React from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildCalendarGrid } from '@/lib/calendarUtils';

type Props = {
  year: number;
  month: number; // 0-indexed
  dailyEntries: Record<string, number>; // "YYYY-MM-DD" → throughput
  selectedDate: string | null;
  onSelectDate: (dateStr: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  selectAllPast?: boolean; // when true, all past dates are selectable regardless of data
  isComparing?: boolean;
  comparisonDate?: string | null;
  onComparisonSelect?: (dateStr: string) => void;
};

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function CalendarGrid({
  year,
  month,
  dailyEntries,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  selectAllPast = false,
  isComparing = false,
  comparisonDate = null,
  onComparisonSelect,
}: Props) {
  const grid = buildCalendarGrid(year, month);
  const monthLabel = format(new Date(year, month, 1), 'MMMM yyyy').toUpperCase();
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <button
          onClick={onPrevMonth}
          className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-foreground tracking-widest">{monthLabel}</h2>

        <button
          onClick={onNextMonth}
          className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Day-of-Week Headers */}
      <div className="grid grid-cols-7 border-b border-white/5">
        {DOW.map(d => (
          <div
            key={d}
            className="py-3 text-center text-[10px] font-bold tracking-widest text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Cells */}
      <div className="grid grid-cols-7">
        {grid.flat().map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="min-h-[80px] border-r border-b border-white/5 last:border-r-0" />;
          }

          const dateStr = format(date, 'yyyy-MM-dd');
          const throughput = dailyEntries[dateStr] ?? 0;
          const hasData = throughput > 0;
          const isSelected = selectedDate === dateStr;
          const isComparisonSelected = comparisonDate === dateStr;
          const isToday = dateStr === today;
          const isFuture = dateStr > today;
          const isLastInRow = (idx + 1) % 7 === 0;
          const isSelectable = hasData || (selectAllPast && !isFuture && !isToday);

          const handleClick = () => {
            if (!isSelectable) return;
            if (isComparing && onComparisonSelect) {
              onComparisonSelect(dateStr);
            } else {
              onSelectDate(dateStr);
            }
          };

          return (
            <button
              key={dateStr}
              onClick={handleClick}
              disabled={!isSelectable}
              className={cn(
                'min-h-[80px] p-3 flex flex-col items-start border-r border-b border-white/5 transition-all text-left group',
                isLastInRow && 'border-r-0',
                isSelectable && 'hover:bg-white/5 cursor-pointer',
                !isSelectable && 'cursor-default opacity-50',
                isSelected && !isComparisonSelected && 'bg-violet-100 dark:bg-violet-900/40 border-violet-200 dark:border-violet-500/50 hover:bg-violet-900/50',
                isComparisonSelected && 'bg-purple-100 dark:bg-purple-900/40 border-2 border-purple-400 dark:border-purple-400 hover:bg-purple-900/50'
              )}
              aria-label={`${dateStr}: ${hasData ? throughput + ' entries' : 'no data'}`}
            >
              {/* Date Number */}
              <span
                className={cn(
                  'text-xs font-semibold',
                  isToday ? 'text-violet-400' : 'text-muted-foreground',
                  isSelected && 'text-violet-300',
                  isComparisonSelected && 'text-purple-300'
                )}
              >
                {date.getDate()}
              </span>

              {/* Throughput or Empty Icon */}
              <div className="flex-1 flex items-center justify-center w-full mt-1">
                {hasData ? (
                  <span
                    className={cn(
                      'text-2xl font-black tabular-nums leading-none',
                      isSelected ? 'text-foreground' : 'text-foreground group-hover:text-foreground'
                    )}
                  >
                    {throughput.toLocaleString()}
                  </span>
                ) : (
                  <Cloud className="w-5 h-5 text-slate-700" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
