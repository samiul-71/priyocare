import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { getSecret } from "./tokens";

/**
 * Staff password-reset tokens — the emailed link's payload (§10.1).
 *
 * STATELESS AND MIGRATION-FREE, on purpose. A reset token is a signed JWT with
 * its own audience (never an access token or a page session — the same wall
 * page-session.ts draws), a short life, and one binding claim: `pca`, the
 * account's `password_changed_at` at the moment the link was issued.
 *
 * That `pca` claim is what makes the link single-use without a database row to
 * track: consuming it changes the password, which bumps `password_changed_at`,
 * so the same link (and any other outstanding one) no longer matches and is
 * refused. It is the exact mechanism the page-session guard already uses to end
 * a session issued before a credential changed — reused here, not reinvented.
 */

const ISSUER = "priyocare";
/** Distinct from every other audience in the system (§10.2 rule 1). */
const AUDIENCE = "priyocare:staff-pwreset";
const TTL_SECONDS = 30 * 60; // 30 minutes — long enough to read an email, no longer

export interface ResetTokenClaims {
  staffId: number;
  /** `password_changed_at` (ms) when issued, 0 if it was null. */
  pca: number;
}

export async function signResetToken(claims: ResetTokenClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ pca: claims.pca })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(claims.staffId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(getSecret());
}

/** Verify a reset token. Returns its claims, or null if invalid/expired/tampered. */
export async function verifyResetToken(token: string | undefined): Promise<ResetTokenClaims | null> {
  if (!token) return null;
  const secret = getSecret(); // outside the try — a missing secret is a broken deploy, not a bad token
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    const staffId = Number(payload.sub);
    if (!Number.isInteger(staffId) || staffId <= 0) return null;
    const pca = typeof payload.pca === "number" ? payload.pca : 0;
    return { staffId, pca };
  } catch {
    return null;
  }
}
