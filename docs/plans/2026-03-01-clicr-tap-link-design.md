# Clicr Remote Tap Link — Design Doc

**Date:** 2026-03-01

---

## Goal

Let an operator share a URL with a client so they can tap GUEST IN / GUEST OUT from their browser during a demo — without creating an account or logging in.

---

## Architecture

### Token

- A random string stored in `button_config.tap_token` on the device.
- Uses the existing JSONB `button_config` column in Supabase `devices` table — no schema migration.
- Operator can regenerate the token at any time from the clicr settings modal; the old URL immediately stops working.

### URL

```
/tap/[token]
```

Public page, no authentication required.

---

## Components

### 1. `lib/types.ts`

Add `tap_token?` to `Clicr.button_config`:

```ts
button_config?: {
    auto_reset?: { enabled: boolean; time: string; timezone: string; };
    tap_token?: string;
};
```

### 2. `app/(authenticated)/clicr/[id]/ClicrPanel.tsx` — Settings modal

New "Remote Tap Link" section at the bottom of the settings modal:

- Read-only URL input showing the full tap link (e.g. `https://yourdomain.com/tap/x7k2-m9pq`)
- **Copy** button — copies URL to clipboard
- **Regenerate** button — generates a new nanoid token, calls `updateClicr` immediately (not waiting for Save), old link dies
- If no token exists yet, shows "No link generated" + a **Generate Link** button

Token generation uses `Math.random().toString(36).slice(2, 10)` (8-char alphanumeric) — simple, no extra dependency.

### 3. `app/api/tap/[token]/route.ts` — Public API

**POST** `{ direction: 'IN' | 'OUT' }`

Flow:
1. Query Supabase: `devices where button_config->>'tap_token' = token`
2. If not found → 404
3. Extract `area_id`, `venue_id`, `business_id` from device row
4. Call `apply_occupancy_delta` RPC with `delta: direction === 'IN' ? 1 : -1`
5. Return `{ success: true }` or `{ error }` with appropriate status

No `x-user-id` header required. `supabaseAdmin` (service role) is used server-side only.

### 4. `app/tap/[token]/page.tsx` — Public tap page

- Server component that passes token to a client component
- Client component (`TapButtons.tsx`) renders:
  - Device name (fetched on load via GET to same API route)
  - GUEST IN (blue) + GUEST OUT (slate) buttons — same style as ClicrPanel
  - Shows brief success flash after each tap
  - 404 / invalid token → "This link is no longer valid" message

---

## Data Flow

```
Operator: Settings modal → Regenerate → updateClicr({ button_config: { tap_token: 'abc123' } })
  → POST /api/sync UPDATE_CLICR → supabase devices.button_config updated

Client: opens /tap/abc123
  → GET /api/tap/abc123 → look up device by token → return { name, direction_mode }
  → Taps GUEST IN
  → POST /api/tap/abc123 { direction: 'IN' }
  → apply_occupancy_delta RPC (+1)
  → Operator's dashboard updates within 2s (normal polling)
```

---

## Out of Scope

- Rate limiting (demo use only)
- Guest name/DOB/gender collection (operator uses full ClicrPanel for that)
- Expiring tokens (operator regenerates manually)
