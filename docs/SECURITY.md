# CLICR V4 — Security Guide

## Overview

This document describes the security model, authentication patterns, and known constraints of the CLICR V4 application. It reflects the state after the March 2026 security remediation.

---

## Authentication

### Server-Side Session Validation

All protected API routes use `getAuthenticatedUser()` from `lib/api-auth.ts`, which validates the Supabase session cookie server-side using `supabase.auth.getUser()`. This is the only trusted source of user identity.

```typescript
import { getAuthenticatedUser } from '@/lib/api-auth';

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // user.id and user.email are verified from the session cookie
}
```

**Never trust client-supplied headers for user identity.** Headers like `x-user-id` or `x-user-email` can be spoofed by any caller. The session cookie is HttpOnly and cannot be read by client-side JavaScript.

### Auth Helper Reference

| Function | Returns | Use When |
|----------|---------|----------|
| `getAuthenticatedUser()` | `AuthenticatedUser \| null` | Route can handle unauthenticated requests (e.g., error logging) |
| `requireAuth()` | `AuthenticatedUser` (throws if missing) | Route requires auth |

---

## Authorization

### Role-Based Access Control

The application uses five roles with escalating privileges:

```
OWNER > ADMIN > MANAGER > STAFF > ANALYST
```

Role checks use `lib/permissions.ts` (`hasMinRole`) on the client, and direct `business_members` queries on the server. For destructive operations (reset, delete), always verify the role server-side:

```typescript
const { data: membership } = await supabaseAdmin
    .from('business_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('business_id', businessId)
    .single();

if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

### Business Isolation

Every data row is scoped to a `business_id`. Membership checks ensure cross-tenant data access is impossible:

1. **RLS policies** (database layer) — `is_member_of(business_id)` enforces isolation for all table reads/writes by authenticated users.
2. **Application layer** — API routes verify membership before acting.
3. **Service role operations** — `supabaseAdmin` bypasses RLS; routes using it must perform their own membership checks.

---

## API Route Security Reference

### Protected Routes (require auth)

| Route | Auth | Extra Check |
|-------|------|-------------|
| `POST /api/sync` | Session | — |
| `GET /api/sync` | Session | — |
| `POST /api/reports/aggregate` | Session | Membership in requested `business_id` |
| `POST /api/rpc/reset` | Session | ADMIN+ role in `business_id` |
| `POST /api/rpc/traffic` | Session | Membership in `business_id` |
| `POST /api/verify-id` | Session | Membership in `business_id` |
| `POST /api/log-error` | Session (optional) | None — unauthenticated logging allowed, but user ID comes from session not headers |
| `GET /api/admin/deploy-rpc` | Session | OWNER role in any business |

### Public Routes

| Route | Notes |
|-------|-------|
| `POST /api/tap/[token]` | Public by design (physical device endpoint). Rate limited to **30 requests/minute per IP+token**. |
| `GET /api/tap/[token]` | Public read of device name/direction mode. |
| `POST /api/webhooks/*` | Webhook endpoints — validated via signature, not session. |

---

## Row-Level Security (RLS)

All tables have RLS enabled. Policies are defined in `migrations/004_rls.sql` and tightened in `migrations/017_tighten_rls.sql`.

### Key RLS Functions

```sql
-- Returns true if the current auth.uid() is a member of the given business
is_member_of(p_business_id uuid) → boolean

-- Returns true if the current auth.uid() has at least p_min_role in the business
has_role_in(p_business_id uuid, p_min_role text) → boolean
```

### Policy Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `businesses` | member | — | ADMIN | — |
| `business_members` | ADMIN | ADMIN | ADMIN | OWNER |
| `venues` | member | member | ADMIN | OWNER |
| `areas` | member | member | SUPERVISOR | ADMIN |
| `devices` | member | member | SUPERVISOR | ADMIN |
| `occupancy_events` | member | member | — | — |
| `id_scans` | member | member | — | — |
| `app_errors` | member/system | always | — | — |

"member" = `is_member_of(business_id)`. Append-only tables (occupancy_events, id_scans) have no UPDATE/DELETE policies by design.

### Service Role Bypass

`supabaseAdmin` (the service role client) bypasses all RLS. It is used in:
- API routes that write on behalf of unauthenticated devices (`/api/tap`)
- Admin operations in RPCs (`/api/rpc/reset`, `/api/rpc/traffic`)
- Report aggregation (`/api/reports/aggregate`)

All routes using `supabaseAdmin` must perform their own authorization checks.

---

## Sensitive Data Handling

### Identity Hashing

Patron identity data (state, ID number, DOB) is hashed with HMAC-SHA256 before storage using `generateIdentityHash()` from `lib/identity-hash.ts`.

The salt is read from `ID_HASH_SALT` environment variable. **This variable is required in production.** The application will throw at scan time if it is not set.

Generate a salt: `openssl rand -hex 32`

### Logging Policy

API routes must not log PII or business identifiers. Acceptable patterns:

```typescript
// ✅ OK — action name only
console.log('[sync] action:', action);

// ✅ OK — error message only
console.error('[reset] failed:', error instanceof Error ? error.message : 'Unknown error');

// ❌ Never — user/business IDs
console.log('[sync] userId:', userId, 'businessId:', businessId);

// ❌ Never — full request payloads
console.log('[sync] params:', JSON.stringify(rpcParams));
```

### Auth Redirects

The auth callback (`app/auth/callback/route.ts`) validates the `next` redirect parameter before use. Only paths starting with `/` (and not starting with `//` or containing `://`) are accepted. Everything else falls back to the default post-auth route.

---

## Rate Limiting

The `/api/tap/[token]` endpoint is rate limited using an in-memory store (`lib/rate-limit.ts`): **30 requests per 60 seconds per IP+token combination**, returning HTTP 429 when exceeded.

The in-memory store is suitable for single-instance deployments. For multi-instance or high-traffic production, replace with a Redis-backed solution (e.g., `@upstash/ratelimit`).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (prod) | Server-only admin key — never expose to client |
| `ID_HASH_SALT` | Yes (prod) | HMAC salt for identity hashing — generate with `openssl rand -hex 32` |
| `NEXT_PUBLIC_BASE_URL` | Yes | App base URL |
| `RESEND_API_KEY` | Optional | Email delivery |
| `ENABLE_DEBUG_PAGES` | Optional | Set to any value to enable debug pages in production |

See `.env.example` for the full template.

**Rotation policy:** If `SUPABASE_SERVICE_ROLE_KEY` or `RESEND_API_KEY` is ever suspected to be compromised, rotate immediately in the respective dashboard. Keys are not stored in version control — `.gitignore` excludes all `.env*` files (except `.env.example`).

---

## Debug Pages

Debug pages under `app/debug/` are disabled in production (`NODE_ENV === 'production'`) unless the `ENABLE_DEBUG_PAGES` environment variable is set. They should never be enabled on public-facing deployments.

| Page | Path |
|------|------|
| System diagnostics | `/debug` |
| Auth / RLS check | `/debug/auth` |
| App context inspector | `/debug/context` |
| Traffic latency | `/debug/totals-latency` |

---

## Security Checklist for New API Routes

When adding a new API route that touches business data:

- [ ] Call `getAuthenticatedUser()` or `requireAuth()` at the top
- [ ] Return `401` if no session
- [ ] If the route takes a `business_id`, verify membership via `business_members` query
- [ ] If the route is destructive (delete, reset), verify ADMIN+ role
- [ ] If using `supabaseAdmin`, add explicit auth — it bypasses RLS
- [ ] Do not log user IDs, business IDs, or request payloads
- [ ] Return generic error messages from catch blocks (not `error.message`)
- [ ] If the route is public, add rate limiting via `lib/rate-limit.ts`
