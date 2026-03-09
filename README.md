# CLICR V4

> Real-time occupancy tracking, ID scanning, and patron management for the hospitality industry.

CLICR replaces clunky standalone ID scanners and analog clickers with one connected platform — live counters, camera-based ID scanning, and clean reporting, visible from anywhere.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env.local

# 3. Start development server (demo mode — no Supabase needed)
npm run dev

# 4. Open http://localhost:3000
```

**Demo mode** uses `LocalAdapter` — all data lives in `localStorage`. No Supabase credentials required.

---

## Production Setup (Supabase)

```bash
# 1. Create a Supabase project at https://supabase.com

# 2. Run migrations in order via the Supabase SQL Editor:
#    migrations/001_schema.sql              → all tables
#    migrations/002_indexes.sql             → performance indexes
#    migrations/003_rpcs.sql                → atomic stored procedures
#    migrations/004_rls.sql                 → row-level security
#    migrations/005_fix_onboarding_rls.sql  → onboarding RLS fix
#    migrations/006_user_cascade_deletes.sql→ cascade deletes
#    migrations/007_fix_report_summary.sql  → report summary RPC fix
#    migrations/008_role_migration.sql      → roles + board_views table
#    migrations/009_area_shifts.sql         → area shift mode
#    migrations/010_member_assignments.sql  → member venue/area assignments
#    migrations/011_support_tickets.sql     → support tickets table
#    migrations/012_shifts.sql              → shifts table
#    migrations/013_identity_hash.sql       → identity token hashing
#    migrations/014_venue_door_area_type.sql→ VENUE_DOOR area type
#    migrations/015_heatmap_index.sql       → heatmap performance index
#    migrations/016_venue_counter_clicr.sql → venue counter clicr support

# 3. Enable Realtime on tables:
#    Dashboard → Database → Replication → Enable for:
#    occupancy_snapshots, occupancy_events, id_scans

# 4. Update .env.local
NEXT_PUBLIC_APP_MODE=production
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 5. Implement SupabaseAdapter methods (see docs/INTEGRATION_MAP.md)

# 6. Build and deploy
npm run build
```

---

## Project Structure

```
clicr-v4/
├── app/
│   ├── (authenticated)/        # Protected routes (requires auth)
│   │   ├── dashboard/          # Live occupancy overview
│   │   ├── venues/             # Venue management
│   │   ├── areas/              # Area management
│   │   ├── businesses/new/     # Create new business
│   │   ├── clicr/              # Clicr (counter) configuration
│   │   ├── devices/            # Device management
│   │   ├── scanner/            # ID scanner screen
│   │   ├── banning/            # Patron ban management
│   │   ├── guests/             # Guest history
│   │   ├── reports/            # Analytics & exports
│   │   ├── settings/           # Business & account settings
│   │   └── support/            # Support
│   ├── login/ signup/ auth/    # Authentication
│   ├── onboarding/             # First-run setup wizard
│   ├── demo/                   # Interactive marketing demo
│   ├── board/[id]/[token]/     # Board view (multi-counter tiles)
│   ├── tap/[token]/            # Quick-tap view
│   └── api/                    # API routes (tap, rpc, reports, sync)
│
├── components/                 # Shared UI components
│   ├── ui/                     # Base primitives (Button, Input, etc.)
│   ├── board/                  # Board view components
│   ├── layout/                 # AppLayout shell
│   └── wizards/                # Business/venue setup wizards
│
├── core/                       # ★ Data layer abstraction
│   └── adapters/
│       ├── DataClient.ts       # Interface contract (read this first)
│       ├── LocalAdapter.ts     # Demo mode — localStorage (complete)
│       ├── SupabaseAdapter.ts  # Production mode (stub — implement this)
│       └── index.ts            # Factory function
│
├── lib/                        # Utilities & services
│   ├── types.ts                # TypeScript type definitions
│   ├── store.tsx               # AppContext + useApp() global state
│   ├── permissions.ts          # RBAC helpers (hasMinRole)
│   ├── aamva.ts                # Driver's license PDF417 parsing
│   ├── realtime-manager.ts     # Supabase Channels subscriptions
│   ├── sync-data.ts            # Initial state hydration
│   ├── supabase.ts             # Supabase browser client
│   ├── supabase-admin.ts       # Supabase server/admin client
│   └── core/                   # Mutation & metric RPC wrappers
│
├── supabase/                   # Supabase config & manual SQL helpers
│
├── migrations/                 # ★ Supabase DDL (run in order, 001 → 016)
│
├── docs/                       # ★ Developer documentation
│   ├── PRODUCT_SPEC.md         # Roles, flows, data model
│   ├── ARCHITECTURE.md         # Routes, state, DataClient strategy
│   ├── SUPABASE_IMPLEMENTATION.md  # Supabase setup & patterns
│   ├── REPORTING_FORMULAS.md   # Analytics calculation formulas
│   ├── INTEGRATION_MAP.md      # Function-by-function replacement guide
│   └── QA_CHECKLIST.md         # Manual testing scenarios
│
└── .env.example
```

---

## Key Concepts

### DataClient Pattern

All data access goes through a single `DataClient` interface. Two implementations exist:

| | `LocalAdapter` | `SupabaseAdapter` |
|---|---|---|
| **Mode** | `NEXT_PUBLIC_APP_MODE=demo` | `NEXT_PUBLIC_APP_MODE=production` |
| **Storage** | localStorage | Supabase (Postgres) |
| **Auth** | Stubbed (mock user) | Supabase Auth |
| **Realtime** | Polling | Supabase Channels |
| **Status** | ✅ Complete | 📝 Stub — implement all methods |

```typescript
import { getDataClient } from '@/core/adapters';

// Automatically selects adapter based on NEXT_PUBLIC_APP_MODE
const client = getDataClient();

// Same API regardless of backend:
const result = await client.applyOccupancyDelta({
    businessId, venueId, areaId,
    delta: +1, source: 'manual'
});
```

### Data Model

```
Business (tenant)
└── Venue
    └── Area
        └── Clicr (counter device: IN_ONLY | OUT_ONLY | BIDIRECTIONAL)
```

Every tap creates an append-only event. Current occupancy is stored in `occupancy_snapshots` but only ever updated atomically via the `apply_occupancy_delta` RPC — never with direct writes.

### Critical RPCs

| RPC | Why it matters |
|-----|----------------|
| `apply_occupancy_delta` | Row-locked atomic counting — prevents race conditions |
| `reset_counts(scope)` | Transactional reset with audit log — scope: area, venue, or all |
| `get_report_summary` | Server-side aggregation — don't transfer raw events to client |

### RLS (Row-Level Security)

Every table is locked to the authenticated user's business membership:
```sql
CREATE POLICY venues_select ON venues FOR SELECT
    USING (is_member_of(business_id));
```

---

## Documentation Index

| Document | Read when... |
|----------|-------------|
| **[docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)** | You need to understand what the product does |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | You need to understand how the code is structured |
| **[docs/SUPABASE_IMPLEMENTATION.md](docs/SUPABASE_IMPLEMENTATION.md)** | You're implementing the SupabaseAdapter |
| **[docs/INTEGRATION_MAP.md](docs/INTEGRATION_MAP.md)** | You need to know which functions to replace |
| **[docs/REPORTING_FORMULAS.md](docs/REPORTING_FORMULAS.md)** | You're working on analytics or charts |
| **[docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md)** | You're testing or reviewing changes |

---

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
```

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.1.6 | App Router, React Server Components |
| React | 19.2.3 | UI framework |
| TypeScript | 5.x | Type safety (strict mode) |
| Tailwind CSS | 4.x | Styling |
| Supabase JS | 2.93.3 | Database, auth, realtime |
| Framer Motion | 12.x | Animations |
| Recharts | 3.7 | Charts & analytics |
| jsPDF + xlsx | latest | PDF and Excel exports |
| html5-qrcode | 2.3.8 | Camera-based ID scanning |
| Resend | 6.x | Transactional email |
| Lucide React | 0.563 | Icons |
