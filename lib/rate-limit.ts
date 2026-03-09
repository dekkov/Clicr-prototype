const hits = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

/**
 * Simple in-memory rate limiter. In production, replace with Redis/Upstash.
 * Returns true if the request should be allowed.
 */
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();

    // Evict expired entries every 5 minutes to prevent memory leak
    if (now - lastCleanup > 300_000) {
        for (const [k, v] of hits) {
            if (now > v.resetAt) hits.delete(k);
        }
        lastCleanup = now;
    }

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
