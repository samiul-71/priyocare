import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { caregivers, staffAccounts } from "../db/schema";
import {
  SESSION_COOKIE,
  sessionTtlSeconds,
  signPageSession,
  verifyPageSession,
} from "./page-session";
import type { PageSessionClaims } from "./page-session";
import type { StaffRole } from "./tokens";
import { safeReturnPath } from "../../shared/return-path";

/**
 * Data Access Layer for page auth — the guard every /office and /caregiver page
 * calls before it renders anything.
 *
 * WHY PER-PAGE AND NOT ONLY IN THE LAYOUT: the deferred plan said "check in the
 * (office)/(caregiver) layouts", but Next 16 is explicit that layouts do not
 * re-render on navigation under Partial Rendering, so a layout-only check is
 * not a guard — it runs once and then client-side transitions sail past it.
 * The framework guidance is to check close to the data, in each page. Layouts
 * still call `requireStaffPage`/`requireCaregiverPage` (the shell itself is
 * staff-only chrome), but the page-level call is the one that actually holds.
 *
 * Two tiers, per the same guidance:
 *   - `getPageSession()` — optimistic: verifies the signed cookie only.
 *   - `requireStaffPage()` / `requireCaregiverPage()` — secure: cookie AND a
 *     database check that the account is still active. That second read is what
 *     makes suspension bite (§9, Flow C): revoking refresh tokens kills API
 *     access instantly, but a 7/30-day cookie would otherwise keep serving
 *     pages to someone Ops just suspended.
 *
 * Both are wrapped in React `cache`, so a page + its layout + any leaf guard
 * share one cookie verify and one row read per render pass.
 *
 * Cookie WRITES (`setPageSessionCookie`/`clearPageSessionCookie`) are only
 * legal in Route Handlers and Server Actions — never during a page render.
 */

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

/** Issue the page-session cookie. Route Handlers / Server Actions only. */
export async function setPageSessionCookie(claims: PageSessionClaims): Promise<void> {
  const token = await signPageSession(claims);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    ...COOKIE_BASE,
    maxAge: sessionTtlSeconds(claims.st),
  });
}

/** Drop the page-session cookie (logout). Route Handlers / Server Actions only. */
export async function clearPageSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Verified cookie claims, or null. Optimistic — no database read. */
export const getPageSession = cache(async (): Promise<PageSessionClaims | null> => {
  const cookieStore = await cookies();
  return verifyPageSession(cookieStore.get(SESSION_COOKIE)?.value);
});

/**
 * Bounce to a login screen, preserving where the user was headed. The pathname
 * comes from the proxy (a Server Component cannot see its own URL) and is
 * validated by the same rule the login page applies to `?next=`.
 */
async function toLogin(loginPath: string, prefix: string): Promise<never> {
  const pathname = (await headers()).get("x-pc-pathname");
  const next = safeReturnPath(pathname, prefix);
  redirect(next ? `${loginPath}?next=${encodeURIComponent(next)}` : loginPath);
}

export interface StaffPageSession {
  staffId: number;
  role: StaffRole;
  name: string;
  email: string;
}

/**
 * Gate an office page. Redirects to /office/login unless the cookie is a valid
 * staff session AND the account is still active. Pass a role to require it
 * (e.g. "admin"); an authenticated `ops` hitting an admin page is sent to the
 * office home, not the login screen — they are signed in, just not allowed.
 */
export const requireStaffPage = cache(async (role?: StaffRole): Promise<StaffPageSession> => {
  const session = await getPageSession();
  if (!session || session.st !== "staff") return toLogin("/office/login", "/office");

  const [staff] = await getDb()
    .select({
      id: staffAccounts.id,
      role: staffAccounts.role,
      name: staffAccounts.name,
      email: staffAccounts.email,
      isActive: staffAccounts.isActive,
    })
    .from(staffAccounts)
    .where(eq(staffAccounts.id, Number(session.sub)))
    .limit(1);

  // Deactivated between login and now → the cookie is stale, treat as signed out.
  if (!staff || !staff.isActive) return toLogin("/office/login", "/office");
  if (role && staff.role !== role) redirect("/office");

  return { staffId: staff.id, role: staff.role, name: staff.name, email: staff.email };
});

export interface CaregiverPageSession {
  caregiverId: number;
  name: string;
}

/**
 * Gate a caregiver page.
 *
 * THE CAREGIVER RULE (§10.1, Flow A): an expired ACCESS token must never
 * produce a login screen. This guard cannot violate that — it never looks at
 * the access token. It reads the 30-day session cookie, which by construction
 * outlives every access-token expiry. A caregiver reaches /caregiver/login only
 * if that 30-day window itself lapsed (offline a full month — practically
 * never) or Ops suspended them. Queued IndexedDB writes are untouched either
 * way: this guard gates rendering, not the offline queue (module 07).
 */
export const requireCaregiverPage = cache(async (): Promise<CaregiverPageSession> => {
  const session = await getPageSession();
  if (!session || session.st !== "caregiver") return toLogin("/caregiver/login", "/caregiver");

  const [caregiver] = await getDb()
    .select({
      id: caregivers.id,
      name: caregivers.fullName,
      verificationStatus: caregivers.verificationStatus,
    })
    .from(caregivers)
    .where(eq(caregivers.id, Number(session.sub)))
    .limit(1);

  // Suspension revokes refresh tokens (Flow C); it must revoke page access too.
  if (!caregiver || caregiver.verificationStatus !== "approved") {
    return toLogin("/caregiver/login", "/caregiver");
  }

  return { caregiverId: caregiver.id, name: caregiver.name };
});
