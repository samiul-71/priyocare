import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { getSecret } from "./tokens";
import type { StaffRole, SubjectType } from "./tokens";

/**
 * Page-session tokens — the cookie half of the hybrid auth model (PRD §10.2,
 * left open there and settled here):
 *
 *   - **Pages** (server-rendered navigations) authenticate with an httpOnly
 *     cookie, because a navigation carries no Authorization header.
 *   - **APIs** keep authenticating with Bearer access tokens (require-auth.ts).
 *
 * Two rules make that split safe:
 *
 * 1. **A page session is not an API credential.** It is signed with the same
 *    secret but a DIFFERENT audience, so a stolen cookie cannot be replayed as
 *    a Bearer token (and an access token cannot be pasted in as a cookie).
 *    `verifyAccessToken` and `verifyPageSession` each reject the other's token.
 * 2. **The cookie authorises reads, never writes.** Every mutation still goes
 *    through a Bearer-gated route handler, so classic CSRF stays out of scope
 *    (§10.2) even though a cookie now exists — `sameSite=lax` is belt-and-braces.
 *
 * Lifetime follows the REFRESH token, not the 15-minute access token — staff 7
 * days, caregiver 30. That is what upholds the caregiver rule (§10.1, Flow A):
 * an expired access token must NEVER bounce a caregiver to a login screen, so
 * the thing gating their pages has to outlive it. A caregiver sees /login only
 * once the 30-day window itself lapses.
 *
 * Cookie I/O and the redirect guards live in dal.ts; this module is pure so it
 * can be unit-tested without a request context.
 */

export const SESSION_COOKIE = "pc_session";

const ISSUER = "priyocare";
/** Deliberately NOT the access-token audience ("priyocare") — see rule 1 above. */
const AUDIENCE = "priyocare:page-session";

/** Mirrors REFRESH_TTL_DAYS in sessions.ts: privilege buys a shorter window. */
const SESSION_TTL_DAYS: Record<SubjectType, number> = {
  customer: 30,
  caregiver: 30,
  staff: 7,
};

export interface PageSessionClaims {
  /** subject id (users.id / caregivers.id / staff_accounts.id) */
  sub: string;
  st: SubjectType;
  /** role claim — staff only (§10.1) */
  role?: StaffRole;
}

export function sessionTtlSeconds(subjectType: SubjectType): number {
  return SESSION_TTL_DAYS[subjectType] * 86_400;
}

/**
 * Sign a page session. `ttlSeconds` is overridable only to test expiry;
 * callers should let it default to the per-subject window.
 */
export async function signPageSession(
  claims: PageSessionClaims,
  ttlSeconds: number = sessionTtlSeconds(claims.st),
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ st: claims.st, ...(claims.role ? { role: claims.role } : {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getSecret());
}

/** Verify a page session. Returns claims, or null if invalid/expired/tampered. */
export async function verifyPageSession(
  token: string | undefined,
): Promise<PageSessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const st = payload.st as SubjectType | undefined;
    if (!payload.sub || (st !== "customer" && st !== "caregiver" && st !== "staff")) {
      return null;
    }
    const role = payload.role as StaffRole | undefined;
    return { sub: payload.sub, st, ...(role ? { role } : {}) };
  } catch {
    return null;
  }
}
