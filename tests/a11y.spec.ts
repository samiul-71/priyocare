import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility gate (PRD §17.9, design.md §7). Fails on ANY serious or
 * critical violation — a contrast regression is exactly as much a defect as a
 * type error. No warnings-only mode.
 *
 * The master PRD lists 8 critical routes; most are built in later modules.
 * This spec covers the routes that exist and MUST grow to the full list as each
 * route ships:
 *   /  ·  /book/[service]/select  ·  /book/address  ·  /book/slot
 *   /book/checkout  ·  /bookings/[id]/track  ·  /caregiver/today
 *   /caregiver/today/care-log
 *
 * COVERAGE NOTE — this file covers the ANONYMOUS routes. /office/* moved to
 * a11y-office.spec.ts, which signs in first: they are behind a page guard, and
 * leaving them here would NOT have failed — axe would have followed the
 * redirect and scanned the login page while reporting the office routes green.
 * /caregiver/* still has no authenticated a11y pass (it needs an approved
 * caregiver row); auth-guard.spec.ts asserts it redirects.
 */
const routes = [
  "/",
  "/office/login",
  "/caregiver/login",
  "/book/nursing/select",
  "/book/checkout",
  "/book/confirmation",
  "/bookings/1/track",
  "/bookings/1/status",
  "/enquiry/medical-tourism",
  "/enquiry/health-insurance",
];

for (const route of routes) {
  test(`a11y: ${route} has no serious/critical violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    // Surface details in the test output when something fails.
    expect(
      seriousOrCritical,
      seriousOrCritical.map((v) => `${v.id} (${v.impact}): ${v.help}`).join("\n"),
    ).toEqual([]);
  });
}

test("landing does not block zoom (elderly users depend on it)", async ({ page }) => {
  await page.goto("/");
  const content = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(content).not.toContain("user-scalable=no");
  expect(content).not.toContain("maximum-scale=1");
});
