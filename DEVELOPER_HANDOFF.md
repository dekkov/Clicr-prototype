# CLICR V4 — Developer Handoff Package

> **Date**: February 23, 2026  
> **Project**: CLICR V4 Prototype → Production  
> **Objective**: Connect the working Next.js prototype to Supabase for production data persistence  
> **Status**: Prototype fully functional in demo mode; Supabase schema designed and ready to deploy

---

## Table of Contents

1. [Quick Overview](#1-quick-overview)
2. [Access & Credentials](#2-access--credentials)
3. [Getting Started](#3-getting-started)
4. [Project Architecture](#4-project-architecture)
5. [Supabase Setup (CRITICAL — Do First)](#5-supabase-setup)
6. [What Needs to Be Built](#6-what-needs-to-be-built)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Key Files Reference](#8-key-files-reference)
9. [Documentation Index](#9-documentation-index)
10. [Testing](#10-testing)
11. [Known Constraints](#11-known-constraints)

---

## 1. Quick Overview

**CLICR** is a real-time occupancy tracking, ID scanning, and patron management platform for the hospitality industry (bars, nightclubs, event venues).

### What Already Works (Demo Mode)
- ✅ Full UI prototype with all screens
- ✅ Real-time occupancy counting (tap +1 / -1)
- ✅ ID scanning flow with patron data capture
- ✅ Ban management (create, search, enforce)
- ✅ Analytics & reporting dashboards
- ✅ Multi-venue/multi-area support
- ✅ Device management
- ✅ Onboarding wizard
- ✅ All data persists in `localStorage` via `LocalAdapter`

### What Needs to Be Built
- 🔲 `SupabaseAdapter` — implement all methods (stub exists with TODO comments)
- 🔲 Run Supabase migrations (SQL files provided, ready to execute)
- 🔲 Wire up Supabase Auth (sign up, login, password reset)
- 🔲 Enable Supabase Realtime subscriptions
- 🔲 Refactor UI components to use `DataClient` instead of Zustand store

---

## 2. Access & Credentials

### GitHub Repository
```
Repo:   harrison-ceo/clicr-v4
URL:    https://github.com/harrison-ceo/clicr-v4
Branch: main
```

### Supabase Project
```
Project Name:  clicr-v4
Project Ref:   apgussgbygxxnpvbssxs
Dashboard:     https://supabase.com/dashboard/project/apgussgbygxxnpvbssxs
Region:        (check dashboard)
```

### Supabase Credentials
> ⚠️ These will be provided separately via secure channel (not in this doc for security).
> The developer will need:
> - `NEXT_PUBLIC_SUPABASE_URL`
> - `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
> - `SUPABASE_SERVICE_ROLE_KEY`

### Environment File
A `.env.example` template exists in the repo. Copy it:
```bash
cp .env.example .env.local
# Then fill in the Supabase credentials
```

---

## 3. Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/harrison-ceo/clicr-v4.git
cd clicr-v4

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with Supabase credentials (see section 2)

# 4. Start in demo mode first (no Supabase needed)
# Make sure .env.local has: NEXT_PUBLIC_APP_MODE=demo
npm run dev

# 5. Open http://localhost:3000
# You should see the full working prototype with demo data
```

### Tech Stack
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.1.6 | App Router, RSC |
| React | 19.2.3 | UI framework |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| Supabase JS | 2.93.3 | Database, auth, realtime |
| Framer Motion | 12.x | Animations |
| Recharts | 3.7 | Charts/analytics |
| Lucide React | 0.563 | Icons |

---

## 4. Project Architecture

```
clicr-v4/
│
├── app/                            # Next.js App Router
│   ├── (authenticated)/            # Protected routes (requires auth)
│   │   ├── dashboard/              # Main dashboard with live occupancy
│   │   ├── venues/                 # Venue & area management
│   │   ├── devices/                # Device (clicr) management
│   │   ├── reports/                # Analytics & reporting
│   │   ├── scans/                  # ID scan history
│   │   ├── bans/                   # Ban management
│   │   ├── settings/               # Account settings
│   │   └── team/                   # Team/member management
│   ├── api/sync/                   # Data sync API route
│   ├── demo/                       # Marketing demo page
│   ├── login/                      # Auth screens
│   └── onboarding/                 # First-run setup wizard
│
├── components/                     # Shared React components
│   ├── ui/                         # Base UI primitives (Button, Input, etc.)
│   ├── dashboard/                  # Dashboard-specific components
│   └── ...                         # Feature components
│
├── core/                           # ★ DATA LAYER (your main work area)
│   └── adapters/
│       ├── DataClient.ts           # Interface contract (READ THIS FIRST)
│       ├── LocalAdapter.ts         # Working demo implementation (reference)
│       ├── SupabaseAdapter.ts      # ★ STUB — implement this
│       └── index.ts                # Barrel exports + factory function
│
├── lib/                            # Current prototype utilities
│   ├── store.tsx                   # Zustand store (to be replaced by DataClient)
│   ├── types.ts                    # TypeScript type definitions
│   ├── core/                       # Mutation/metric helpers
│   └── supabase.ts                 # Supabase client factory (already exists)
│
├── migrations/                     # ★ Supabase SQL (run these first)
│   ├── 001_schema.sql              # 16 tables with constraints
│   ├── 002_indexes.sql             # Performance indexes
│   ├── 003_rpcs.sql                # Stored procedures (atomic ops)
│   └── 004_rls.sql                 # Row Level Security policies
│
├── docs/                           # ★ Detailed documentation
│   ├── PRODUCT_SPEC.md             # Product spec, user roles, flows
│   ├── ARCHITECTURE.md             # Technical architecture deep-dive
│   ├── SUPABASE_IMPLEMENTATION.md  # Supabase-specific implementation guide
│   ├── REPORTING_FORMULAS.md       # Analytics calculation formulas
│   ├── INTEGRATION_MAP.md          # Function-by-function replacement guide
│   └── QA_CHECKLIST.md             # Manual testing scenarios
│
├── .env.example                    # Environment variable template
├── README.md                       # Project README
└── DEVELOPER_HANDOFF.md            # This file
```

### The DataClient Pattern (Critical Concept)

All data access flows through a single interface called `DataClient`:

```typescript
// core/adapters/DataClient.ts defines the contract
// core/adapters/index.ts has the factory:
import { getDataClient } from '@/core/adapters';

const client = getDataClient();
// Returns LocalAdapter when NEXT_PUBLIC_APP_MODE=demo
// Returns SupabaseAdapter when NEXT_PUBLIC_APP_MODE=production
```

**This is the clean swap mechanism.** The developer's job is to implement `SupabaseAdapter.ts` so that when `APP_MODE=production`, the app talks to Supabase instead of localStorage.

---

## 5. Supabase Setup (CRITICAL — Do First)

### Step 1: Run Migrations

The Supabase project already exists but needs the full schema deployed. Run these **in order** via the [Supabase SQL Editor](https://supabase.com/dashboard/project/apgussgbygxxnpvbssxs/sql/new):

| # | File | What It Does | Tables/Objects |
|---|---|---|---|
| 1 | `migrations/001_schema.sql` | Creates all 16 tables | businesses, business_members, venues, areas, devices, occupancy_snapshots, occupancy_events, id_scans, banned_persons, patron_bans, ban_audit_logs, ban_enforcement_events, turnarounds, audit_logs, app_errors, onboarding_progress |
| 2 | `migrations/002_indexes.sql` | Adds performance indexes | Composite indexes on high-read columns |
| 3 | `migrations/003_rpcs.sql` | Creates stored procedures | `apply_occupancy_delta()`, `reset_area_counts()`, `reset_venue_counts()`, `get_report_summary()`, `get_hourly_traffic()`, `get_demographics()`, `fn_updated_at()` |
| 4 | `migrations/004_rls.sql` | Enables Row Level Security | RLS policies for tenant isolation + RBAC |

**How to run each migration:**
1. Open the [SQL Editor](https://supabase.com/dashboard/project/apgussgbygxxnpvbssxs/sql/new)
2. Copy the **entire contents** of each `.sql` file
3. Paste into the editor
4. Click **Run** (or Ctrl/Cmd + Enter)
5. Verify "Success" message
6. Repeat for the next file **in order**

> ⚠️ **IMPORTANT**: Run them in order (001 → 002 → 003 → 004). Each migration depends on the previous ones.

### Step 2: Enable Realtime

After migrations complete:
1. Go to **Dashboard → Database → Replication**
2. Enable Realtime for these tables:
   - `occupancy_snapshots`
   - `occupancy_events`
   - `id_scans`

### Step 3: Verify Setup

Run this verification query in the SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```
You should see all 16 tables listed.

Then verify RPCs:
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION';
```

### Step 4: Configure Auth

1. Go to **Dashboard → Authentication → Providers**
2. Ensure **Email** provider is enabled
3. Configure email templates if needed
4. Note: The app uses `supabase.auth.signUp()` and `supabase.auth.signInWithPassword()`

---

## 6. What Needs to Be Built

### Priority 1: Implement SupabaseAdapter (Core Task)

File: `core/adapters/SupabaseAdapter.ts`

This file contains a complete stub with every method throwing `Not yet implemented`. Each method has:
- A `TODO` comment explaining what to implement
- SQL/RPC hints showing exactly which Supabase call to make
- Type annotations matching the `DataClient` interface

**Reference the working `LocalAdapter.ts` for logic, then replace with Supabase calls.**

Key methods to implement (in recommended order):

| Method | Priority | Supabase Approach |
|---|---|---|
| `signUp()` | P0 | `supabase.auth.signUp()` + insert into `business_members` |
| `signIn()` | P0 | `supabase.auth.signInWithPassword()` |
| `signOut()` | P0 | `supabase.auth.signOut()` |
| `getCurrentUser()` | P0 | `supabase.auth.getUser()` |
| `getBusinessForUser()` | P0 | Query `business_members` → `businesses` |
| `listVenues()` | P0 | `supabase.from('venues').select()` |
| `listAreas()` | P0 | `supabase.from('areas').select()` |
| `applyOccupancyDelta()` | P0 | `supabase.rpc('apply_occupancy_delta', {...})` |
| `getSnapshots()` | P0 | `supabase.from('occupancy_snapshots').select()` |
| `resetCounts()` | P1 | `supabase.rpc('reset_area_counts', {...})` or `reset_venue_counts` |
| `logScan()` | P1 | `supabase.from('id_scans').insert()` |
| `createBan()` | P1 | Insert into `banned_persons` + `patron_bans` |
| `listBans()` | P1 | Query `patron_bans` with join to `banned_persons` |
| `checkBanStatus()` | P1 | Query `patron_bans` where status = 'ACTIVE' |
| `getReportSummary()` | P2 | `supabase.rpc('get_report_summary', {...})` |
| `getHourlyTraffic()` | P2 | `supabase.rpc('get_hourly_traffic', {...})` |
| `getDemographics()` | P2 | `supabase.rpc('get_demographics', {...})` |
| `getEventLog()` | P2 | `supabase.from('occupancy_events').select()` |
| `subscribeToSnapshots()` | P2 | `supabase.channel().on('postgres_changes', ...)` |
| `subscribeToEvents()` | P2 | `supabase.channel().on('postgres_changes', ...)` |

### Priority 2: Wire Up Auth Flow

The login and onboarding pages exist but use mock auth. Wire them to real Supabase Auth:
- `app/login/page.tsx` — login form
- `app/onboarding/` — registration + business setup wizard
- `app/onboarding/actions.ts` — server actions for auth

### Priority 3: Refactor Components to Use DataClient

Currently, most components read from a Zustand store (`lib/store.tsx`). The migration path:

```typescript
// BEFORE (current)
import { useStore } from '@/lib/store';
const venues = useStore(s => s.venues);

// AFTER (target)
import { getDataClient } from '@/core/adapters';
const client = getDataClient();
const venues = await client.listVenues(businessId);
```

See `docs/INTEGRATION_MAP.md` for the complete function-by-function replacement guide.

### Priority 4: Enable Realtime

Implement the optional subscription methods in `SupabaseAdapter`:
- `subscribeToSnapshots()` — live occupancy updates
- `subscribeToEvents()` — live event feed

---

## 7. Implementation Roadmap

### Week 1: Foundation
- [ ] Clone repo, install deps, run in demo mode
- [ ] Run all 4 Supabase migrations
- [ ] Verify tables + RPCs in Supabase dashboard
- [ ] Implement auth methods (`signUp`, `signIn`, `signOut`, `getCurrentUser`)
- [ ] Test login flow end-to-end

### Week 2: Core Data
- [ ] Implement `getBusinessForUser`, `listVenues`, `listAreas`
- [ ] Implement `applyOccupancyDelta` (uses RPC — **must be atomic**)
- [ ] Implement `getSnapshots`
- [ ] Test counting flow: login → dashboard → tap +1/-1 → verify occupancy updates
- [ ] Implement `resetCounts`

### Week 3: ID Scanning & Bans
- [ ] Implement `logScan`
- [ ] Implement `createBan`, `listBans`, `checkBanStatus`
- [ ] Test scan → ban → enforcement flow
- [ ] Implement CRUD for venues, areas, devices

### Week 4: Analytics & Polish
- [ ] Implement reporting RPCs (`getReportSummary`, `getHourlyTraffic`, `getDemographics`)
- [ ] Implement `getEventLog`
- [ ] Enable Realtime subscriptions
- [ ] Begin refactoring components from Zustand → DataClient
- [ ] QA testing (see `docs/QA_CHECKLIST.md`)

---

## 8. Key Files Reference

### Must-Read Files (in order)
1. **`core/adapters/DataClient.ts`** — The interface contract. This defines every data operation. Read this first.
2. **`core/adapters/LocalAdapter.ts`** — Working implementation using localStorage. Use as reference.
3. **`core/adapters/SupabaseAdapter.ts`** — Your main work file. Implement all TODO methods.
4. **`migrations/003_rpcs.sql`** — The RPCs you'll call from the adapter. Understand these.
5. **`docs/INTEGRATION_MAP.md`** — Maps every existing function to its DataClient replacement.
6. **`docs/SUPABASE_IMPLEMENTATION.md`** — Deep dive on table relationships, RLS, and patterns.

### Supabase Client
The Supabase client factory already exists:
```
lib/supabase.ts — createClient() for browser-side
```

### Important Anti-Patterns to Avoid
- ❌ **Never** increment occupancy with `UPDATE SET occupancy = occupancy + 1` directly
  - ✅ **Always** use `supabase.rpc('apply_occupancy_delta', ...)` — it uses row locking
- ❌ **Never** bypass RLS with the service role key on the client side
  - ✅ Use the anon key on the client; service role only in server actions
- ❌ **Don't** create new tables — the schema is complete
  - ✅ If you need schema changes, discuss first

---

## 9. Documentation Index

| Document | Location | What It Covers |
|---|---|---|
| **Product Spec** | `docs/PRODUCT_SPEC.md` | User roles (Owner, Admin, Supervisor, User), core flows, definitions |
| **Architecture** | `docs/ARCHITECTURE.md` | Route map, state management, adapter pattern, auth strategy |
| **Supabase Guide** | `docs/SUPABASE_IMPLEMENTATION.md` | Table relationships, RLS policies, RPC usage, reset flow |
| **Reporting Formulas** | `docs/REPORTING_FORMULAS.md` | Exact SQL and logic for all analytics calculations |
| **Integration Map** | `docs/INTEGRATION_MAP.md` | Function-by-function guide: old code → DataClient replacement |
| **QA Checklist** | `docs/QA_CHECKLIST.md` | Complete manual testing scenarios for all features |
| **README** | `README.md` | Quick start, project overview, tech stack |

---

## 10. Testing

### Demo Mode Testing
```bash
# Set NEXT_PUBLIC_APP_MODE=demo in .env.local
npm run dev
# All features work with localStorage — use to verify UI behavior
```

### Production Mode Testing
```bash
# Set NEXT_PUBLIC_APP_MODE=production in .env.local
# Fill in Supabase credentials
npm run dev
# Test each implemented adapter method
```

### Playwright Tests
```bash
npx playwright test
```

### QA Scenarios
See `docs/QA_CHECKLIST.md` for 50+ manual test scenarios covering:
- Auth flows
- Counting operations
- ID scanning
- Ban management
- Reporting
- Edge cases

---

## 11. Known Constraints

1. **No Supabase CLI needed** — migrations can be run via the SQL Editor in the dashboard
2. **RLS assumes `auth.uid()`** — every policy checks the user's business membership via `business_members`
3. **Occupancy deltas must use the RPC** — direct table updates will bypass row locking
4. **The `LocalAdapter` is the source of truth for business logic** — if unsure how a method should behave, check how `LocalAdapter` implements it
5. **The Zustand store (`lib/store.tsx`) will eventually be replaced** — but it works for now; refactor incrementally
6. **PII in `id_scans`** — first_name, last_name, dob fields exist but should be encrypted in production v2

---

## Questions?

Contact Harrison for:
- Supabase credentials (URL, anon key, service role key)
- GitHub repo access (if needed)
- Product clarification
- Design assets

---

*This handoff package includes everything needed to get CLICR V4 communicating with Supabase. The prototype is fully functional in demo mode — your job is to make the same thing work with real data.*
