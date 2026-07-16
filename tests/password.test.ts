import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, hashPin, verifyPin } from "../lib/server/auth/password.ts";

test("a password hash verifies against the original and rejects a wrong one", async () => {
  const hash = await hashPassword("Str0ng-Ops-Passw0rd!");
  assert.match(hash, /^\$argon2id\$/); // argon2id encoded string
  assert.equal(await verifyPassword(hash, "Str0ng-Ops-Passw0rd!"), true);
  assert.equal(await verifyPassword(hash, "wrong-password"), false);
});

test("two hashes of the same password differ (per-hash salt)", async () => {
  const a = await hashPassword("same-input");
  const b = await hashPassword("same-input");
  assert.notEqual(a, b);
});

test("a caregiver PIN is hashed and verified the same way", async () => {
  const hash = await hashPin("4821");
  assert.equal(await verifyPin(hash, "4821"), true);
  assert.equal(await verifyPin(hash, "0000"), false);
});
