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
  /** Test the budget AND consume one. For plain "how many calls" limits. */
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  /** Test without consuming — pair with `record` on failure only. */
  peek(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  /** Consume one, regardless of budget. */
  record(key: string, windowMs: number): Promise<void>;
  /** Forget a key's history — a successful login clears its own failures. */
  reset(key: string): Promise<void>;
}

export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();

  const live = (key: string, windowMs: number, t: number) =>
    (hits.get(key) ?? []).filter((ts) => ts > t - windowMs);

  const verdict = (timestamps: number[], limit: number, windowMs: number, t: number) =>
    timestamps.length >= limit
      ? { allowed: false, remaining: 0, retryAfterMs: timestamps[0] + windowMs - t }
      : { allowed: true, remaining: limit - timestamps.length, retryAfterMs: 0 };

  return {
    async check(key, limit, windowMs) {
      const t = now();
      const timestamps = live(key, windowMs, t);
      const result = verdict(timestamps, limit, windowMs, t);
      if (result.allowed) timestamps.push(t);
      hits.set(key, timestamps);
      return result;
    },

    async peek(key, limit, windowMs) {
      const t = now();
      const timestamps = live(key, windowMs, t);
      hits.set(key, timestamps);
      return verdict(timestamps, limit, windowMs, t);
    },

    async record(key, windowMs) {
      const t = now();
      const timestamps = live(key, windowMs, t);
      timestamps.push(t);
      hits.set(key, timestamps);
    },

    async reset(key) {
      hits.delete(key);
    },
  };
}

/** Named policies (PRD §10.3) — tighter on auth than on general writes. */
export const RATE_LIMITS = {
  otpPerPhone: { limit: 5, windowMs: 15 * 60_000 },
  otpPerIp: { limit: 20, windowMs: 15 * 60_000 },
  /**
   * The real brute-force defence: per IDENTITY, so guessing one account's
   * password is throttled no matter where the attempts come from.
   */
  loginPerIdentity: { limit: 5, windowMs: 15 * 60_000 },
  /**
   * Per-IP is the backstop for a spray across many accounts — deliberately
   * loose, because **an entire Ops floor shares one office IP**. This was 10
   * per 5 min, which a 20-person team would trip on a Monday morning: the
   * limiter would lock out the staff while barely inconveniencing an attacker,
   * who has the whole internet's IPs. The tight limit belongs on the identity,
   * not the address.
   */
  loginPerIp: { limit: 50, windowMs: 5 * 60_000 },
  writePerAccount: { limit: 60, windowMs: 60_000 },
  // Self-service password reset (§10.1). Capped by EVERY request, not just
  // failures, because the abuse here is mailing a real person a stream of reset
  // links, not guessing — so it uses `check`, not the login begin/finish pair.
  pwResetPerEmail: { limit: 3, windowMs: 15 * 60_000 },
  pwResetPerIp: { limit: 15, windowMs: 15 * 60_000 },
  // Public, unauthenticated enquiry form (§10.3). Loose enough for a family
  // enquiring about several services in one sitting, tight enough that a bot
  // cannot bury the Ops board.
  leadsPerIp: { limit: 5, windowMs: 10 * 60_000 },
} as const;

/** Default process-wide limiter. */
export const rateLimiter = createMemoryRateLimiter();

/**
 * Login throttling, shared by both login handlers and the sign-in Server
 * Action — the same keys on every seam, or an attacker just switches entrance
 * for a fresh budget.
 *
 * ONLY FAILURES COUNT, and a success clears the identity's history. Brute force
 * is repeated *failure*; charging a correct password against the same budget
 * punishes the legitimate user — a caregiver signing in at the start of each
 * visit, a shared Ops desk — for the attacker's behaviour, and buys nothing.
 *
 *   const check = await beginLoginAttempt(identityKey, ipKey);
 *   if (!check.allowed) return 429;
 *   … verify …
 *   await finishLoginAttempt(identityKey, ipKey, succeeded);
 */
export async function beginLoginAttempt(
  identityKey: string,
  ipKey: string,
): Promise<RateLimitResult> {
  const identity = await rateLimiter.peek(
    identityKey,
    RATE_LIMITS.loginPerIdentity.limit,
    RATE_LIMITS.loginPerIdentity.windowMs,
  );
  if (!identity.allowed) return identity;

  return rateLimiter.peek(ipKey, RATE_LIMITS.loginPerIp.limit, RATE_LIMITS.loginPerIp.windowMs);
}

export async function finishLoginAttempt(
  identityKey: string,
  ipKey: string,
  succeeded: boolean,
): Promise<void> {
  if (succeeded) {
    // Clear the identity's failures; the IP's history stays, so a spray across
    // many accounts still accumulates even when some guesses land.
    await rateLimiter.reset(identityKey);
    return;
  }
  await rateLimiter.record(identityKey, RATE_LIMITS.loginPerIdentity.windowMs);
  await rateLimiter.record(ipKey, RATE_LIMITS.loginPerIp.windowMs);
}
