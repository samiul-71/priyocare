import { test } from "node:test";
import assert from "node:assert/strict";
import { findEnvProblems } from "../lib/server/env.ts";

/*
 * Boot-time environment validation.
 *
 * The failure this exists to prevent: `JWT_SECRET` missing was SILENT. Both
 * verifiers wrapped `getSecret()` in a `catch {}` that treats any failure as
 * "invalid token", so a misconfigured deploy came up, served pages, and
 * redirected every user to a login screen where every login also failed —
 * with nothing in the logs naming the cause.
 */

const GOOD = "a-secret-of-at-least-thirty-two-characters";

test("a well-configured environment has no problems", () => {
  assert.deepEqual(findEnvProblems({ JWT_SECRET: GOOD }, false), []);
  assert.deepEqual(
    findEnvProblems({ JWT_SECRET: GOOD, DATABASE_URL: "postgres://x" }, true),
    [],
  );
});

test("a missing JWT_SECRET is a problem, and says which variable", () => {
  const problems = findEnvProblems({}, false);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].variable, "JWT_SECRET");
  assert.match(problems[0].problem, /missing/);
});

test("a too-short JWT_SECRET is reported with its actual length", () => {
  const problems = findEnvProblems({ JWT_SECRET: "tooshort" }, false);
  assert.equal(problems.length, 1);
  // Naming the length is the difference between a fix and a guess.
  assert.match(problems[0].problem, /8 chars/);
  assert.match(problems[0].problem, /32/);
});

test("an empty JWT_SECRET counts as missing, not as a short one", () => {
  const problems = findEnvProblems({ JWT_SECRET: "" }, false);
  assert.equal(problems.length, 1);
  assert.match(problems[0].problem, /missing/);
});

/*
 * DATABASE_URL is production-only on purpose: locally the app is deliberately
 * no-DB-safe — reads return empty and pages render their empty states, which is
 * how every module was built before Postgres existed here.
 */
test("DATABASE_URL is required in production only", () => {
  assert.deepEqual(findEnvProblems({ JWT_SECRET: GOOD }, false), []);

  const inProd = findEnvProblems({ JWT_SECRET: GOOD }, true);
  assert.equal(inProd.length, 1);
  assert.equal(inProd[0].variable, "DATABASE_URL");
});

test("every problem is reported at once, not one at a time", () => {
  // Finding a second missing variable after fixing the first is its own misery.
  const problems = findEnvProblems({}, true);
  assert.equal(problems.length, 2);
  assert.deepEqual(problems.map((p) => p.variable).sort(), ["DATABASE_URL", "JWT_SECRET"]);
});
