import { test, expect } from "@playwright/test";
import { SignJWT } from "jose";

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
  { path: "/office/staff", login: "/office/login" },
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

// Not in the list above: it redirects to /caregiver/login WITHOUT a ?next=,
// because the guard points *at* this page — see the dedicated test below.
const CHANGE_PIN = "/caregiver/change-pin";

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

/**
 * A cookie the guard REFUSES must still leave the login form reachable.
 *
 * The regression: the login pages asked `getPageSession` (cookie only) while
 * the guards asked `getStaffActor` (cookie AND the row). A cookie both signed
 * and unexpired can still be refused by the second check — the account was
 * suspended, `iat` predates `password_changed_at` after a reset, or the row is
 * simply gone. The two seams then disagreed forever: login saw "signed in" and
 * sent her to /office, /office saw "not signed in" and sent her back, and
 * Chromium gave up with ERR_TOO_MANY_REDIRECTS. She was locked out by the one
 * page that could have replaced the bad cookie, and clearing cookies by hand
 * was the only way back in.
 *
 * A cookie for a staff id that cannot exist reproduces that refusal without a
 * seeded account: it proves nothing and grants nothing, so it is no backdoor.
 * Needs the database the guard reads — without it the guard throws instead of
 * refusing, which is a different test.
 */
test.describe("a refused-but-valid cookie", () => {
  const SECRET = process.env.JWT_SECRET;
  test.skip(
    !SECRET || !process.env.DATABASE_URL,
    "Needs JWT_SECRET and a database — the guard must reach the row to refuse it.",
  );

  async function forge(subjectType: "staff" | "caregiver") {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ st: subjectType, ...(subjectType === "staff" ? { role: "admin" } : {}) })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("999999") // no such account — the guard reads the row and refuses
      .setIssuer("priyocare")
      .setAudience("priyocare:page-session")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(SECRET!));
  }

  test("does not lock staff out of /office/login", async ({ page, context }) => {
    await context.addCookies([
      { name: "pc_session", value: await forge("staff"), url: "http://localhost:3123" },
    ]);

    // Would throw ERR_TOO_MANY_REDIRECTS before the fix.
    await page.goto("/office/login");
    await expect(page).toHaveURL(/\/office\/login$/);
    await expect(page.getByRole("heading", { name: "Office sign in" })).toBeVisible();

    // And the guard still bounces her here rather than serving the panel.
    await page.goto("/office");
    await expect(page).toHaveURL(/\/office\/login\?next=/);
    await expect(page.getByRole("heading", { name: "Office sign in" })).toBeVisible();
  });

  test("does not lock a caregiver out of /caregiver/login", async ({ page, context }) => {
    await context.addCookies([
      { name: "pc_session", value: await forge("caregiver"), url: "http://localhost:3123" },
    ]);

    await page.goto("/caregiver/login");
    await expect(page).toHaveURL(/\/caregiver\/login$/);

    await page.goto("/caregiver");
    await expect(page).toHaveURL(/\/caregiver\/login\?next=/);
  });
});

test("customer booking stays public — guest booking is the point (Flow A)", async ({ page }) => {
  await page.goto("/book/checkout");
  await expect(page).toHaveURL(/\/book\/checkout$/);
});

/**
 * The change-PIN screen is not public — it just cannot sit behind the guard
 * that redirects to it, or that guard would point at itself forever. It sits in
 * the (auth) group and checks the session itself.
 */
test("guard: the change-PIN screen is not viewable signed out", async ({ page }) => {
  await page.goto(CHANGE_PIN);
  await expect(page).toHaveURL(/\/caregiver\/login/);
});

/**
 * Forgotten-PIN is necessarily public — she cannot sign in, that is the problem
 * — and it must be reachable FROM the login screen, or it may as well not exist.
 */
test("the forgotten-PIN route is public and linked from caregiver login", async ({ page }) => {
  await page.goto("/caregiver/login");
  await page.getByRole("link", { name: "পিন ভুলে গেছেন?" }).click();
  await expect(page).toHaveURL(/\/caregiver\/forgot-pin$/);
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
