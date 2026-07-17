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

/**
 * Verified cookie claims, or null. Optimistic — no database read.
 *
 * NOT for deciding "already signed in, skip the login form". A cookie that
 * verifies here can still be refused by `getStaffActor`/`getCaregiverActor`
 * (suspended account, or `iat` older than the last credential change), and a
 * login page that bounces on this check alone redirects into a guard that
 * redirects straight back — an infinite loop, on the one page that could have
 * fixed the stale cookie. The login pages call the actor helpers instead; use
 * this only where being wrong costs nothing.
 */
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
  /** True while the password is the one an admin set — see requireStaffPage. */
  mustChangePassword: boolean;
}

/** Alias kept for symmetry with `CaregiverActor`. */
export type StaffActor = StaffPageSession;

/**
 * Gate an office page. Redirects to /office/login unless the cookie is a valid
 * staff session AND the account is still active. Pass a role to require it
 * (e.g. "admin"); an authenticated `ops` hitting an admin page is sent to the
 * office home, not the login screen — they are signed in, just not allowed.
 */
export const requireStaffPage = cache(async (role?: StaffRole): Promise<StaffPageSession> => {
  const staff = await getStaffActor();
  if (!staff) return toLogin("/office/login", "/office");

  // An admin-set password is one an admin knows. Until it is replaced, the only
  // office page reachable is the one that replaces it — same rule as a
  // caregiver's Ops-issued PIN, and staff hold more access, not less.
  if (staff.mustChangePassword) redirect("/office/change-password");

  // Signed in, just not allowed here — the office home, not the login screen.
  if (role && staff.role !== role) redirect("/office");

  return staff;
});

/**
 * The staff actor for a Server Action — same checks as `requireStaffPage`
 * (valid cookie AND the account still active), but it RETURNS null instead of
 * redirecting.
 *
 * A redirect is right for a page render and wrong for a form submit: the form
 * needs to say "your session expired" next to the button she just pressed,
 * keeping what she typed, rather than throwing the work away mid-navigation.
 *
 * Server Actions are POST-only and Next verifies Origin against Host, so the
 * cookie authorising them does not reopen CSRF.
 */
export const getStaffActor = cache(async (): Promise<StaffActor | null> => {
  const session = await getPageSession();
  if (!session || session.st !== "staff") return null;

  const [staff] = await getDb()
    .select({
      id: staffAccounts.id,
      role: staffAccounts.role,
      name: staffAccounts.name,
      email: staffAccounts.email,
      isActive: staffAccounts.isActive,
      passwordMustChange: staffAccounts.passwordMustChange,
      passwordChangedAt: staffAccounts.passwordChangedAt,
    })
    .from(staffAccounts)
    .where(eq(staffAccounts.id, Number(session.sub)))
    .limit(1);

  // Deactivated between login and now → the cookie is stale, treat as signed out.
  if (!staff || !staff.isActive) return null;

  // Session predates the last password change → refused. Same mechanism as the
  // caregiver PIN: nothing to revoke on a stateless cookie, so compare `iat`.
  // One second of slack — `iat` is whole seconds, the timestamp is not.
  if (staff.passwordChangedAt && session.iat !== undefined) {
    if (session.iat * 1000 + 1000 < staff.passwordChangedAt.getTime()) return null;
  }

  return {
    staffId: staff.id,
    role: staff.role,
    name: staff.name,
    email: staff.email,
    mustChangePassword: staff.passwordMustChange,
  };
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
  const caregiver = await getCaregiverActor();
  if (!caregiver) return toLogin("/caregiver/login", "/caregiver");

  /*
   * The PIN Ops issued is a credential Ops knows — they read it out. Until she
   * replaces it, the only page she may reach is the one that replaces it.
   *
   * This does NOT violate §10.1's "never a login wall": that rule is about
   * TOKEN EXPIRY blocking a working shift. This is a one-time setup step on a
   * brand-new account, before any work exists — her IndexedDB queue is empty by
   * definition, because she has never been able to open the app before now.
   */
  if (caregiver.mustChangePin) redirect("/caregiver/change-pin");

  return { caregiverId: caregiver.caregiverId, name: caregiver.name };
});

export interface CaregiverActor extends CaregiverPageSession {
  mustChangePin: boolean;
}

/**
 * The caregiver behind the cookie, or null. Returns rather than redirects, so
 * the change-PIN screen and its Server Action can use it without bouncing.
 *
 * Three ways to be null, all of which must invalidate a live cookie:
 *   - no/!caregiver session
 *   - not `approved` — suspension revokes refresh tokens (Flow C), and it has
 *     to revoke page access too or a suspended caregiver keeps browsing
 *   - the session PREDATES the last credential change — the cookie is a
 *     stateless JWT with nothing to revoke server-side, so `iat` vs
 *     `pin_changed_at` is what ends an Ops session created with the initial PIN
 */
export const getCaregiverActor = cache(async (): Promise<CaregiverActor | null> => {
  const session = await getPageSession();
  if (!session || session.st !== "caregiver") return null;

  const [caregiver] = await getDb()
    .select({
      id: caregivers.id,
      name: caregivers.fullName,
      verificationStatus: caregivers.verificationStatus,
      pinMustChange: caregivers.pinMustChange,
      pinChangedAt: caregivers.pinChangedAt,
    })
    .from(caregivers)
    .where(eq(caregivers.id, Number(session.sub)))
    .limit(1);

  if (!caregiver || caregiver.verificationStatus !== "approved") return null;

  if (caregiver.pinChangedAt && session.iat !== undefined) {
    // One second of slack: `iat` is whole seconds, `pin_changed_at` is not, so
    // the cookie issued by the very action that changed the PIN would otherwise
    // look stale by a fraction of a second and log her straight back out.
    const issuedAtMs = session.iat * 1000 + 1000;
    if (issuedAtMs < caregiver.pinChangedAt.getTime()) return null;
  }

  return {
    caregiverId: caregiver.id,
    name: caregiver.name,
    mustChangePin: caregiver.pinMustChange,
  };
});
