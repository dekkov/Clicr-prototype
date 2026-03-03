# CLICR V4

> Real-time occupancy tracking, ID scanning, and patron management for the hospitality industry.

CLICR replaces clunky standalone ID scanners and analog clickers with one connected platform — live communicated counters, Bluetooth ID scanning, and clean reporting, visible from anywhere.

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
#    migrations/001_schema.sql  → all tables
#    migrations/002_indexes.sql → performance indexes
#    migrations/003_rpcs.sql    → atomic stored procedures
#    migrations/004_rls.sql     → row-level security
#    (continue through 013_identity_hash.sql)

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
│   ├── board/                  # Board view
│   └── tap/                    # Quick-tap view
│
├── components/                 # Shared UI components
│   └── ui/                     # Base primitives (Button, Input, etc.)
│
├── core/                       # ★ Data layer abstraction
│   └── adapters/
│       ├── DataClient.ts       # Interface contract (read this first)
│       ├── LocalAdapter.ts     # Demo mode — localStorage (complete)
│       ├── SupabaseAdapter.ts  # Production mode (stub — implement this)
│       └── index.ts            # Factory function
│
├── lib/                        # Utilities
│   ├── types.ts                # TypeScript type definitions
│   ├── core/                   # Mutation/metric helpers
│   └── supabase.ts             # Supabase client factory
│
├── migrations/                 # ★ Supabase DDL (run in order, 001 → 013)
│
├── docs/                       # ★ Developer documentation
│   ├── PRODUCT_SPEC.md         # Roles, flows, data model
│   ├── ARCHITECTURE.md         # Routes, state, DataClient strategy
│   ├── SUPABASE_IMPLEMENTATION.md
│   ├── REPORTING_FORMULAS.md
│   ├── INTEGRATION_MAP.md      # Function-by-function replacement guide
│   └── QA_CHECKLIST.md
│
├── PRODUCT_SPEC.md             # Full product specification
├── DEVELOPER_HANDOFF.md        # Onboarding guide for new developers
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
        └── Clicr (communicated counter: IN_ONLY | OUT_ONLY | BIDIRECTIONAL)
```

Every tap creates an append-only `CountEvent`. Occupancy is derived from event replay, never stored as a mutable integer directly.

### Critical RPCs

| RPC | Why it matters |
|-----|----------------|
| `apply_occupancy_delta` | Row-locked atomic counting — prevents race conditions |
| `reset_area_counts` / `reset_venue_counts` | Transactional reset with audit log |
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
| **[DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md)** | You're a new developer getting started |
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
npm run db:push   # Push schema to Supabase
npm run db:pull   # Pull schema from Supabase
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
| Playwright | 1.58 | End-to-end tests |
