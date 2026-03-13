# Scan Label Picker + Location Metrics Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After an accepted ID scan, show a label picker overlay so the user chooses which counter label to attribute the entry to, and add state/city location charts to the dashboard.

**Architecture:** Extend the existing `ScannerResult` component with optional label picker props. Modify both scan paths in `ClicrPanel` to defer `recordEvent` until a label is chosen. Add two new dashboard components (`StateBreakdown`, `CityBreakdown`) following the existing `GenderBreakdown` pattern.

**Tech Stack:** React 19, TypeScript 5, Tailwind CSS 4, Lucide React

**Spec:** `docs/superpowers/specs/2026-03-13-scan-label-picker-location-metrics-design.md`

---

## Chunk 1: ScannerResult Label Picker

### Task 1: Add label picker to ScannerResult component

**Files:**
- Modify: `lib/ui/components/ScannerResult.tsx`

- [ ] **Step 1: Add CounterLabel import and new props to ScannerResultProps**

Add the `CounterLabel` type import and extend the props interface:

```tsx
// At the top, add import
import type { CounterLabel } from '@/lib/types';

// Extend the interface
interface ScannerResultProps {
    status: ScanStatus;
    data: {
        name: string;
        age: number;
        dob: string;
        exp: string;
        photoUrl?: string;
    };
    onScanNext: () => void;
    labels?: CounterLabel[];
    onLabelSelect?: (labelId: string) => void;
}
```

- [ ] **Step 2: Suppress auto-dismiss when labels are present**

In the `ScannerResult` component, compute whether label picker should show, and gate the auto-dismiss effect:

```tsx
export function ScannerResult({ status, data, onScanNext, labels, onLabelSelect }: ScannerResultProps) {
    const isAllowed = status === 'ALLOWED';
    const hasLabels = isAllowed && labels && labels.length > 0 && onLabelSelect;
    const bgColor = isAllowed ? tokens.colors.status.allowed : tokens.colors.status.denied;

    // Auto-dismiss + countdown for ALLOWED (only when no labels to pick)
    const [progress, setProgress] = useState(100);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onScanNextRef = useRef(onScanNext);
    onScanNextRef.current = onScanNext;

    useEffect(() => {
        if (!isAllowed || hasLabels) return;  // <-- added hasLabels check
        const startTime = Date.now();
        intervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
            setProgress(remaining);
            if (remaining === 0) {
                clearInterval(intervalRef.current!);
                onScanNextRef.current();
            }
        }, 30);
        return () => clearInterval(intervalRef.current!);
    }, [isAllowed, hasLabels]);
```

- [ ] **Step 3: Add label button grid in the bottom card**

Replace the action button section in the bottom card. When `hasLabels` is true, show label buttons instead of the countdown "Scan Next" button:

```tsx
                {/* Action Area */}
                <div className="relative">
                    {hasLabels ? (
                        <>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">SELECT CATEGORY</span>
                            <div className={cn(
                                "grid gap-3",
                                labels!.length <= 3 ? "grid-cols-1" : "grid-cols-2",
                                labels!.length > 6 && "max-h-48 overflow-y-auto"
                            )}>
                                {labels!.map((label, i) => {
                                    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'];
                                    const bg = colors[i % colors.length];
                                    return (
                                        <button
                                            key={label.id}
                                            onClick={() => onLabelSelect!(label.id)}
                                            className="w-full text-white font-bold text-lg py-4 rounded-xl active:scale-[0.97] transition-all shadow-lg"
                                            style={{ backgroundColor: bg }}
                                        >
                                            {label.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={onScanNext}
                                className="w-full bg-[#111827] text-white font-bold text-lg py-4 rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg overflow-hidden relative"
                            >
                                {isAllowed && (
                                    <span
                                        className="absolute inset-y-0 left-0 rounded-xl transition-none"
                                        style={{
                                            width: `${progress}%`,
                                            backgroundColor: 'rgba(0,200,83,0.25)',
                                            transition: 'width 30ms linear',
                                        }}
                                    />
                                )}
                                <span className="relative z-10">Scan Next</span>
                            </button>
                            {isAllowed && (
                                <p className="text-center text-xs text-slate-400 mt-2">
                                    Auto-dismissing in {Math.ceil((progress / 100) * (AUTO_DISMISS_MS / 1000))}s
                                </p>
                            )}
                        </>
                    )}
                </div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile (no errors)

- [ ] **Step 5: Commit**

```bash
git add lib/ui/components/ScannerResult.tsx
git commit -m "feat: add label picker to ScannerResult overlay"
```

---

### Task 2: Fix API scan path and defer recordEvent in ClicrPanel

**Files:**
- Modify: `app/(authenticated)/clicr/[id]/ClicrPanel.tsx`

- [ ] **Step 1: Fix API scan path to populate demographics and call recordScan**

In `processScan()`, the API path (starting at line 383) creates a minimal scan event. Replace the scan event creation and handling inside the `if (json.success)` block (lines 397-427):

```tsx
                if (json.success) {
                    const { status, message, age } = json.data;
                    const scanEvent: Omit<IDScanEvent, 'id' | 'timestamp'> = {
                        venue_id: venueId,
                        scan_result: status,
                        age: age || parsed.age || 0,
                        age_band: (age || parsed.age || 0) >= 21 ? '21+' : 'Under 21',
                        sex: parsed.sex || 'U',
                        zip_code: parsed.postalCode || '00000',
                        first_name: parsed.firstName || undefined,
                        last_name: parsed.lastName || undefined,
                        dob: parsed.dateOfBirth || undefined,
                        id_number: parsed.idNumber || undefined,
                        issuing_state: parsed.state || undefined,
                        address_street: parsed.addressStreet || undefined,
                        city: parsed.city || undefined,
                    };
                    recordScan(scanEvent);
                    setLastScan({ ...scanEvent, id: 'temp', timestamp: Date.now(), uiMessage: message } as any);
                    if (status === 'ACCEPTED') {
                        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
                        if (addToCountOnAccept && clicr?.id) {
                            const aId = isVenueCounter ? null : (clicr.area_id || null);
                            if (activeLabels.length === 0) {
                                recordEvent({
                                    venue_id: venueId,
                                    area_id: aId,
                                    clicr_id: clicr.id,
                                    delta: 1,
                                    flow_type: 'IN',
                                    event_type: 'SCAN',
                                    idempotency_key: Math.random().toString(36),
                                });
                            }
                            // If labels exist, recordEvent is deferred — ScannerResult will call onLabelSelect
                        }
                    } else {
                        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                    }
                    setShowCameraScanner(false);
                    return;
                }
```

- [ ] **Step 2: Defer recordEvent in local fallback path when labels exist**

In the local fallback path (starting at line 455), wrap the `recordEvent` call so it only fires when there are NO active labels:

```tsx
        if (result.status === 'ACCEPTED') {
            if (addToCountOnAccept) {
                if (!clicr?.id) return;
                const aId = isVenueCounter ? null : (clicr.area_id || null);
                if (activeLabels.length === 0) {
                    recordEvent({
                        venue_id: venueId,
                        area_id: aId,
                        clicr_id: clicr.id,
                        delta: 1,
                        flow_type: 'IN',
                        event_type: 'SCAN',
                        idempotency_key: Math.random().toString(36),
                    });
                }
                // If labels exist, recordEvent is deferred — ScannerResult will call onLabelSelect
                if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
            } else {
                if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
            }
        } else {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        setShowCameraScanner(false);
```

- [ ] **Step 3: Add onLabelSelect callback and pass labels to ScannerResult**

Create a callback and update the ScannerResult usage in the overlay section (~line 945):

```tsx
    // Add this callback before the return statement, near other handlers
    const handleScanLabelSelect = (labelId: string) => {
        if (!lastScan || !clicr?.id || !venueId) return;
        const aId = isVenueCounter ? null : (clicr.area_id || null);
        recordEvent({
            venue_id: venueId,
            area_id: aId,
            clicr_id: clicr.id,
            delta: 1,
            flow_type: 'IN',
            counter_label_id: labelId,
            event_type: 'SCAN',
            idempotency_key: Math.random().toString(36),
        });
        setLastScan(null);
    };
```

Update the ScannerResult usage in the overlay (~line 945):

```tsx
                        <ScannerResult
                            status={
                                lastScan.scan_result === 'ACCEPTED' ? 'ALLOWED' :
                                    (lastScan as any).uiMessage?.includes('BANNED') ? 'DENIED_BANNED' :
                                        (lastScan as any).uiMessage?.includes('EXPIRED') ? 'DENIED_EXPIRED' :
                                            'DENIED_UNDERAGE'
                            }
                            data={{
                                name: `${lastScan.first_name || 'GUEST'} ${lastScan.last_name || ''}`,
                                age: lastScan.age || 0,
                                dob: lastScan.dob || 'Unknown',
                                exp: 'Valid',
                            }}
                            onScanNext={() => setLastScan(null)}
                            labels={addToCountOnAccept && lastScan.scan_result === 'ACCEPTED' ? activeLabels : undefined}
                            onLabelSelect={handleScanLabelSelect}
                        />
```

Key: labels are only passed when `addToCountOnAccept` is ON and scan is ACCEPTED. Otherwise the existing auto-dismiss behavior applies.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile (no errors)

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
Test scenarios:
1. Clicr WITH labels → scan accepted → label buttons appear, no auto-dismiss → tap label → count recorded, overlay dismissed
2. Clicr WITHOUT labels → scan accepted → auto-dismiss after 3s as before
3. Clicr with `addToCountOnAccept` OFF → scan accepted → auto-dismiss, no label picker, no count event
4. Scan denied → no label picker, denial overlay as before

- [ ] **Step 6: Commit**

```bash
git add "app/(authenticated)/clicr/[id]/ClicrPanel.tsx"
git commit -m "feat: defer count event until label picked after accepted scan"
```

---

## Chunk 2: Dashboard Location Metrics

### Task 3: Add StateBreakdown and CityBreakdown to dashboard

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

- [ ] **Step 1: Add the StateBreakdown component**

Add this component definition after the `GenderBreakdown` component (after ~line 114), before `HourlyTraffic`:

```tsx
const STATE_PALETTE = ['bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-rose-500', 'bg-sky-500'];

const StateBreakdown = ({ scanEvents }: { scanEvents: IDScanEvent[] }) => {
    const accepted = scanEvents.filter(s => s.scan_result === 'ACCEPTED' && (s.issuing_state || s.state));
    const total = accepted.length;

    const counts: Record<string, number> = {};
    accepted.forEach(s => {
        const st = (s.issuing_state || s.state || '').toUpperCase();
        if (st) counts[st] = (counts[st] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const top5 = sorted.slice(0, 5);
    const otherCount = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
    if (otherCount > 0) top5.push(['Other', otherCount]);

    return (
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg">ID State</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Where patrons' IDs are from tonight</p>
            {total === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">No scan data yet.</p>
            ) : (
                <>
                    <div className="flex h-4 rounded-full overflow-hidden mb-3">
                        {top5.map(([name, count], i) => (
                            <div key={name} className={`${STATE_PALETTE[i % STATE_PALETTE.length]} transition-all`} style={{ width: `${(count / total) * 100}%` }} />
                        ))}
                    </div>
                    <div className="flex items-center gap-6 text-sm flex-wrap">
                        {top5.map(([name, count], i) => (
                            <span key={name} className="flex items-center gap-1.5">
                                <span className={`w-2.5 h-2.5 rounded-full ${STATE_PALETTE[i % STATE_PALETTE.length]} inline-block`} />
                                {name} <span className="text-foreground ml-1">{Math.round((count / total) * 100)}%</span>
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Add the CityBreakdown component**

Add immediately after `StateBreakdown`:

```tsx
const CityBreakdown = ({ scanEvents }: { scanEvents: IDScanEvent[] }) => {
    const accepted = scanEvents.filter(s => s.scan_result === 'ACCEPTED' && s.city);
    const counts: Record<string, number> = {};
    accepted.forEach(s => {
        const raw = (s.city || '').trim();
        if (!raw) return;
        // Title case: "SPRINGFIELD" → "Springfield"
        const city = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        counts[city] = (counts[city] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const top5 = sorted.slice(0, 5);
    const otherCount = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
    if (otherCount > 0) top5.push(['Other', otherCount]);
    const maxCount = top5.length > 0 ? top5[0][1] as number : 0;

    return (
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg">City</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Top cities from accepted scans tonight</p>
            {top5.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">No scan data yet.</p>
            ) : (
                <div className="space-y-3">
                    {top5.map(([city, count]) => (
                        <div key={city} className="flex items-center gap-4">
                            <div className="w-20 text-sm text-muted-foreground truncate">{city}</div>
                            <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-teal-600 to-teal-500 rounded-lg transition-all"
                                    style={{ width: `${maxCount > 0 ? ((count as number) / maxCount) * 100 : 0}%` }}
                                />
                            </div>
                            <div className="w-10 text-right text-sm">{count}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 3: Add the location metrics grid to the dashboard render**

Insert immediately after the Gender Breakdown line (~line 1134):

```tsx
            {/* Gender Breakdown */}
            {isToday && <GenderBreakdown scanEvents={todayScanEvents} />}

            {/* Location Metrics */}
            {isToday && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <StateBreakdown scanEvents={todayScanEvents} />
                <CityBreakdown scanEvents={todayScanEvents} />
            </div>}

            {/* Hourly Traffic + Occupancy Over Time */}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compile (no errors)

- [ ] **Step 5: Commit**

```bash
git add "app/(authenticated)/dashboard/page.tsx"
git commit -m "feat: add state and city location breakdown to dashboard"
```
