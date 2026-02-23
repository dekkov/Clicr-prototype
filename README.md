# CLICR V4 — Developer Handoff

> Real-time occupancy tracking, ID scanning, patron banning, and venue analytics for the hospitality industry.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env.local

# 3. Start development server (demo mode - no Supabase needed)
npm run dev

# 4. Open http://localhost:3000
```

**Demo mode** uses the `LocalAdapter` — all data lives in `localStorage`. No Supabase credentials required.

---

## Production Setup (Supabase)

```bash
# 1. Create a Supabase project at https://supabase.com

# 2. Run migrations in order
supabase db push --file migrations/001_schema.sql
supabase db push --file migrations/002_indexes.sql
supabase db push --file migrations/003_rpcs.sql
supabase db push --file migrations/004_rls.sql

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
├── app/                        # Next.js App Router pages
│   ├── (authenticated)/        # Protected routes (dashboard, venues, reports, etc.)
│   ├── api/sync/               # Data proxy route (to be replaced by DataClient)
│   ├── demo/                   # Interactive marketing demo
│   ├── login/                  # Authentication
│   └── onboarding/             # First-run wizard
│
├── components/                 # Shared UI components
│
├── core/                       # ★ Data layer abstraction
│   └── adapters/
│       ├── DataClient.ts       # Interface contract (the single source of truth)
│       ├── LocalAdapter.ts     # Demo mode (localStorage)
│       └── SupabaseAdapter.ts  # Production mode (stub — implement this)
│
├── lib/                        # Current prototype utilities
│   ├── store.tsx               # Zustand-based state (to be refactored)
│   ├── types.ts                # TypeScript type definitions
│   ├── core/                   # Mutation/metric helpers (absorb into adapters)
│   └── supabase.ts             # Supabase client factory
│
├── data/
│   └── db.json                 # Demo fixture data
│
├── docs/                       # ★ Developer documentation
│   ├── PRODUCT_SPEC.md         # Roles, flows, definitions
│   ├── ARCHITECTURE.md         # Routes, state, DataClient strategy
│   ├── SUPABASE_IMPLEMENTATION.md  # Tables, RLS, RPCs, reset logic
│   ├── REPORTING_FORMULAS.md   # Exact calculation logic
│   ├── INTEGRATION_MAP.md      # Function-by-function replacement guide
│   └── QA_CHECKLIST.md         # Manual testing scenarios
│
├── migrations/                 # ★ Supabase DDL (run in order)
│   ├── 001_schema.sql          # 16 tables with constraints
│   ├── 002_indexes.sql         # Performance indexes
│   ├── 003_rpcs.sql            # Atomic stored procedures
│   └── 004_rls.sql             # Row-level security policies
│
├── .env.example                # Environment variable template
├── package.json
└── README.md                   # This file
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
| **Status** | ✅ Complete | 📝 Stub (implement all methods) |

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

### Critical RPCs

| RPC | Why it matters |
|-----|---------------|
| `apply_occupancy_delta` | Row-locked atomic counting. Prevents race conditions. |
| `reset_counts` | Multi-table transactional reset with audit logging. |
| `get_report_summary` | Server-side aggregation (don't transfer raw events to client). |

### RLS (Row-Level Security)

Every table is locked down. A user can only see data for businesses they're a member of:
```sql
CREATE POLICY venues_select ON venues FOR SELECT
    USING (is_member_of(business_id));
```

---

## Documentation Index

| Document | Read when... |
|----------|-------------|
| **[PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)** | You need to understand what the product does |
| **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** | You need to understand how the code is structured |
| **[SUPABASE_IMPLEMENTATION.md](docs/SUPABASE_IMPLEMENTATION.md)** | You're implementing the SupabaseAdapter |
| **[INTEGRATION_MAP.md](docs/INTEGRATION_MAP.md)** | You need to know which functions to replace |
| **[REPORTING_FORMULAS.md](docs/REPORTING_FORMULAS.md)** | You're working on analytics or charts |
| **[QA_CHECKLIST.md](docs/QA_CHECKLIST.md)** | You're testing or reviewing changes |

---

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run test     # Run tests
```

---

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS 4**
- **Supabase** (Postgres + Auth + Realtime)
- **Zustand** (state management, to be refactored)
- **Framer Motion** (animations)
- **Recharts** (charts)
- **jsPDF + xlsx** (export)
