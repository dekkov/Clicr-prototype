# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the Live Insights dashboard with 6 new data sections (Gender, Hourly Traffic, Occupancy Over Time, Peak Heatmap, Location, Venue Contribution, Traffic Flow, Operational Workflow, Live Venues) backed by a new historical heatmap API endpoint.

**Architecture:** All new sections are inline sub-components in `dashboard/page.tsx` (existing pattern). Data comes from the existing store (`events`, `scanEvents`, `areas`, `venues`) except the heatmap which is fetched from a new `/api/reports/heatmap` GET endpoint that aggregates `count_events` in the API layer (JS-side grouping). One DB index migration improves heatmap query perf.

**Tech Stack:** Next.js App Router, React 19, Recharts (already installed), Tailwind CSS 4, Supabase (supabaseAdmin for heatmap route), `@/utils/supabase/server` for auth.

---

## Task 1: DB Migration — Heatmap Index

**Files:**
- Create: `migrations/015_heatmap_index.sql`

**Step 1: Create the migration file**

```sql
-- migrations/015_heatmap_index.sql
-- Index to speed up historical entry queries used by the heatmap endpoint.
CREATE INDEX IF NOT EXISTS idx_count_events_biz_ts_entries
  ON count_events(business_id, timestamp)
  WHERE delta > 0;
```

**Step 2: Run it in Supabase**

Open Supabase dashboard → SQL Editor → paste and run.
Expected: `CREATE INDEX` success, no errors.

**Step 3: Commit**

```bash
git add migrations/015_heatmap_index.sql
git commit -m "feat(db): add index on count_events for heatmap query"
```

---

## Task 2: Heatmap API Route

**Files:**
- Create: `app/api/reports/heatmap/route.ts`

**Context:** This route is called by the dashboard on mount. It reads auth from the session to get `business_id`, then fetches all historical entry events for that business and groups them by day-of-week (0=Sun…6=Sat) and hour (0–23). JS-side aggregation avoids needing a raw SQL RPC.

The route pattern mirrors `app/api/sync/route.ts`: use `supabaseAdmin` from `@/lib/supabase-admin` for data queries and `createClient` from `@/utils/supabase/server` for session auth.

**Step 1: Create the route**

```typescript
// app/api/reports/heatmap/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export type HeatmapData = Record<number, Record<number, number>>; // day → hour → count

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Resolve business_id from membership
    const { data: membership, error: memberError } = await supabaseAdmin
        .from('business_members')
        .select('business_id')
        .eq('user_id', user.id)
        .single();

    if (memberError || !membership) {
        return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    const { data: events, error } = await supabaseAdmin
        .from('count_events')
        .select('timestamp')
        .eq('business_id', membership.business_id)
        .gt('delta', 0);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Aggregate: day (0=Sun) → hour → entry count
    const heatmap: HeatmapData = {};
    for (const e of events ?? []) {
        const d = new Date(e.timestamp);
        const day = d.getDay();
        const hour = d.getHours();
        if (!heatmap[day]) heatmap[day] = {};
        heatmap[day][hour] = (heatmap[day][hour] ?? 0) + 1;
    }

    return NextResponse.json(
        { heatmap },
        { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' } }
    );
}
```

**Step 2: Verify manually**

Start dev server (`npm run dev`), then in browser console while logged in:
```javascript
fetch('/api/reports/heatmap').then(r => r.json()).then(console.log)
```
Expected: `{ heatmap: { ... } }` object (may be `{}` if no historical data yet — that's fine).

**Step 3: Commit**

```bash
git add app/api/reports/heatmap/route.ts
git commit -m "feat(api): add heatmap aggregation endpoint"
```

---

## Task 3: Dashboard — Heatmap Fetch + Gender Breakdown

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

**Context:** Add `HeatmapData` state + fetch, plus the `GenderBreakdown` inline component. The `GenderBreakdown` component reads `IDScanEvent.sex` (values are strings like `'M'`, `'F'`, etc.) from accepted scans. Place it as Row 3, full-width, between the existing Age Distribution row and the new charts below.

**Step 1: Add heatmap state and fetch to `DashboardPage`**

After the existing `useState` declarations, add:

```typescript
// at top of file, add HeatmapData import
import type { HeatmapData } from '@/app/api/reports/heatmap/route';

// Inside DashboardPage, after existing useStates:
const [heatmapData, setHeatmapData] = useState<HeatmapData>({});
const [heatmapLoading, setHeatmapLoading] = useState(true);

useEffect(() => {
    fetch('/api/reports/heatmap')
        .then(r => r.json())
        .then(d => setHeatmapData(d.heatmap ?? {}))
        .catch(() => setHeatmapData({}))
        .finally(() => setHeatmapLoading(false));
}, []);
```

**Step 2: Add `GenderBreakdown` component (inline, above `DashboardPage`)**

```typescript
const GenderBreakdown = ({ scanEvents }: { scanEvents: IDScanEvent[] }) => {
    const accepted = scanEvents.filter(s => s.scan_result === 'ACCEPTED');
    const total = accepted.length;
    const male = accepted.filter(s => s.sex?.toUpperCase().startsWith('M')).length;
    const female = accepted.filter(s => s.sex?.toUpperCase().startsWith('F')).length;
    const unknown = total - male - female;

    const malePct = total > 0 ? Math.round((male / total) * 100) : 0;
    const femalePct = total > 0 ? Math.round((female / total) * 100) : 0;
    const unknownPct = total > 0 ? 100 - malePct - femalePct : 0;

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-lg">Gender Breakdown</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Based on accepted ID scans</p>
            <div className="flex h-4 rounded-full overflow-hidden mb-3">
                <div className="bg-blue-500 transition-all" style={{ width: `${malePct}%` }} />
                <div className="bg-pink-500 transition-all" style={{ width: `${femalePct}%` }} />
                <div className="bg-gray-600 transition-all" style={{ width: `${unknownPct}%` }} />
            </div>
            <div className="flex items-center gap-6 text-sm">
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    Male <span className="text-white ml-1">{malePct}%</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500 inline-block" />
                    Female <span className="text-white ml-1">{femalePct}%</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" />
                    Unknown <span className="text-white ml-1">{unknownPct}%</span>
                </span>
            </div>
        </div>
    );
};
```

**Step 3: Place `GenderBreakdown` in JSX after Row 2**

After the closing `</div>` of the Age Distribution + Live Event Log grid, add:

```tsx
{/* Gender Breakdown - Row 3 */}
<GenderBreakdown scanEvents={todayScanEvents} />
```

**Step 4: Verify in browser**

The gender breakdown bar should appear below the event log section. With no scan data it shows all gray at 0%.

**Step 5: Commit**

```bash
git add app/(authenticated)/dashboard/page.tsx
git commit -m "feat(dashboard): add heatmap fetch + gender breakdown section"
```

---

## Task 4: Dashboard — Hourly Traffic + Occupancy Over Time

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

**Context:** Two Recharts charts side by side. `HourlyTraffic` uses `BarChart` with two bars (entries green, exits red) grouped by hour. `OccupancyOverTime` uses `AreaChart` with a cumulative running sum by hour. Both use today's `CountEvent[]`. Hours are shown as `"6 PM"`, `"7 PM"`, etc. — only hours with data are shown, padded to show the full evening window (6 PM – 3 AM next day).

**Step 1: Add Recharts imports at top of file**

```typescript
import {
    BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine
} from 'recharts';
```

**Step 2: Add `buildHourlyData` helper (near other helpers, above `DashboardPage`)**

```typescript
function buildHourlyData(events: CountEvent[]) {
    // Evening window: hour 18 (6PM) → 3 (3AM next day), displayed in order
    const EVENING_HOURS = [18,19,20,21,22,23,0,1,2,3];
    const buckets: Record<number, { entries: number; exits: number }> = {};
    EVENING_HOURS.forEach(h => { buckets[h] = { entries: 0, exits: 0 }; });

    events.forEach(e => {
        const hour = new Date(e.timestamp).getHours();
        if (buckets[hour] !== undefined) {
            if (e.delta > 0) buckets[hour].entries += e.delta;
            else buckets[hour].exits += Math.abs(e.delta);
        }
    });

    return EVENING_HOURS.map(h => ({
        hour: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
        entries: buckets[h].entries,
        exits: buckets[h].exits,
    }));
}

function buildOccupancyOverTime(events: CountEvent[]) {
    const EVENING_HOURS = [18,19,20,21,22,23,0,1,2,3];
    const buckets: Record<number, number> = {};
    EVENING_HOURS.forEach(h => { buckets[h] = 0; });

    events.forEach(e => {
        const hour = new Date(e.timestamp).getHours();
        if (buckets[hour] !== undefined) buckets[hour] += e.delta;
    });

    // Running cumulative sum
    let running = 0;
    return EVENING_HOURS.map(h => {
        running = Math.max(0, running + buckets[h]);
        return {
            hour: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
            occupancy: running,
        };
    });
}
```

**Step 3: Add memos in `DashboardPage`**

```typescript
const hourlyData = useMemo(() => buildHourlyData(todayEvents), [todayEvents]);
const occupancyData = useMemo(() => buildOccupancyOverTime(todayEvents), [todayEvents]);
const peakOccupancyValue = useMemo(
    () => Math.max(0, ...occupancyData.map(d => d.occupancy)),
    [occupancyData]
);
```

**Step 4: Add inline components**

```typescript
const HourlyTraffic = ({ data }: { data: { hour: string; entries: number; exits: number }[] }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <span className="text-lg">Hourly Traffic</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">Entries vs. exits by hour</p>
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <Bar dataKey="entries" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="exits" fill="#ef4444" radius={[3,3,0,0]} />
            </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> Entries</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500" /> Exits</span>
        </div>
    </div>
);

const OccupancyOverTime = ({ data, peak }: { data: { hour: string; occupancy: number }[]; peak: number }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <span className="text-lg">Occupancy Over Time</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">Net occupancy by hour · peak marker shown</p>
        <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <ReferenceLine y={peak} stroke="#a78bfa" strokeDasharray="4 4" label={{ value: 'Peak', fill: '#a78bfa', fontSize: 10 }} />
                <Area type="monotone" dataKey="occupancy" stroke="#6366f1" fill="url(#occGrad)" strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
    </div>
);
```

**Step 5: Place in JSX after `GenderBreakdown`**

```tsx
{/* Hourly Traffic + Occupancy Over Time - Row 4 */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <HourlyTraffic data={hourlyData} />
    <OccupancyOverTime data={occupancyData} peak={peakOccupancyValue} />
</div>
```

**Step 6: Verify in browser**

Both charts should render. With no data, bars show at zero.

**Step 7: Commit**

```bash
git add app/(authenticated)/dashboard/page.tsx
git commit -m "feat(dashboard): add hourly traffic and occupancy over time charts"
```

---

## Task 5: Dashboard — Peak Times Heatmap

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

**Context:** Full-width grid showing entry density by day-of-week × hour. Days are rows (Mon–Sun, reordered from JS 0=Sun convention). Hours are columns, showing the evening window (8 AM – 2 AM). Cell intensity is one of 5 purple shades based on % of max cell value. When `heatmapLoading` is true, show a skeleton.

**Step 1: Add `PeakTimesHeatmap` inline component**

```typescript
const HEATMAP_HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2];
const HEATMAP_HOUR_LABELS = ['8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p','12a','1a','2a'];
const HEATMAP_DAYS = [
    { label: 'Mon', jsDay: 1 },
    { label: 'Tue', jsDay: 2 },
    { label: 'Wed', jsDay: 3 },
    { label: 'Thu', jsDay: 4 },
    { label: 'Fri', jsDay: 5 },
    { label: 'Sat', jsDay: 6 },
    { label: 'Sun', jsDay: 0 },
];

const INTENSITY_CLASSES = [
    'bg-gray-800',           // 0
    'bg-purple-900/60',      // level 1
    'bg-purple-700/60',      // level 2
    'bg-purple-600/80',      // level 3
    'bg-purple-500',         // level 4 (max)
];

const PeakTimesHeatmap = ({ data, loading }: { data: HeatmapData; loading: boolean }) => {
    const maxVal = useMemo(() => {
        let m = 1;
        Object.values(data).forEach(hours =>
            Object.values(hours).forEach(v => { if (v > m) m = v; })
        );
        return m;
    }, [data]);

    const intensityClass = (count: number) => {
        if (count === 0) return INTENSITY_CLASSES[0];
        const ratio = count / maxVal;
        if (ratio < 0.25) return INTENSITY_CLASSES[1];
        if (ratio < 0.5) return INTENSITY_CLASSES[2];
        if (ratio < 0.75) return INTENSITY_CLASSES[3];
        return INTENSITY_CLASSES[4];
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-lg">Peak Times Heatmap</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Entry density by day × hour</p>
            {loading ? (
                <div className="h-40 animate-pulse bg-gray-800/50 rounded-lg" />
            ) : (
                <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
                        {/* Hour labels */}
                        <div className="flex mb-1 ml-10">
                            {HEATMAP_HOUR_LABELS.map(h => (
                                <div key={h} className="flex-1 text-center text-[10px] text-gray-500">{h}</div>
                            ))}
                        </div>
                        {/* Rows */}
                        {HEATMAP_DAYS.map(({ label, jsDay }) => (
                            <div key={label} className="flex items-center gap-1 mb-1">
                                <div className="w-9 text-xs text-gray-500 text-right pr-1">{label}</div>
                                {HEATMAP_HOURS.map(h => {
                                    const count = data[jsDay]?.[h] ?? 0;
                                    return (
                                        <div
                                            key={h}
                                            className={cn('flex-1 h-6 rounded-sm transition-colors', intensityClass(count))}
                                            title={`${label} ${HEATMAP_HOUR_LABELS[HEATMAP_HOURS.indexOf(h)]}: ${count} entries`}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                        {/* Legend */}
                        <div className="flex items-center justify-end gap-1 mt-2">
                            <span className="text-[10px] text-gray-500 mr-1">Less</span>
                            {INTENSITY_CLASSES.map((cls, i) => (
                                <div key={i} className={cn('w-4 h-4 rounded-sm', cls)} />
                            ))}
                            <span className="text-[10px] text-gray-500 ml-1">More</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
```

**Step 2: Place in JSX after Row 4**

```tsx
{/* Peak Times Heatmap - Row 5 */}
<PeakTimesHeatmap data={heatmapData} loading={heatmapLoading} />
```

**Step 3: Verify in browser**

Heatmap renders as a grid. Loading skeleton visible briefly on mount. Cells are all gray when no historical data, or purple-shaded when data exists.

**Step 4: Commit**

```bash
git add app/(authenticated)/dashboard/page.tsx
git commit -m "feat(dashboard): add peak times heatmap section"
```

---

## Task 6: Dashboard — Location Distribution + Venue Contribution

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

**Context:** Two horizontal bar charts side-by-side. `LocationDistribution` groups accepted `IDScanEvent.state` values, top 8. `VenueContribution` groups today's entry `CountEvent` by `venue_id`, maps to venue name. Both use Recharts `BarChart` with `layout="vertical"`.

**Step 1: Add memos in `DashboardPage`**

```typescript
const locationData = useMemo(() => {
    const counts: Record<string, number> = {};
    todayScanEvents
        .filter(s => s.scan_result === 'ACCEPTED' && s.state)
        .forEach(s => { counts[s.state!] = (counts[s.state!] ?? 0) + 1; });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([state, count]) => ({ state, count }));
}, [todayScanEvents]);

const venueContribData = useMemo(() => {
    const counts: Record<string, number> = {};
    todayEvents
        .filter(e => e.delta > 0 && e.venue_id)
        .forEach(e => { counts[e.venue_id] = (counts[e.venue_id] ?? 0) + e.delta; });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([venueId, count]) => ({ name: venueNameMap[venueId] ?? 'Unknown', count }));
}, [todayEvents, venueNameMap]);
```

**Step 2: Add inline components**

```typescript
const LocationDistribution = ({ data }: { data: { state: string; count: number }[] }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="text-lg mb-1">Location Distribution</div>
        <p className="text-xs text-gray-500 mb-4">Top states from accepted ID scans</p>
        {data.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No scan data tonight.</p>
        ) : (
            <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
                <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis type="category" dataKey="state" tick={{ fill: '#9ca3af', fontSize: 12 }} width={70} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0,3,3,0]} />
                </BarChart>
            </ResponsiveContainer>
        )}
    </div>
);

const VenueContribution = ({ data }: { data: { name: string; count: number }[] }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="text-lg mb-1">Venue Contribution</div>
        <p className="text-xs text-gray-500 mb-4">Entries by venue</p>
        {data.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No entry data tonight.</p>
        ) : (
            <ResponsiveContainer width="100%" height={data.length * 52 + 20}>
                <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={100} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0,3,3,0]} />
                </BarChart>
            </ResponsiveContainer>
        )}
    </div>
);
```

**Step 3: Place in JSX after heatmap**

```tsx
{/* Location Distribution + Venue Contribution - Row 6 */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <LocationDistribution data={locationData} />
    <VenueContribution data={venueContribData} />
</div>
```

**Step 4: Commit**

```bash
git add app/(authenticated)/dashboard/page.tsx
git commit -m "feat(dashboard): add location distribution and venue contribution charts"
```

---

## Task 7: Dashboard — Traffic Flow + Operational Workflow

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

**Context:** Two panels. `TrafficFlow` shows a processing funnel (metric rows with proportional colored bars) + area distribution (% of entries per non-VENUE_DOOR area). `OperationalWorkflow` is a purely static styled diagram — no data, no charts.

**Step 1: Add area distribution memo**

```typescript
const areaDistribData = useMemo(() => {
    const counts: Record<string, number> = {};
    todayEvents
        .filter(e => e.delta > 0 && e.area_id)
        .forEach(e => { counts[e.area_id] = (counts[e.area_id] ?? 0) + e.delta; });
    const totalIn = Object.values(counts).reduce((s, v) => s + v, 0);
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([areaId, count]) => ({
            name: areaMap[areaId] ?? 'Unknown',
            count,
            pct: totalIn > 0 ? Math.round((count / totalIn) * 100) : 0,
        }));
}, [todayEvents, areaMap]);
```

**Step 2: Add `TrafficFlow` inline component**

```typescript
const TrafficFlow = ({
    totalEntries, totalScans, accepted, denied, banned, netOcc, areaDistrib,
}: {
    totalEntries: number; totalScans: number; accepted: number;
    denied: number; banned: number; netOcc: number;
    areaDistrib: { name: string; count: number; pct: number }[];
}) => {
    const max = Math.max(totalEntries, 1);
    const funnelRows = [
        { label: 'Total Entries', value: totalEntries, color: 'bg-indigo-500', textColor: 'text-white' },
        { label: 'IDs Scanned', value: totalScans, color: 'bg-indigo-400', textColor: 'text-white' },
        { label: 'Accepted', value: accepted, color: 'bg-emerald-500', textColor: 'text-emerald-300' },
        { label: 'Denied', value: denied, color: 'bg-orange-500', textColor: 'text-orange-300' },
        { label: 'Banned', value: banned, color: 'bg-red-500', textColor: 'text-red-300' },
        { label: 'Net Occupancy', value: netOcc, color: 'bg-cyan-500', textColor: 'text-cyan-300' },
    ];
    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="text-lg mb-1">Traffic Flow</div>
            <p className="text-xs text-gray-500 mb-4">Where your traffic is concentrated</p>

            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Processing Funnel</p>
            <div className="space-y-2 mb-6">
                {funnelRows.map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-400 shrink-0">{row.label}</div>
                        <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                            <div
                                className={cn('h-full rounded transition-all', row.color)}
                                style={{ width: `${(row.value / max) * 100}%` }}
                            />
                        </div>
                        <div className={cn('w-8 text-right text-sm font-medium', row.textColor)}>{row.value}</div>
                    </div>
                ))}
            </div>

            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Area Distribution</p>
            <div className="space-y-2">
                {areaDistrib.length === 0 && <p className="text-xs text-gray-600 italic">No entries yet.</p>}
                {areaDistrib.map(a => (
                    <div key={a.name} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-400 truncate shrink-0">{a.name}</div>
                        <div className="flex-1 h-5 bg-gray-800 rounded overflow-hidden">
                            <div className="h-full bg-purple-600 rounded" style={{ width: `${a.pct}%` }} />
                        </div>
                        <div className="w-10 text-right text-xs text-gray-400">{a.pct}%</div>
                    </div>
                ))}
            </div>
        </div>
    );
};
```

**Step 3: Add `OperationalWorkflow` static component**

```typescript
const WorkflowNode = ({ label, icon, color }: { label: string; icon: string; color: string }) => (
    <div className={cn('px-3 py-2 rounded-lg border text-xs text-center min-w-[90px]', color)}>
        <span className="mr-1">{icon}</span>{label}
    </div>
);

const OperationalWorkflow = () => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="text-lg mb-1">Operational Workflow</div>
        <p className="text-xs text-gray-500 mb-6">How the system updates in real time</p>
        <div className="flex flex-col items-center gap-3 select-none">
            {/* Top row */}
            <div className="flex items-center gap-2">
                <WorkflowNode label="ID Scan" icon="🪪" color="border-gray-600 bg-gray-800 text-gray-200" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Verify" icon="✓" color="border-emerald-800 bg-emerald-900/30 text-emerald-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Ban Check" icon="🛡" color="border-amber-800 bg-amber-900/30 text-amber-300" />
            </div>
            {/* Arrow down */}
            <div className="text-gray-600 text-lg">↓</div>
            {/* Middle row */}
            <div className="flex items-center gap-8">
                <WorkflowNode label="✓ Accept" icon="" color="border-emerald-700 bg-emerald-900/40 text-emerald-300" />
                <WorkflowNode label="✗ Deny" icon="" color="border-red-700 bg-red-900/40 text-red-300" />
            </div>
            {/* Arrow down */}
            <div className="text-gray-600 text-lg">↓</div>
            {/* Bottom row */}
            <div className="flex items-center gap-2">
                <WorkflowNode label="Add to Count" icon="📊" color="border-blue-800 bg-blue-900/30 text-blue-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Event Log" icon="📋" color="border-purple-800 bg-purple-900/30 text-purple-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Reports" icon="📈" color="border-indigo-800 bg-indigo-900/30 text-indigo-300" />
            </div>
        </div>
    </div>
);
```

**Step 4: Place in JSX**

```tsx
{/* Traffic Flow + Operational Workflow - Row 7 */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <TrafficFlow
        totalEntries={totalEntries}
        totalScans={totalScans}
        accepted={totalScans - deniedCount}
        denied={deniedCount}
        banned={activeBansCount}
        netOcc={liveOccupancy}
        areaDistrib={areaDistribData}
    />
    <OperationalWorkflow />
</div>
```

**Step 5: Commit**

```bash
git add app/(authenticated)/dashboard/page.tsx
git commit -m "feat(dashboard): add traffic flow funnel and operational workflow"
```

---

## Task 8: Dashboard — Live Venues Cards

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

**Context:** A grid of cards, one per venue. Each card shows: venue name, occupancy (from VENUE_DOOR area), capacity (from `venue.total_capacity` or sum of area capacities), % full, and tonight's entries/exits totals for that venue. Import `MapPin` from lucide-react.

**Step 1: Add `MapPin` to lucide imports**

In the existing import line, add `MapPin`:
```typescript
import { Users, TrendingUp, ScanLine, ShieldBan, Calendar, RefreshCw, Download, MapPin } from 'lucide-react';
```

**Step 2: Add live venues memo**

```typescript
const liveVenuesData = useMemo(() => {
    return venues.map(venue => {
        const venueAreas = areas.filter(a => a.venue_id === venue.id);
        const doorArea = venueAreas.find(a => a.area_type === 'VENUE_DOOR');
        const occupancy = doorArea?.current_occupancy ?? 0;
        const capacity = venue.total_capacity ?? null;
        const pctFull = capacity && capacity > 0 ? Math.round((occupancy / capacity) * 100) : null;

        const venueEvents = todayEvents.filter(e => e.venue_id === venue.id);
        const venueEntries = venueEvents.filter(e => e.delta > 0).reduce((s, e) => s + e.delta, 0);
        const venueExits = venueEvents.filter(e => e.delta < 0).reduce((s, e) => s + Math.abs(e.delta), 0);
        const areaCount = venueAreas.filter(a => a.area_type !== 'VENUE_DOOR' && a.is_active).length;

        return { venue, occupancy, capacity, pctFull, venueEntries, venueExits, areaCount };
    });
}, [venues, areas, todayEvents]);
```

**Step 3: Add `LiveVenues` component**

```typescript
const LiveVenues = ({ data }: { data: typeof liveVenuesData }) => {
    const router = useRouter();
    if (data.length === 0) return null;
    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-lg">Live Venues</span>
                </div>
                <button
                    onClick={() => router.push('/areas')}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                >
                    View all →
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.map(({ venue, occupancy, capacity, pctFull, venueEntries, venueExits, areaCount }) => (
                    <div key={venue.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <p className="font-medium text-white">{venue.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{areaCount} area{areaCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-semibold text-white">{occupancy}</p>
                                {capacity && <p className="text-xs text-gray-500">of {capacity}</p>}
                            </div>
                        </div>
                        {pctFull !== null && (
                            <div className="mb-3">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>{pctFull}% full</span>
                                </div>
                                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all',
                                            pctFull >= 90 ? 'bg-red-500' :
                                            pctFull >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                        )}
                                        style={{ width: `${Math.min(100, pctFull)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        <div className="flex gap-3 text-xs">
                            <span className="text-emerald-400">+{venueEntries}</span>
                            <span className="text-red-400">-{venueExits}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
```

**Step 4: Place in JSX at the bottom**

```tsx
{/* Live Venues - Row 8 */}
<LiveVenues data={liveVenuesData} />
```

**Step 5: Verify in browser**

Venue cards appear at the bottom. Each shows occupancy, capacity bar, entries/exits. Clicking "View all" navigates to `/areas`.

**Step 6: Final commit**

```bash
git add app/(authenticated)/dashboard/page.tsx
git commit -m "feat(dashboard): add live venues cards section"
```

---

## Final Verification

Open the dashboard and confirm all 8 rows are visible:
1. KPI cards (existing)
2. Age Distribution + Live Event Log (existing)
3. Gender Breakdown (full-width bar)
4. Hourly Traffic + Occupancy Over Time (2-column charts)
5. Peak Times Heatmap (full-width grid)
6. Location Distribution + Venue Contribution (2-column bars)
7. Traffic Flow + Operational Workflow (2-column)
8. Live Venues (card grid)

Check browser console for errors. Verify heatmap skeleton disappears after load.
