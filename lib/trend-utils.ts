export type TrendResult = {
  trend: 'up' | 'down' | 'neutral';
  value: string;
};

export function computeTrend(
  current: number,
  previous: number | null | undefined
): TrendResult | null {
  if (previous == null) return null;
  if (current === 0 && previous === 0) return { trend: 'neutral', value: '—' };
  if (previous === 0) return null;
  const pctChange = Math.round(((current - previous) / previous) * 100);
  if (pctChange === 0) return { trend: 'neutral', value: '—' };
  if (pctChange > 0) return { trend: 'up', value: `↑${pctChange}%` };
  return { trend: 'down', value: `↓${Math.abs(pctChange)}%` };
}
