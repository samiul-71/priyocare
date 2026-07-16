import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryRateLimiter } from "../lib/server/auth/rate-limit.ts";

test("allows up to the limit, then denies", async () => {
  const limiter = createMemoryRateLimiter();
  const key = "phone:+8801700000000";
  assert.equal((await limiter.check(key, 3, 60_000)).allowed, true);
  assert.equal((await limiter.check(key, 3, 60_000)).allowed, true);
  assert.equal((await limiter.check(key, 3, 60_000)).allowed, true);
  const denied = await limiter.check(key, 3, 60_000);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterMs > 0);
});

test("the window slides — requests are allowed again after it passes", async () => {
  let clock = 1_000_000;
  const limiter = createMemoryRateLimiter(() => clock);
  const key = "ip:203.0.113.1";
  await limiter.check(key, 2, 1000);
  await limiter.check(key, 2, 1000);
  assert.equal((await limiter.check(key, 2, 1000)).allowed, false);
  clock += 1001; // advance past the window
  assert.equal((await limiter.check(key, 2, 1000)).allowed, true);
});

test("keys are independent", async () => {
  const limiter = createMemoryRateLimiter();
  assert.equal((await limiter.check("a", 1, 60_000)).allowed, true);
  assert.equal((await limiter.check("a", 1, 60_000)).allowed, false);
  assert.equal((await limiter.check("b", 1, 60_000)).allowed, true);
});
