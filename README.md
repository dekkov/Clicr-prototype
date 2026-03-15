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

# 2. Run migrations via the Supabase SQL Editor:
#
#    OPTION A — Fresh install (4 files):
#      migrations-consolidated/001_schema.sql     → all 19 tables
#      migrations-consolidated/002_indexes.sql    → all indexes
#      migrations-consolidated/003_functions.sql  → helpers, triggers, RPCs
#      migrations-consolidated/004_rls.sql        → row-level security
#
#    OPTION B — Incremental (22 files, for existing databases):
#      migrations/001_schema.sql → ... → migrations/022_cleanup_dead_objects.sql

# 3. Enable Realtime on tables:
#    Dashboard → Database → Replication → Enable for:
#    areas, occupancy_events, id_scans

# 4. Update .env.local
NEXT_PUBLIC_APP_MODE=production
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 5. Build and deploy
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
├── migrations/                 # ★ Supabase DDL — incremental (001 → 022)
├── migrations-consolidated/    # ★ Supabase DDL — fresh install (4 files)
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

All data access goes through a `DataClient` interface. Demo mode uses `LocalAdapter` (localStorage). Production mode uses API routes (`/api/sync`, `/api/rpc/*`) that call Supabase directly.

| | `LocalAdapter` (Demo) | API Routes (Production) |
|---|---|---|
| **Mode** | `NEXT_PUBLIC_APP_MODE=demo` | `NEXT_PUBLIC_APP_MODE=production` |
| **Storage** | localStorage | Supabase (Postgres) |
| **Auth** | Stubbed (mock user) | Supabase Auth |
| **Realtime** | Polling | Supabase Channels + 30s safety-net polling |
| **Status** | ✅ Complete | ✅ Complete |

```typescript
// Demo mode uses the adapter directly:
import { getDataClient } from '@/core/adapters';
const client = getDataClient();

// Production mode uses API routes via AppContext:
const { recordEvent, resetCounts } = useApp();
```

### Data Model

```
Business (tenant)
└── Venue
    └── Area
        └── Clicr (counter device: IN_ONLY | OUT_ONLY | BIDIRECTIONAL)
```

Every tap creates an append-only event. Current occupancy is stored directly on `areas.current_occupancy`, updated atomically via the `apply_occupancy_delta` RPC — never with direct writes.

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
| **[docs/CODEBASE_AUDIT.md](docs/CODEBASE_AUDIT.md)** | You want a full feature/robustness/scalability assessment |
| **[docs/SUPABASE_IMPLEMENTATION.md](docs/SUPABASE_IMPLEMENTATION.md)** | You're working with Supabase tables, RPCs, or RLS |
| **[docs/INTEGRATION_MAP.md](docs/INTEGRATION_MAP.md)** | You need to know the store-to-DataClient method mapping |
| **[docs/REPORTING_FORMULAS.md](docs/REPORTING_FORMULAS.md)** | You're working on analytics or charts |
| **[docs/SECURITY.md](docs/SECURITY.md)** | You need auth, RLS, or API security details |
| **[docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md)** | You're testing or reviewing changes |

---

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
npm test          # Run all tests (184 tests across 25 suites)
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
