"use server";

import { headers } from "next/headers";
import { verifyStaffCredentials } from "@/lib/server/auth/credentials";
import { setPageSessionCookie } from "@/lib/server/auth/dal";
import { beginLoginAttempt, finishLoginAttempt } from "@/lib/server/auth/rate-limit";
import { staffLoginSchema } from "@/lib/shared/auth-schemas";

/**
 * Browser sign-in / sign-out (module 09).
 *
 * These exist so the office browser session is **cookie-only**. Signing in
 * through the API handler would hand the page a Bearer access + refresh pair it
 * then had to keep somewhere — and `localStorage` is readable by any XSS on the
 * origin, which is exactly the weakness this module set out to remove. Through
 * this action the browser is issued nothing but the httpOnly cookie: there is no
 * API credential in the page to steal.
 *
 * `/api/v1/auth/staff/login` is unchanged and still returns the Bearer pair —
 * for genuine API clients, which are the only things that should hold one.
 */

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInStaffAction(input: unknown): Promise<SignInResult> {
  const parsed = staffLoginSchema.safeParse(input);
  // Deliberately the same message as a wrong password: a login that says
  // "that's not a valid email" for unknown accounts is a user enumerator.
  if (!parsed.success) return { ok: false, error: "Wrong email or password." };

  // A Server Action is a public HTTP endpoint and needs the same brute-force
  // limits the handler has — and the SAME KEYS, or an attacker just switches
  // seam for a fresh budget.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identityKey = `login:email:${parsed.data.email}`;
  const ipKey = `login:ip:${ip}`;

  const throttle = await beginLoginAttempt(identityKey, ipKey);
  if (!throttle.allowed) {
    return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  }

  const staff = await verifyStaffCredentials(parsed.data.email, parsed.data.password);
  await finishLoginAttempt(identityKey, ipKey, staff !== null);
  if (!staff) return { ok: false, error: "Wrong email or password." };

  // The only thing the browser gets. No token reaches the page.
  await setPageSessionCookie({ sub: String(staff.id), st: "staff", role: staff.role });
  return { ok: true };
}

// Sign-out lives in each actor's own group (see app/(office)/actions.ts): the
// boundaries rule forbids components/office importing anything of type `auth`,
// and that wall is worth more than the two lines it costs to keep.
