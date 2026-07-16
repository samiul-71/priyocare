import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility gate for the SIGNED-IN office panel (PRD §17.9).
 *
 * These routes left a11y.spec.ts when the page guards landed: they redirect to
 * login without a session, and axe would have scanned the login page while
 * reporting the office routes green. A local Postgres makes the real thing
 * testable again — sign in, then scan the pages Ops actually looks at.
 *
 * OPT-IN by design. It needs a staff account, and this suite deliberately does
 * not create one: a spec that provisions a known-password account would be a
 * backdoor the moment it ran against a real database. Set the credentials of an
 * existing account instead (see README, `npm run db:create-staff`):
 *
 *   E2E_STAFF_EMAIL=… E2E_STAFF_PASSWORD=… npm run test:a11y
 *
 * Unset (e.g. CI with no database) → these skip; the anonymous a11y specs and
 * the guard specs in auth-guard.spec.ts still run.
 */
const EMAIL = process.env.E2E_STAFF_EMAIL;
const PASSWORD = process.env.E2E_STAFF_PASSWORD;

const officeRoutes = [
  "/office",
  "/office/bookings",
  "/office/bookings/new",
  "/office/leads",
  "/office/caregivers",
  "/office/catalog",
  "/office/alerts",
  "/office/complaints",
  "/office/samples",
];

test.describe("office panel (signed in)", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "Set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD to a seeded staff account to run these.",
  );

  // context.request shares a cookie jar with the browser context, so logging in
  // through the API leaves the page navigations authenticated.
  test.beforeEach(async ({ context }) => {
    const res = await context.request.post("/api/v1/auth/staff/login", {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(
      res.status(),
      "staff login failed — is the account seeded and active?",
    ).toBe(200);
  });

  for (const route of officeRoutes) {
    test(`a11y: ${route} has no serious/critical violations`, async ({ page }) => {
      const response = await page.goto(route);

      // Guard against the silent-pass this suite exists to prevent: if the
      // session did not take, we'd be scanning the login page.
      expect(page.url(), "redirected to login — not scanning the office page").not.toContain(
        "/office/login",
      );
      expect(response?.status()).toBe(200);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

      expect(
        seriousOrCritical,
        seriousOrCritical.map((v) => `${v.id} (${v.impact}): ${v.help}`).join("\n"),
      ).toEqual([]);
    });
  }
});
