import { test } from "node:test";
import assert from "node:assert/strict";
import { signAccessToken, verifyAccessToken } from "../lib/server/auth/tokens.ts";

// Set the signing secret before any token call (getSecret reads it lazily,
// so this runs well before the async test callbacks execute).
process.env.JWT_SECRET = "test-secret-of-at-least-thirty-two-characters!!";

test("a signed access token verifies and round-trips its claims", async () => {
  const token = await signAccessToken({ sub: "42", st: "staff", role: "ops" });
  const claims = await verifyAccessToken(token);
  assert.equal(claims?.sub, "42");
  assert.equal(claims?.st, "staff");
  assert.equal(claims?.role, "ops");
});

test("a customer token carries no role claim", async () => {
  const token = await signAccessToken({ sub: "7", st: "customer" });
  const claims = await verifyAccessToken(token);
  assert.equal(claims?.st, "customer");
  assert.equal(claims?.role, undefined);
});

test("a tampered token is rejected", async () => {
  const token = await signAccessToken({ sub: "1", st: "caregiver" });
  const tampered = token.slice(0, -3) + "xyz";
  assert.equal(await verifyAccessToken(tampered), null);
});

test("an expired token is rejected", async () => {
  const token = await signAccessToken({ sub: "1", st: "customer" }, -10);
  assert.equal(await verifyAccessToken(token), null);
});

test("a token signed with a different secret is rejected", async () => {
  const token = await signAccessToken({ sub: "1", st: "staff", role: "admin" });
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "a-completely-different-secret-thirty-two-chars";
  const claims = await verifyAccessToken(token);
  process.env.JWT_SECRET = original;
  assert.equal(claims, null);
});
