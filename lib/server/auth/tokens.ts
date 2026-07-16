import "server-only";

import { SignJWT, jwtVerify } from "jose";

/**
 * Access tokens (PRD §10.1). Stateless, short-lived JWTs (HS256). Refresh
 * tokens are NOT JWTs — they are opaque random strings stored hashed in the
 * `refresh_tokens` table (see sessions.ts), so they can be rotated and revoked
 * server-side. One verification path, three `subject_type` values (§4.4).
 *
 * The signing secret lives only in an env var on the VPS (§10.4) — never
 * committed, rotated on suspected exposure or contractor offboarding.
 */

export type SubjectType = "customer" | "caregiver" | "staff";
export type StaffRole = "ops" | "admin";

export interface AccessClaims {
  /** subject id (users.id / caregivers.id / staff_accounts.id) */
  sub: string;
  /** subject_type */
  st: SubjectType;
  /** role claim — staff only (§10.1) */
  role?: StaffRole;
}

const ISSUER = "priyocare";
const AUDIENCE = "priyocare";
const ACCESS_TTL_SECONDS = 15 * 60; // ~15 min (§10.1)

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be set (≥32 chars) in the VPS environment; never commit it.",
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign an access token. `ttlSeconds` is overridable only to support testing
 * expiry; production always uses the 15-minute default.
 */
export async function signAccessToken(
  claims: AccessClaims,
  ttlSeconds: number = ACCESS_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ st: claims.st, ...(claims.role ? { role: claims.role } : {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds);
  return jwt.sign(getSecret());
}

/** Verify an access token. Returns claims, or null if invalid/expired/tampered. */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
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
