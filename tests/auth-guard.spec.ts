import { test, expect } from "@playwright/test";

/**
 * Page-guard gate. Every /office and /caregiver page must be unreachable
 * without a session — this is the regression test for the window in which the
 * API was gated but the pages were not, and the URLs were simply viewable.
 *
 * This runs against the production build with no DATABASE_URL, which is exactly
 * the anonymous case: no cookie means the guard redirects before it ever reads
 * the database. A page that forgets to call the guard would render instead, and
 * fail here.
 *
 * The signed-in cases (successful login, role checks, suspension revoking page
 * access) need Postgres and run on the VPS.
 */
const guarded = [
  { path: "/office", login: "/office/login" },
  { path: "/office/bookings", login: "/office/login" },
  { path: "/office/bookings/new", login: "/office/login" },
  { path: "/office/bookings/1/assign", login: "/office/login" },
  { path: "/office/leads", login: "/office/login" },
  { path: "/office/caregivers", login: "/office/login" },
  { path: "/office/caregivers/1/verify", login: "/office/login" },
  { path: "/office/catalog", login: "/office/login" },
  { path: "/office/alerts", login: "/office/login" },
  { path: "/office/complaints", login: "/office/login" },
  { path: "/office/samples", login: "/office/login" },
  { path: "/caregiver", login: "/caregiver/login" },
  { path: "/caregiver/today", login: "/caregiver/login" },
  { path: "/caregiver/today/tasks", login: "/caregiver/login" },
  { path: "/caregiver/today/scan", login: "/caregiver/login" },
  { path: "/caregiver/today/care-log", login: "/caregiver/login" },
];

for (const { path, login } of guarded) {
  test(`guard: ${path} is not viewable signed out`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${login}\\?next=`));
  });
}

test("guard: the return path round-trips to the page that was asked for", async ({ page }) => {
  await page.goto("/office/bookings/1/assign");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/office/bookings/1/assign");
});

test("guard: a forged session cookie is rejected", async ({ page, context }) => {
  await context.addCookies([
    { name: "pc_session", value: "not-a-real-jwt", url: "http://localhost:3123" },
  ]);
  await page.goto("/office");
  await expect(page).toHaveURL(/\/office\/login/);
});

// The login screens must sit OUTSIDE the guarded shells, or an anonymous
// visitor is redirected to a page that redirects them again.
test("guard: login screens render instead of looping", async ({ page }) => {
  await page.goto("/office/login");
  await expect(page).toHaveURL(/\/office\/login$/);
  await expect(page.getByRole("heading", { name: "Office sign in" })).toBeVisible();

  await page.goto("/caregiver/login");
  await expect(page).toHaveURL(/\/caregiver\/login$/);
});

test("customer booking stays public — guest booking is the point (Flow A)", async ({ page }) => {
  await page.goto("/book/checkout");
  await expect(page).toHaveURL(/\/book\/checkout$/);
});

// Flow C's front door: an enquiry must never sit behind a login.
test("the enquiry form stays public", async ({ page }) => {
  await page.goto("/enquiry/medical-tourism");
  await expect(page).toHaveURL(/\/enquiry\/medical-tourism$/);
  await expect(page.getByRole("heading", { name: "Medical Tourism" })).toBeVisible();
});

// /enquiry only exists for lead-archetype services (§11).
test("a non-lead service has no enquiry page", async ({ page }) => {
  const res = await page.goto("/enquiry/nursing");
  expect(res?.status()).toBe(404);
});
