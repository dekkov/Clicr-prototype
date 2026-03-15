# CLICR V4 — Architecture Guide

## 1. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js 16 (App Router) | Client + Server components |
| **Language** | TypeScript | Strict mode |
| **Styling** | Tailwind CSS 4 | Utility-first |
| **State** | React Context + `useApp()` hook | Currently tightly coupled to store.tsx |
| **Animations** | Framer Motion | Page transitions, modals |
| **Charts** | Recharts | Reporting visualizations |
| **Auth** | Supabase Auth | Email/password |
| **Database** | Supabase (Postgres) | With RPCs for atomic ops |
| **Realtime** | Supabase Realtime | Channel-based subscriptions |
| **Export** | jsPDF + xlsx | PDF/Excel report generation |
| **Scanning** | html5-qrcode | Camera-based barcode/ID reading |

---

## 2. App Route Map

```
app/
├── layout.tsx              # Root layout (Providers, fonts, nav)
├── page.tsx                # Landing/redirect
├── globals.css             # Tailwind + custom tokens
│
├── login/                  # Auth pages
│   └── page.tsx            # Login form
├── signup/
│   └── page.tsx            # Registration
├── auth/
│   └── callback/route.ts   # Supabase OAuth callback
│
├── onboarding/             # First-run wizard
│   ├── page.tsx            # Step-by-step setup
│   ├── actions.ts          # Server actions
│   ├── client-steps.tsx    # Client-side step UI
│   ├── signup/page.tsx     # Inline signup
│   └── verify-email/page.tsx
│
├── demo/                   # Interactive demo (marketing)
│   └── page.tsx            # Self-contained demo experience
│
├── (authenticated)/        # Protected routes (layout applies auth check)
│   ├── layout.tsx          # Auth guard wrapper
│   ├── dashboard/page.tsx  # Main dashboard
│   ├── businesses/
│   │   └── new/page.tsx    # Create new business
│   ├── venues/
│   │   ├── page.tsx        # Venue list
│   │   ├── new/page.tsx    # Create venue
│   │   └── [venueId]/page.tsx
│   ├── areas/
│   │   ├── page.tsx        # Area list
│   │   └── [id]/page.tsx   # Area detail + device management
│   ├── clicr/
│   │   ├── page.tsx        # Device list
│   │   └── [id]/page.tsx   # Counter UI
│   ├── scanner/page.tsx    # ID scanning
│   ├── banning/
│   │   ├── page.tsx        # Ban list
│   │   └── new/page.tsx    # Create ban
│   ├── reports/
│   │   ├── page.tsx        # Report hub
│   │   └── [venueId]/page.tsx
│   ├── guests/page.tsx     # Guest directory (from scans)
│   ├── settings/
│   │   ├── page.tsx        # Business settings
│   │   ├── team/page.tsx   # Team management
│   │   └── bans/page.tsx   # Ban policies
│   ├── support/page.tsx    # Help desk
│   ├── devices/
│   │   └── provision/page.tsx
│   └── debug/              # Dev-only debug panels
│       └── context/page.tsx
│
├── board/
│   └── [id]/[token]/page.tsx   # Board view (multi-counter tiles)
├── tap/
│   └── [token]/page.tsx        # Quick-tap view
│
├── api/
│   ├── sync/route.ts           # GET: hydrate full state, POST: lean mutations → { success: true }
│   ├── tap/[token]/route.ts    # POST: tap event (device token auth)
│   ├── rpc/reset/route.ts      # POST: atomic reset RPC
│   ├── rpc/traffic/route.ts    # GET: traffic totals
│   ├── reports/aggregate/route.ts  # GET: server-side report aggregation
│   ├── reports/heatmap/route.ts    # GET: heatmap data
│   ├── auth/signout/route.ts   # POST: sign out
│   ├── log-error/route.ts      # POST: client error logging
│   ├── verify-id/route.ts      # POST: ID verification
│   └── admin/deploy-rpc/route.ts   # POST: admin RPC deploy
│
├── debug/                      # Top-level debug pages
│   ├── auth/page.tsx
│   └── onboarding-trace/page.tsx
│
└── qa/                         # QA utilities
```

---

## 3. State Model Overview

### Current Architecture (Prototype)

The prototype uses a **centralized React Context** (`AppProvider` in `lib/store.tsx`) that:

1. **On mount**: Fetches all data via `GET /api/sync`
2. **Every 30 seconds**: Safety-net polling via `GET /api/sync` (Channels handle realtime occupancy)
3. **On writes**: Sends `POST /api/sync` with action + payload → receives lean `{ success: true }`
4. **Post-mutation refresh**: Store calls `refreshState()` (GET) after successful CRUD writes
5. **Optimistic updates**: State is updated locally before server confirms
6. **Realtime**: Subscribes to Supabase `postgres_changes` on `areas` for live occupancy

The `/api/sync` route (`app/api/sync/route.ts`) separates reads from writes:
- **GET**: Reads from Supabase, hydrates derived fields, returns full state
- **POST**: Dispatches mutations, returns `{ success: true }` (no `buildSyncResponse()` call)

### Data Flow

```
UI Component → useApp() hook → AppProvider.recordEvent()
    ↓ (optimistic)                    ↓ (async)
setState(optimistic)          POST /api/sync { action: 'RECORD_EVENT', payload }
                                      ↓
                              Supabase RPCs and tables
                                      ↓
                              { success: true } → refreshState() triggers GET /api/sync
                                                  (hot path skips refresh; relies on Channels + polling)
```

---

## 4. DataClient + Adapter Strategy

### Architecture

```
UI Component → useApp() hook → AppProvider (lib/store.tsx)
                                     ↓
              ┌──────────────────────┼──────────────────────┐
              │ Demo Mode            │ Production Mode       │
              │ LocalAdapter         │ API Routes → Supabase │
              │ (localStorage)       │ (/api/sync, /api/rpc) │
              └──────────────────────┴──────────────────────┘
```

### Files

| File | Purpose |
|------|---------|
| `core/adapters/DataClient.ts` | The interface contract (TypeScript interface) |
| `core/adapters/LocalAdapter.ts` | In-memory/localStorage implementation (for demo) |

### Mode Switching

- **Demo**: `NEXT_PUBLIC_APP_MODE=demo` → `LocalAdapter` (no Supabase needed)
- **Production**: `NEXT_PUBLIC_APP_MODE=production` → API routes call Supabase directly via `lib/store.tsx`

---

## 5. Where to Plug Supabase

### Existing Supabase Touchpoints

| File | What it does |
|------|-------------|
| `lib/supabase.ts` | Creates browser Supabase client |
| `lib/supabase-admin.ts` | Creates server-side admin client (SECURITY DEFINER RPCs) |
| `lib/core/supabase.ts` | Getter for Supabase instance |
| `lib/core/mutations.ts` | RPC wrappers (applyDelta, resetCounts, etc.) |
| `lib/core/metrics.ts` | Report/traffic RPC wrappers |
| `lib/core/errors.ts` | Error logging to app_errors table |
| `lib/store.tsx` | Context provider with Supabase Realtime + polling |
| `app/api/sync/route.ts` | Main data proxy (state hydration + write dispatch) |

### What gets removed in production

- `data/db.json` and `lib/db.ts` have been removed; sync uses Supabase only

---

## 6. Realtime Strategy (Supabase Channels)

### Recommended Channels

| Channel | Table | Event | Use |
|---------|-------|-------|-----|
| `occupancy:{businessId}` | `areas` | UPDATE | Live occupancy across all dashboard views |
| `events:{businessId}` | `occupancy_events` | INSERT | Event log feed, recent activity |
| `scans:{businessId}` | `id_scans` | INSERT | Guest directory live feed |

### Implementation Pattern

```typescript
// In lib/store.tsx (AppProvider):
const channel = supabase
    .channel(`occupancy_${businessId}`)
    .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'areas',
        filter: `business_id=eq.${businessId}`
    }, (payload) => {
        // Update area occupancy from realtime snapshot
        lastRealtimeTsRef.current = Date.now();
    })
    .subscribe();

return () => supabase.removeChannel(channel);
```

### Debounce Strategy

- **Dashboard**: Debounce snapshot updates at 200ms (prevents UI flicker on rapid taps)
- **Counter View**: No debounce — show instant updates
- **Reports**: Don't use realtime — poll on focus or manual refresh
- **Event Log**: Throttle at 500ms, batch render new events

---

## 7. Key Design Decisions

1. **Optimistic + Server-confirmed**: All writes update UI immediately, then reconcile with server response. This is critical for the counter's responsive feel.

2. **RPCs for atomic operations**: `apply_occupancy_delta` uses `SELECT FOR UPDATE` row locking to prevent race conditions when two staff tap simultaneously.

3. **Since-reset window**: Reports use `last_reset_at` as the effective start time, not the current day. This lets operators decide when "today" starts.

4. **Soft deletes**: Devices use `deleted_at` instead of hard DELETE, preserving historical data integrity.

5. **Demo mode via LocalAdapter**: The prototype supports full offline development via `LocalAdapter` (localStorage). `data/db.json` and `lib/db.ts` have been removed — the sync route uses Supabase only in production mode.
