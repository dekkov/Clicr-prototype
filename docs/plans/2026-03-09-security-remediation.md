# Security Remediation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, high, and medium severity security vulnerabilities identified in the CLICR V4 codebase.

**Architecture:** Server-side auth validation via Supabase `getUser()` replaces client-controlled headers. API routes get authentication middleware. RLS policies tightened. Debug routes restricted. Redirect validation added.

**Tech Stack:** Next.js 16, Supabase Auth (SSR), TypeScript, PostgreSQL RLS

---

## Phase 1: Credential Hygiene (Severity: CRITICAL)

### Task 1: Create `.env.example` and verify `.env` is untracked

The `.env` and `.env.local` files are NOT in git history (verified), but the `.env` file contains production credentials alongside documentation comments, making it easy to accidentally commit. Create a safe `.env.example` template.

**Files:**
- Create: `.env.example`
- Verify: `.gitignore` (already has `.env*` — confirmed correct)

**Step 1: Create `.env.example` with placeholder values**

```env
# =============================================================================
# CLICR V4 — Environment Variables
# =============================================================================
# Copy this file to .env.local and fill in values.
# NEVER commit .env.local to version control.
# =============================================================================

# ── App Mode ─────────────────────────────────────────────────────────────────
# "demo"       → LocalAdapter (in-memory/JSON data, no Supabase required)
# "production" → SupabaseAdapter (requires Supabase credentials below)
NEXT_PUBLIC_APP_MODE=demo

# ── Supabase (required for production mode) ──────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Identity Hashing (required for production ID scanning) ───────────────────
ID_HASH_SALT=generate-a-random-32-byte-hex-string

# ── Next.js ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# ── Email (optional, for waitlist/contact forms) ─────────────────────────────
RESEND_API_KEY=your-resend-api-key
```

**Step 2: Verify `.env` and `.env.local` are not tracked**

Run: `git ls-files -- .env .env.local`
Expected: No output (files are untracked)

**Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example with placeholder values"
```

---

## Phase 2: Server-Side Auth Helper (Severity: CRITICAL)

### Task 2: Create a reusable `getAuthenticatedUser()` helper

All API routes currently trust `x-user-id` / `x-user-email` headers from the client. Replace this with server-side Supabase session validation. Create one helper that all routes will use.

**Files:**
- Create: `lib/api-auth.ts`

**Step 1: Write the auth helper**

```typescript
import { createClient } from '@/utils/supabase/server';

export type AuthenticatedUser = {
    id: string;
    email: string;
};

/**
 * Extract the authenticated user from the Supabase session cookie.
 * Returns null if no valid session exists.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user || !user.email) {
        return null;
    }

    return { id: user.id, email: user.email };
}

/**
 * Like getAuthenticatedUser, but throws a Response-compatible object
 * for use in API route handlers. Returns a guaranteed non-null user.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
    const user = await getAuthenticatedUser();
    if (!user) {
        throw new Error('UNAUTHORIZED');
    }
    return user;
}
```

**Step 2: Commit**

```bash
git add lib/api-auth.ts
git commit -m "feat: add server-side auth helper for API routes"
```

---

## Phase 3: Fix API Route Authentication (Severity: CRITICAL)

### Task 3: Secure `/api/sync` — replace header-based auth

This is the most critical fix. The sync route handles all CRUD operations (RECORD_EVENT, ADD_VENUE, DELETE_AREA, DELETE_ACCOUNT, etc.) and currently trusts `x-user-id` and `x-user-email` headers.

**Files:**
- Modify: `app/api/sync/route.ts` (lines 347-368)

**Step 1: Update GET handler (lines 347-362)**

Replace:
```typescript
export async function GET(request: Request) {
    const userId = request.headers.get('x-user-id');
    const userEmail = request.headers.get('x-user-email');
    const url = new URL(request.url);
    const requestedBusinessId = url.searchParams.get('businessId');
    const requestedVenueId = url.searchParams.get('venueId');

    if (userId && userEmail) {
        const response = await buildSyncResponse(userId, userEmail, requestedBusinessId, requestedVenueId);
        return NextResponse.json(response);
    }

    const data = createInitialDBData();
    const hydrated = await hydrateData(data);
    return NextResponse.json({ ...hydrated, businesses: [] });
}
```

With:
```typescript
export async function GET(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const requestedBusinessId = url.searchParams.get('businessId');
    const requestedVenueId = url.searchParams.get('venueId');

    const response = await buildSyncResponse(user.id, user.email, requestedBusinessId, requestedVenueId);
    return NextResponse.json(response);
}
```

**Step 2: Update POST handler (lines 364-368)**

Replace:
```typescript
export async function POST(request: Request) {
    const body = await request.json();
    const { action, payload } = body;
    const userId = request.headers.get('x-user-id');
    const userEmail = request.headers.get('x-user-email') || '';
```

With:
```typescript
export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, payload } = body;
    const userId = user.id;
    const userEmail = user.email;
```

**Step 3: Add import at top of file**

Add to imports:
```typescript
import { getAuthenticatedUser } from '@/lib/api-auth';
```

**Step 4: Update the client-side sync calls**

Find where the client sends `x-user-id` / `x-user-email` headers and remove them. The server now reads the session cookie directly. Search for these patterns:

Run: `grep -rn "x-user-id\|x-user-email" --include="*.ts" --include="*.tsx"`

Update all client-side fetch calls that set these headers to remove them. The Supabase session cookie is sent automatically.

**Step 5: Commit**

```bash
git add app/api/sync/route.ts lib/api-auth.ts
# Also add any client files that were updated
git commit -m "fix(security): replace header-based auth with server-side session validation in /api/sync"
```

---

### Task 4: Secure `/api/reports/aggregate` — add auth + fix service role fallback

**Files:**
- Modify: `app/api/reports/aggregate/route.ts`

**Step 1: Add auth check and remove fallback**

At the top of the file, replace:
```typescript
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

With:
```typescript
import { supabaseAdmin } from '@/lib/supabase-admin';
```

(Use the existing `supabaseAdmin` singleton which already requires the service role key.)

**Step 2: Add auth check at the start of the POST handler**

Add at the beginning of the handler:
```typescript
import { requireAuth } from '@/lib/api-auth';

// Inside POST handler, before any logic:
const user = await requireAuth().catch(() => null);
if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Step 3: Validate the user is a member of the requested business**

After extracting `businessId` from the request body, add:
```typescript
const { data: membership } = await supabaseAdmin
    .from('business_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('business_id', businessId)
    .limit(1)
    .single();

if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Step 4: Remove console.log statements that leak business data**

**Step 5: Commit**

```bash
git add app/api/reports/aggregate/route.ts
git commit -m "fix(security): add auth + membership check to /api/reports/aggregate"
```

---

### Task 5: Secure `/api/rpc/reset` — add auth + authorization

**Files:**
- Modify: `app/api/rpc/reset/route.ts`

**Step 1: Add auth and role check**

At the top of the POST handler, replace trusting `user_id` from the body:
```typescript
import { requireAuth } from '@/lib/api-auth';

// Inside POST handler:
const user = await requireAuth().catch(() => null);
if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Verify user has ADMIN+ role in this business
const { data: membership } = await supabaseAdmin
    .from('business_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('business_id', body.business_id)
    .limit(1)
    .single();

if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden: ADMIN role required' }, { status: 403 });
}
```

**Step 2: Use `user.id` instead of `body.user_id` for any audit trail**

**Step 3: Remove console.log statements**

**Step 4: Commit**

```bash
git add app/api/rpc/reset/route.ts
git commit -m "fix(security): add auth + ADMIN role check to /api/rpc/reset"
```

---

### Task 6: Secure `/api/log-error` — add auth, remove header trust

**Files:**
- Modify: `app/api/log-error/route.ts`

**Step 1: Replace header-based user ID with session**

```typescript
import { getAuthenticatedUser } from '@/lib/api-auth';

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    // Allow unauthenticated error logging but don't trust headers
    const userId = user?.id ?? null;

    const body = await request.json();
    // ... rest of handler, use userId from session
}
```

**Step 2: Commit**

```bash
git add app/api/log-error/route.ts
git commit -m "fix(security): use session-based user ID in /api/log-error"
```

---

## Phase 4: Tap Endpoint Hardening (Severity: CRITICAL)

### Task 7: Add rate limiting to `/api/tap/[token]`

**Files:**
- Create: `lib/rate-limit.ts`
- Modify: `app/api/tap/[token]/route.ts`

**Step 1: Create simple in-memory rate limiter**

```typescript
// lib/rate-limit.ts
const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple in-memory rate limiter. In production, replace with Redis/Upstash.
 * Returns true if the request should be allowed.
 */
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }

    if (entry.count >= maxRequests) {
        return false;
    }

    entry.count++;
    return true;
}
```

**Step 2: Add rate limiting to the tap POST handler**

At the beginning of the POST handler in `app/api/tap/[token]/route.ts`:
```typescript
import { rateLimit } from '@/lib/rate-limit';

// Inside POST handler, before any logic:
const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
const rateLimitKey = `tap:${params.token}:${clientIp}`;

if (!rateLimit(rateLimitKey, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
}
```

**Step 3: Update the NOTE comment**

Replace:
```typescript
// NOTE: This endpoint is public and has no server-side rate limiting.
// For production use, configure rate limiting at the CDN/proxy layer
```

With:
```typescript
// NOTE: This endpoint is public. Rate limited to 30 requests/minute per IP+token.
// For higher traffic, consider Redis-based rate limiting (e.g. @upstash/ratelimit).
```

**Step 4: Commit**

```bash
git add lib/rate-limit.ts app/api/tap/\[token\]/route.ts
git commit -m "feat(security): add rate limiting to /api/tap endpoint"
```

---

## Phase 5: Open Redirect Fix (Severity: MEDIUM)

### Task 8: Validate redirect destination in auth callback

**Files:**
- Modify: `app/auth/callback/route.ts`

**Step 1: Add redirect validation helper**

Add this function before the GET handler:
```typescript
function sanitizeRedirectPath(path: string | null): string | null {
    if (!path) return null;
    // Must start with / and must not contain protocol or double-slash (open redirect)
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
        return null;
    }
    return path;
}
```

**Step 2: Apply validation to `next` parameter**

In both the `code` and `token_hash` branches, replace:
```typescript
const destination = isInviteAcceptance
    ? '/auth/set-password'
    : (next ?? (user ? await resolvePostAuthRoute(user.id) : '/dashboard'));
```

With:
```typescript
const safeNext = sanitizeRedirectPath(next);
const destination = isInviteAcceptance
    ? '/auth/set-password'
    : (safeNext ?? (user ? await resolvePostAuthRoute(user.id) : '/dashboard'));
```

**Step 3: Remove `x-forwarded-host` trust (use `origin` always)**

Replace the redirect block in both branches:
```typescript
const forwardedHost = request.headers.get('x-forwarded-host')
const isLocalEnv = process.env.NODE_ENV === 'development'
if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${destination}`)
} else if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${destination}`)
} else {
    return NextResponse.redirect(`${origin}${destination}`)
}
```

With:
```typescript
return NextResponse.redirect(`${origin}${destination}`)
```

Note: Vercel and other platforms set the correct `origin` from `request.url` automatically. The `x-forwarded-host` header is spoofable and unnecessary here.

**Step 4: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "fix(security): validate redirect path and remove x-forwarded-host trust in auth callback"
```

---

## Phase 6: Debug Routes Restriction (Severity: HIGH)

### Task 9: Restrict debug pages to OWNER role only

**Files:**
- Modify: `utils/supabase/middleware.ts`
- Modify: `app/debug/page.tsx`
- Modify: `app/debug/auth/page.tsx`
- Modify: `app/(authenticated)/debug/context/page.tsx`

**Step 1: Add environment check to debug pages**

In each debug page, add a production guard at the top of the component. For server components (`app/debug/page.tsx`, `app/debug/auth/page.tsx`):

```typescript
import { redirect } from 'next/navigation';

// At the top of the page function:
if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DEBUG_PAGES) {
    redirect('/dashboard');
}
```

For the client component (`app/(authenticated)/debug/context/page.tsx`):

Move the sensitive logic to a server component wrapper, or add a server-side check.

**Step 2: Remove service role key exposure from `app/debug/page.tsx`**

Remove or replace the line that shows `SUPABASE_SERVICE_ROLE_KEY` presence:
```typescript
// REMOVE this line:
// <p>Service Role Key: {process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}</p>
```

**Step 3: Commit**

```bash
git add app/debug/page.tsx app/debug/auth/page.tsx app/(authenticated)/debug/context/page.tsx
git commit -m "fix(security): restrict debug pages to development/explicitly enabled environments"
```

---

## Phase 7: Identity Hash Salt (Severity: MEDIUM)

### Task 10: Remove fallback salt, require env var

**Files:**
- Modify: `lib/identity-hash.ts` (line 1/9)

**Step 1: Make salt required**

Replace:
```typescript
const SALT = process.env.ID_HASH_SALT || 'fallback_salt_do_not_use_in_prod';
```

With:
```typescript
function getSalt(): string {
    const salt = process.env.ID_HASH_SALT;
    if (!salt) {
        throw new Error('ID_HASH_SALT environment variable is required. Generate one with: openssl rand -hex 32');
    }
    return salt;
}
```

Update the `generateIdentityHash` function to call `getSalt()` instead of using `SALT`:
```typescript
return crypto.createHmac('sha256', getSalt()).update(input).digest('hex');
```

**Step 2: Commit**

```bash
git add lib/identity-hash.ts
git commit -m "fix(security): require ID_HASH_SALT env var, remove hardcoded fallback"
```

---

## Phase 8: RLS Policy Tightening (Severity: HIGH)

### Task 11: Fix overly permissive RLS policies

**Files:**
- Create: `migrations/014_tighten_rls.sql`

**Step 1: Write migration to replace permissive policies**

```sql
-- Migration: Tighten overly permissive RLS policies
-- Replaces USING (true) policies with proper business_id scoping

-- Drop overpermissive occupancy_events policy
DROP POLICY IF EXISTS "Enable read for authenticated" ON occupancy_events;
CREATE POLICY "occupancy_events_select_member"
    ON occupancy_events FOR SELECT
    TO authenticated
    USING (is_member_of(business_id));

-- Drop overpermissive occupancy_snapshots policies
DROP POLICY IF EXISTS "Enable all for authenticated" ON occupancy_snapshots;

CREATE POLICY "occupancy_snapshots_select_member"
    ON occupancy_snapshots FOR SELECT
    TO authenticated
    USING (is_member_of(business_id));

CREATE POLICY "occupancy_snapshots_insert_member"
    ON occupancy_snapshots FOR INSERT
    TO authenticated
    WITH CHECK (is_member_of(business_id));

CREATE POLICY "occupancy_snapshots_update_admin"
    ON occupancy_snapshots FOR UPDATE
    TO authenticated
    USING (has_role_in(business_id, 'ADMIN'));

CREATE POLICY "occupancy_snapshots_delete_admin"
    ON occupancy_snapshots FOR DELETE
    TO authenticated
    USING (has_role_in(business_id, 'ADMIN'));
```

**Step 2: Verify `is_member_of` and `has_role_in` functions exist**

These are defined in `migrations/004_rls.sql` — confirm they work correctly.

**Step 3: Note — the `/api/tap/[token]` endpoint uses service role and bypasses RLS intentionally (public device endpoint). This is acceptable as long as the tap endpoint validates the token.**

**Step 4: Commit**

```bash
git add migrations/014_tighten_rls.sql
git commit -m "fix(security): tighten RLS policies, replace USING(true) with business_id scoping"
```

---

## Phase 9: Production Console Logging Cleanup (Severity: MEDIUM)

### Task 12: Remove sensitive data from console.log statements

**Files:**
- Modify: `app/api/sync/route.ts`
- Modify: `app/api/rpc/reset/route.ts`
- Modify: `app/api/reports/aggregate/route.ts`
- Modify: `app/login/actions.ts`

**Step 1: Find all console.log statements in API routes**

Run: `grep -rn "console\.log" app/api/ app/login/actions.ts`

**Step 2: Remove or replace with minimal logging**

For each `console.log` that outputs business IDs, user IDs, or RPC parameters:
- Remove it entirely if it's just debugging noise
- Replace with a structured log that omits PII: `console.log('[sync] action:', action)` (no user IDs or payload data)

**Step 3: Commit**

```bash
git add app/api/sync/route.ts app/api/rpc/reset/route.ts app/api/reports/aggregate/route.ts app/login/actions.ts
git commit -m "fix(security): remove sensitive data from console.log in API routes"
```

---

## Phase 10: Build Safety (Severity: LOW)

### Task 13: Re-enable ESLint and TypeScript checks in builds

**Files:**
- Modify: `next.config.ts`

**Step 1: Remove the ignore flags**

Remove:
```typescript
eslint: {
    ignoreDuringBuilds: true,
},
typescript: {
    ignoreBuildErrors: true,
},
```

**Step 2: Fix any resulting build errors**

Run: `npm run build`

Fix all ESLint and TypeScript errors that surface. This may require a dedicated sub-task depending on volume.

**Step 3: Commit**

```bash
git add next.config.ts
# Also add any files fixed for lint/type errors
git commit -m "fix: re-enable ESLint and TypeScript checks during build"
```

---

## Phase 11: Client-Side Header Removal (Severity: CRITICAL — companion to Task 3)

### Task 14: Remove `x-user-id` / `x-user-email` headers from all client-side code

After Tasks 3-6 update the server to use session auth, the client-side code still sends these headers. They must be removed.

**Files:**
- Search and modify all files containing `x-user-id` or `x-user-email`

**Step 1: Find all usages**

Run: `grep -rn "x-user-id\|x-user-email" --include="*.ts" --include="*.tsx"`

**Step 2: For each file found**

Remove the `x-user-id` and `x-user-email` header assignments from fetch calls. The session cookie handles auth automatically.

Example — replace:
```typescript
headers: {
    'Content-Type': 'application/json',
    'x-user-id': user.id,
    'x-user-email': user.email,
}
```

With:
```typescript
headers: {
    'Content-Type': 'application/json',
}
```

**Step 3: Commit**

```bash
# Add all modified files
git commit -m "fix(security): remove client-side x-user-id/x-user-email headers"
```

---

## Verification

### Task 15: Smoke test the application

**Step 1: Run the build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 2: Start dev server and test critical flows**

Run: `npm run dev`

Test manually:
- [ ] Login works (session cookie set)
- [ ] Dashboard loads (sync GET returns data)
- [ ] Recording a tap event works
- [ ] Reports load (aggregate endpoint returns data)
- [ ] Reset occupancy works (for ADMIN users)
- [ ] Debug pages return 404/redirect in production mode
- [ ] Auth callback redirect stays on-site

**Step 3: Test unauthorized access**

```bash
# Should return 401:
curl http://localhost:3000/api/sync
curl -X POST http://localhost:3000/api/sync -H "Content-Type: application/json" -d '{"action":"RECORD_EVENT"}'
curl -X POST http://localhost:3000/api/reports/aggregate -H "Content-Type: application/json" -d '{"businessId":"test"}'
curl -X POST http://localhost:3000/api/rpc/reset -H "Content-Type: application/json" -d '{"business_id":"test"}'

# Should return 429 after 30 rapid requests:
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/tap/test-token -H "Content-Type: application/json" -d '{"direction":"IN"}'; done
```

**Step 4: Final commit**

```bash
git commit -m "chore: security remediation complete"
```

---

## Summary

| Task | Severity | What | Files |
|------|----------|------|-------|
| 1 | CRITICAL | `.env.example` template | `.env.example` |
| 2 | CRITICAL | Auth helper (`requireAuth`) | `lib/api-auth.ts` |
| 3 | CRITICAL | Secure `/api/sync` | `app/api/sync/route.ts` |
| 4 | CRITICAL | Secure `/api/reports/aggregate` | `app/api/reports/aggregate/route.ts` |
| 5 | CRITICAL | Secure `/api/rpc/reset` | `app/api/rpc/reset/route.ts` |
| 6 | CRITICAL | Secure `/api/log-error` | `app/api/log-error/route.ts` |
| 7 | CRITICAL | Rate limit `/api/tap` | `lib/rate-limit.ts`, `app/api/tap/[token]/route.ts` |
| 8 | MEDIUM | Fix open redirect | `app/auth/callback/route.ts` |
| 9 | HIGH | Restrict debug pages | `app/debug/**`, `utils/supabase/middleware.ts` |
| 10 | MEDIUM | Require hash salt env var | `lib/identity-hash.ts` |
| 11 | HIGH | Tighten RLS policies | `migrations/014_tighten_rls.sql` |
| 12 | MEDIUM | Remove sensitive console.logs | Multiple API routes |
| 13 | LOW | Re-enable build checks | `next.config.ts` |
| 14 | CRITICAL | Remove client-side auth headers | Multiple client files |
| 15 | — | Smoke test | — |

**Estimated total: 15 tasks, ~14 files to modify/create.**
