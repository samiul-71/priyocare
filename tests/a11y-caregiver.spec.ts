import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility gate for the SIGNED-IN caregiver PWA (PRD §17.9, design.md §6).
 *
 * These are the screens with the strictest design contract in the product —
 * 56px targets, 18px base, one decision per screen, sunlight-readable, used by
 * a tired woman on a cheap phone in bad light. They were the last surface with
 * no authenticated a11y pass, because they need more than a login: every page
 * diverts to /caregiver/change-pin until her PIN is hers, and
 * /caregiver/today/{tasks,scan,care-log} call notFound() without an assigned
 * job. `npm run db:seed-e2e` builds both, through the real onboarding chain.
 *
 * OPT-IN, like the office suite:
 *
 *   npm run db:seed-e2e
 *   E2E_CAREGIVER_PHONE=… E2E_CAREGIVER_PIN=… npm run test:a11y
 *
 * Unset (CI with no database) → these skip; the anonymous a11y specs and the
 * guard specs still run.
 */
const PHONE = process.env.E2E_CAREGIVER_PHONE;
const PIN = process.env.E2E_CAREGIVER_PIN;

const caregiverRoutes = [
  "/caregiver/today",
  "/caregiver/today/tasks",
  "/caregiver/today/scan",
  "/caregiver/today/care-log",
];

test.describe("caregiver PWA (signed in)", () => {
  test.skip(
    !PHONE || !PIN,
    "Run `npm run db:seed-e2e`, then set E2E_CAREGIVER_PHONE / E2E_CAREGIVER_PIN.",
  );

  // context.request shares a cookie jar with the browser context, so logging in
  // through the API leaves the page navigations authenticated.
  test.beforeEach(async ({ context }) => {
    const res = await context.request.post("/api/v1/auth/caregiver/login", {
      data: { phone: PHONE, pin: PIN },
    });
    expect(
      res.status(),
      "caregiver login failed — run `npm run db:seed-e2e` and check the PIN",
    ).toBe(200);
  });

  for (const route of caregiverRoutes) {
    test(`a11y: ${route} has no serious/critical violations`, async ({ page }) => {
      const response = await page.goto(route);

      // Guard against the silent pass this suite exists to prevent: without a
      // settled PIN we would be scanning /caregiver/change-pin, and without a
      // job the three sub-pages 404 — either way, green while testing nothing.
      expect(page.url(), "diverted to change-pin — the fixture's PIN is not settled").not.toContain(
        "/change-pin",
      );
      expect(page.url(), "bounced to login — not scanning the signed-in page").not.toContain(
        "/caregiver/login",
      );
      expect(response?.status(), "404 — the fixture has no job for today").toBe(200);

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

  /**
   * The design contract, not just axe: design.md §6 puts the caregiver's tap
   * targets at 56px because this is used one-handed, outdoors, by someone
   * tired. axe checks 24px (WCAG 2.1) and would pass a button half the size
   * this product promises.
   */
  test("the primary action meets the 56px caregiver target, not just WCAG's 24px", async ({
    page,
  }) => {
    await page.goto("/caregiver/today");
    const checkIn = page.getByRole("button", { name: /চেক-ইন|চেক-আউট/ });
    const box = await checkIn.boundingBox();
    expect(box, "no check-in button on today's job").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(56);
  });

  test("the job card shows the landmark — Dhaka navigates by landmarks, not addresses", async ({
    page,
  }) => {
    await page.goto("/caregiver/today");
    await expect(page.getByText("Beside Anam Rangs Plaza")).toBeVisible();
  });
});
