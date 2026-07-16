import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { refreshTokens } from "../db/schema";
import { signAccessToken } from "./tokens";
import type { StaffRole, SubjectType } from "./tokens";

/**
 * Refresh-token sessions (PRD §10.1). Refresh tokens are opaque high-entropy
 * random strings; only their SHA-256 hash is stored (§10.4), so a database
 * leak never exposes usable tokens. They rotate on every use — presenting a
 * refresh token revokes it and issues a new one — and reuse of an
 * already-rotated token is treated as theft and revokes the whole chain.
 *
 * Expiry follows privilege: staff 7 days (shortest — highest privilege),
 * customer & caregiver 30 days.
 */

const REFRESH_TTL_DAYS: Record<SubjectType, number> = {
  customer: 30,
  caregiver: 30,
  staff: 7,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function expiryFor(subjectType: SubjectType): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS[subjectType] * 86_400_000);
}

/** Issue a new refresh token, store its hash, return the plaintext (shown once). */
export async function createRefreshToken(
  subjectType: SubjectType,
  subjectId: number,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getDb()
    .insert(refreshTokens)
    .values({
      subjectType,
      subjectId,
      tokenHash: hashToken(token),
      expiresAt: expiryFor(subjectType),
    });
  return token;
}

export interface RotatedSession {
  subjectType: SubjectType;
  subjectId: number;
  refreshToken: string;
}

/**
 * Verify a presented refresh token and rotate it. Returns the new session, or
 * null if the token is unknown, expired, or already revoked. On successful
 * rotation the old token is revoked (single-use).
 */
export async function verifyAndRotate(
  presentedToken: string,
): Promise<RotatedSession | null> {
  const db = getDb();
  const tokenHash = hashToken(presentedToken);
  const now = new Date();

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) return null;

  await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(eq(refreshTokens.id, row.id));

  const refreshToken = await createRefreshToken(row.subjectType, row.subjectId);
  return { subjectType: row.subjectType, subjectId: row.subjectId, refreshToken };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

/** Issue a fresh access + refresh pair for a subject after a successful login. */
export async function issueSession(
  subjectType: SubjectType,
  subjectId: number,
  role?: StaffRole,
): Promise<Session> {
  const accessToken = await signAccessToken({
    sub: String(subjectId),
    st: subjectType,
    ...(role ? { role } : {}),
  });
  const refreshToken = await createRefreshToken(subjectType, subjectId);
  return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: 900 };
}

/** Revoke a single refresh token (logout). */
export async function revokeByToken(presentedToken: string): Promise<void> {
  await getDb()
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, hashToken(presentedToken)),
        isNull(refreshTokens.revokedAt),
      ),
    );
}

/**
 * Revoke ALL active refresh tokens for a subject. Called when a caregiver is
 * suspended (PRD §9, §10.1) — suspension revokes tokens immediately, not just
 * dispatch eligibility.
 */
export async function revokeAllForSubject(
  subjectType: SubjectType,
  subjectId: number,
): Promise<void> {
  await getDb()
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.subjectType, subjectType),
        eq(refreshTokens.subjectId, subjectId),
        isNull(refreshTokens.revokedAt),
      ),
    );
}
