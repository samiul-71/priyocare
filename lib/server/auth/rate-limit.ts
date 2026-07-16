import "server-only";

/**
 * Rate limiting (PRD §10.1, §10.3). Per-account and per-IP limits on all
 * writes, tighter on auth, `POST /bookings`, and `POST /leads`.
 *
 * This is a sliding-log limiter with an in-memory store — correct for a single
 * instance. In production on the VPS, swap `createMemoryRateLimiter` for a
 * Redis-backed implementation of the same `RateLimiter` interface so limits
 * hold across processes (BullMQ + Redis already run there — PRD §3.4).
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    async check(key, limit, windowMs) {
      const t = now();
      const windowStart = t - windowMs;
      const timestamps = (hits.get(key) ?? []).filter((ts) => ts > windowStart);

      if (timestamps.length >= limit) {
        const retryAfterMs = timestamps[0] + windowMs - t;
        hits.set(key, timestamps);
        return { allowed: false, remaining: 0, retryAfterMs };
      }

      timestamps.push(t);
      hits.set(key, timestamps);
      return { allowed: true, remaining: limit - timestamps.length, retryAfterMs: 0 };
    },
  };
}

/** Named policies (PRD §10.3) — tighter on auth than on general writes. */
export const RATE_LIMITS = {
  otpPerPhone: { limit: 5, windowMs: 15 * 60_000 },
  otpPerIp: { limit: 20, windowMs: 15 * 60_000 },
  loginPerIp: { limit: 10, windowMs: 5 * 60_000 },
  writePerAccount: { limit: 60, windowMs: 60_000 },
  // Public, unauthenticated enquiry form (§10.3). Loose enough for a family
  // enquiring about several services in one sitting, tight enough that a bot
  // cannot bury the Ops board.
  leadsPerIp: { limit: 5, windowMs: 10 * 60_000 },
} as const;

/** Default process-wide limiter. */
export const rateLimiter = createMemoryRateLimiter();
