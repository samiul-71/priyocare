import { test } from "node:test";
import assert from "node:assert/strict";
import { createStaffSchema, setStaffActiveSchema } from "../lib/shared/office-schemas.ts";

/*
 * Admin staff management (§10.1, §10.4). The in-panel twin of db:create-staff,
 * plus deactivate/reactivate — the table showed Active/Deactivated but nothing
 * could change it, so offboarding meant editing the database by hand.
 *
 * These cover the SHAPE the form and action share. The DB paths (duplicate
 * check, token revocation, the self-deactivation refusal) are verified live —
 * they need a real row and a real session, exactly like resetStaffPassword.
 */

test("createStaffSchema lowercases the email — it must collide with what login looks up", () => {
  const parsed = createStaffSchema.safeParse({ email: "Ada@Example.COM", role: "ops" });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.email, "ada@example.com");
});

test("name is optional — the mutation defaults it to the email's local part", () => {
  const parsed = createStaffSchema.safeParse({ email: "ops@priyocare.test" });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.name, undefined);
});

test("role defaults to ops, and only ops|admin are accepted", () => {
  assert.equal(createStaffSchema.safeParse({ email: "x@y.co" }).data?.role, "ops");
  assert.equal(createStaffSchema.safeParse({ email: "x@y.co", role: "admin" }).data?.role, "admin");
  assert.equal(createStaffSchema.safeParse({ email: "x@y.co", role: "superuser" }).success, false);
});

test("an invalid email is refused before it ever reaches the database", () => {
  assert.equal(createStaffSchema.safeParse({ email: "not-an-email", role: "ops" }).success, false);
});

test("there is deliberately no password field — the server generates the handover credential", () => {
  // A password passed in is simply ignored, never trusted: an admin typing a
  // colleague's first password is the "Welcome123" failure the generated one
  // avoids.
  const parsed = createStaffSchema.safeParse({
    email: "ops@priyocare.test",
    role: "ops",
    password: "attacker-chosen",
  });
  assert.equal(parsed.success, true);
  assert.equal("password" in (parsed.data ?? {}), false);
});

test("setStaffActiveSchema needs a real id and an explicit boolean", () => {
  assert.equal(setStaffActiveSchema.safeParse({ staffId: 3, isActive: false }).success, true);
  assert.equal(setStaffActiveSchema.safeParse({ staffId: 3, isActive: true }).success, true);
  // Not a checkbox string — the action passes a real boolean, and a stray
  // "false" string must not read as truthy.
  assert.equal(setStaffActiveSchema.safeParse({ staffId: 3, isActive: "false" }).success, false);
  assert.equal(setStaffActiveSchema.safeParse({ staffId: 0, isActive: true }).success, false);
});
