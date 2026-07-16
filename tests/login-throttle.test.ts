import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryRateLimiter, RATE_LIMITS } from "../lib/server/auth/rate-limit.ts";

/*
 * Login throttling (§10.3). The behaviour these lock in came out of the office
 * a11y suite failing: eleven sign-ins from one address tripped the old 10-per-5
 * minute per-IP cap. That is not a test artifact — an Ops floor shares one
 * office IP, so the limiter would have locked out the staff on a Monday morning
 * while barely inconveniencing an attacker, who has the whole internet's IPs.
 */

test("the tight limit is per identity; the per-IP limit is the loose backstop", () => {
  // The IP cap must be well clear of a real team signing in at once.
  assert.ok(
    RATE_LIMITS.loginPerIp.limit >= 50,
    "a shared office IP must not be the tight limit",
  );
  assert.ok(
    RATE_LIMITS.loginPerIdentity.limit <= 5,
    "brute force on one account must be throttled hard",
  );
  assert.ok(RATE_LIMITS.loginPerIdentity.limit < RATE_LIMITS.loginPerIp.limit);
});

test("peek does not consume budget; check does", async () => {
  const limiter = createMemoryRateLimiter();
  for (let i = 0; i < 10; i++) {
    const r = await limiter.peek("k", 3, 60_000);
    assert.equal(r.allowed, true, "peek must never exhaust a budget");
  }
  for (let i = 0; i < 3; i++) await limiter.check("k", 3, 60_000);
  assert.equal((await limiter.peek("k", 3, 60_000)).allowed, false);
});

test("record consumes, reset forgets", async () => {
  const limiter = createMemoryRateLimiter();
  for (let i = 0; i < 3; i++) await limiter.record("k", 60_000);
  assert.equal((await limiter.peek("k", 3, 60_000)).allowed, false);
  await limiter.reset("k");
  assert.equal((await limiter.peek("k", 3, 60_000)).allowed, true);
});

test("a blocked attempt reports when to retry", async () => {
  let clock = 1_000_000;
  const limiter = createMemoryRateLimiter(() => clock);
  await limiter.record("k", 60_000);
  clock += 10_000;
  const r = await limiter.peek("k", 1, 60_000);
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfterMs, 50_000); // 60s window, 10s elapsed
});

test("the window slides — old failures stop counting", async () => {
  let clock = 1_000_000;
  const limiter = createMemoryRateLimiter(() => clock);
  for (let i = 0; i < 5; i++) await limiter.record("k", 60_000);
  assert.equal((await limiter.peek("k", 5, 60_000)).allowed, false);
  clock += 61_000;
  assert.equal((await limiter.peek("k", 5, 60_000)).allowed, true);
});

/*
 * The rule that matters most: brute force is repeated FAILURE. Charging a
 * correct password against the same budget punishes the legitimate user — a
 * caregiver signing in at each visit, a shared Ops desk — for the attacker's
 * behaviour, and stops no attack.
 */
test("successful logins do not consume the identity budget", async () => {
  const limiter = createMemoryRateLimiter();
  const { limit, windowMs } = RATE_LIMITS.loginPerIdentity;

  // Twenty successful sign-ins: peek, succeed, reset. Never blocked.
  for (let i = 0; i < 20; i++) {
    assert.equal((await limiter.peek("id", limit, windowMs)).allowed, true, `sign-in ${i}`);
    await limiter.reset("id");
  }
});

test("failures accumulate and then block", async () => {
  const limiter = createMemoryRateLimiter();
  const { limit, windowMs } = RATE_LIMITS.loginPerIdentity;

  for (let i = 0; i < limit; i++) {
    assert.equal((await limiter.peek("id", limit, windowMs)).allowed, true);
    await limiter.record("id", windowMs);
  }
  assert.equal((await limiter.peek("id", limit, windowMs)).allowed, false);
});

test("one success clears the failures before it — a typo is not a lockout", async () => {
  const limiter = createMemoryRateLimiter();
  const { limit, windowMs } = RATE_LIMITS.loginPerIdentity;

  // Four fat-fingered attempts, then the right password.
  for (let i = 0; i < limit - 1; i++) await limiter.record("id", windowMs);
  assert.equal((await limiter.peek("id", limit, windowMs)).allowed, true);
  await limiter.reset("id"); // success

  // Full budget again, rather than one attempt from a lockout.
  for (let i = 0; i < limit; i++) {
    assert.equal((await limiter.peek("id", limit, windowMs)).allowed, true);
    await limiter.record("id", windowMs);
  }
});

test("a spray across many accounts still accumulates on the IP", async () => {
  const limiter = createMemoryRateLimiter();
  const ipWindow = RATE_LIMITS.loginPerIp.windowMs;

  // Each guess is against a different email, so no identity budget is touched
  // — the IP backstop is the only thing counting.
  for (let i = 0; i < RATE_LIMITS.loginPerIp.limit; i++) {
    await limiter.record("ip:1.2.3.4", ipWindow);
  }
  assert.equal(
    (await limiter.peek("ip:1.2.3.4", RATE_LIMITS.loginPerIp.limit, ipWindow)).allowed,
    false,
  );
});
