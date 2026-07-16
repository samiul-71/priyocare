import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility gate (PRD §17.9, design.md §7). Fails on ANY serious or
 * critical violation — a contrast regression is exactly as much a defect as a
 * type error. No warnings-only mode.
 *
 * The master PRD lists 8 critical routes; most are built in later modules.
 * This spec covers the routes that exist in module 01 and MUST grow to the
 * full list as each route ships:
 *   /  ·  /book/[service]/select  ·  /book/address  ·  /book/slot
 *   /book/checkout  ·  /bookings/[id]/track  ·  /caregiver/today
 *   /caregiver/today/care-log
 */
const routes = [
  "/",
  "/office",
  "/office/catalog",
  "/office/bookings",
  "/office/bookings/new",
  "/office/alerts",
  "/office/complaints",
  "/office/samples",
  "/book/nursing/select",
  "/book/checkout",
  "/book/confirmation",
  "/bookings/1/track",
  "/bookings/1/status",
  "/caregiver",
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
