import type { CountEvent, IDScanEvent } from '@/lib/types';

type DayData = { events: CountEvent[]; scans: IDScanEvent[] };
type StatRow = { dayA: number | string; dayB: number | string; delta: string };

export type ComparisonStats = {
  totalEntries: StatRow;
  peakOccupancy: StatRow;
  scansProcessed: StatRow;
  denialRate: StatRow;
  genderRatio: StatRow;
};

function pctDelta(a: number, b: number): string {
  if (a === 0 && b === 0) return '—';
  if (a === 0) return '—';
  const pct = Math.round(((b - a) / a) * 100);
  if (pct === 0) return '—';
  return pct > 0 ? `↑${pct}%` : `↓${Math.abs(pct)}%`;
}

function ppDelta(aRate: number, bRate: number): string {
  const diff = bRate - aRate;
  if (Math.abs(diff) < 0.05) return '—';
  const formatted = Math.abs(diff).toFixed(1);
  return diff > 0 ? `↑${formatted}pp` : `↓${formatted}pp`;
}

function countEntries(events: CountEvent[]): number {
  return events.filter((e) => e.flow_type === 'IN').length;
}

function computePeak(events: CountEvent[]): number {
  let occ = 0;
  let peak = 0;
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  for (const e of sorted) {
    occ = Math.max(0, occ + e.delta);
    if (occ > peak) peak = occ;
  }
  return peak;
}

function getDenialRate(scans: IDScanEvent[]): number {
  if (scans.length === 0) return 0;
  const denied = scans.filter((s) => s.scan_result === 'DENIED').length;
  return (denied / scans.length) * 100;
}

function getGenderRatio(scans: IDScanEvent[]): string {
  const accepted = scans.filter((s) => s.scan_result === 'ACCEPTED');
  if (accepted.length === 0) return '—';
  const male = accepted.filter((s) => s.sex === 'M').length;
  const mPct = Math.round((male / accepted.length) * 100);
  return `${mPct}/${100 - mPct}`;
}

export function computeComparisonStats(dayA: DayData, dayB: DayData): ComparisonStats {
  const entriesA = countEntries(dayA.events);
  const entriesB = countEntries(dayB.events);
  const peakA = computePeak(dayA.events);
  const peakB = computePeak(dayB.events);
  const scansA = dayA.scans.length;
  const scansB = dayB.scans.length;
  const denialA = getDenialRate(dayA.scans);
  const denialB = getDenialRate(dayB.scans);
  return {
    totalEntries: { dayA: entriesA, dayB: entriesB, delta: pctDelta(entriesA, entriesB) },
    peakOccupancy: { dayA: peakA, dayB: peakB, delta: pctDelta(peakA, peakB) },
    scansProcessed: { dayA: scansA, dayB: scansB, delta: pctDelta(scansA, scansB) },
    denialRate: { dayA: `${denialA.toFixed(1)}%`, dayB: `${denialB.toFixed(1)}%`, delta: ppDelta(denialA, denialB) },
    genderRatio: { dayA: getGenderRatio(dayA.scans), dayB: getGenderRatio(dayB.scans), delta: '—' },
  };
}
