import { test, expect } from "@playwright/test";

/**
 * The response headers set by `proxy.ts` (PRD §10.2, §10.7).
 *
 * This suite exists for one asymmetry: every other check here fails loudly when
 * it breaks, but a CSP that is too WIDE breaks nothing you can see. The page
 * renders, the tests pass, and the only symptom is that the policy stopped
 * being worth having. So the widening has to be asserted against, not observed.
 *
 * These run against the production build (see playwright.config.ts `webServer`)
 * — which is the only build whose headers matter, and the only one where
 * 'unsafe-eval' would be a real finding.
 *
 * /office/login is the probe because it is anonymous and reads no database: the
 * guard refuses on the missing cookie before it ever queries a row.
 */
const PROBE = "/office/login";

async function csp(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get(PROBE);
  expect(res.status()).toBe(200);
  const header = res.headers()["content-security-policy"];
  expect(header, "no CSP header — proxy.ts did not run").toBeTruthy();
  return header;
}

/**
 * React's dev build evals to rebuild server error stacks in the browser, so
 * dev CSP must allow it — and a production build must not, because there
 * 'unsafe-eval' buys nothing and hands an injected string a route to becoming
 * code. `NODE_ENV` is inlined at build time, so this asserts the branch was
 * compiled out rather than merely skipped.
 */
test("production CSP does not allow 'unsafe-eval'", async ({ request }) => {
  expect(await csp(request)).not.toContain("unsafe-eval");
});

test("CSP keeps the directives that do the work", async ({ request }) => {
  const header = await csp(request);
  // Scripts and objects are the injection surface; frame-ancestors is the
  // clickjacking half that X-Frame-Options cannot express on its own.
  expect(header).toContain("default-src 'self'");
  expect(header).toContain("object-src 'none'");
  expect(header).toContain("frame-ancestors 'none'");
  expect(header).toContain("base-uri 'self'");
  expect(header).toContain("form-action 'self'");
});

test("the security headers ride on every response", async ({ request }) => {
  const res = await request.get(PROBE);
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=");
});
