import "server-only";

import { verifyAccessToken } from "./tokens";
import type { AccessClaims, StaffRole, SubjectType } from "./tokens";

/**
 * Route-handler auth gate (PRD §10). Access tokens are Bearer tokens in the
 * Authorization header (not cookies, so classic CSRF does not apply — §10.2).
 * This is where real authorization happens; the proxy only does optimistic
 * checks and security headers (per Next 16 guidance).
 */

export function bearerFromRequest(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

/** Return verified claims, or null if there is no valid Bearer token. */
export async function authenticate(req: Request): Promise<AccessClaims | null> {
  const token = bearerFromRequest(req);
  if (!token) return null;
  return verifyAccessToken(token);
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export const unauthorized = () =>
  jsonError(401, "unauthorized", "Authentication required.");
export const forbidden = () =>
  jsonError(403, "forbidden", "You do not have access to this resource.");

/**
 * Require a specific actor. Returns claims on success, or a ready-to-return
 * Response (401/403) on failure:
 *
 *   const auth = await requireSubject(req, "staff");
 *   if (auth instanceof Response) return auth;
 */
export async function requireSubject(
  req: Request,
  subjectType: SubjectType,
): Promise<AccessClaims | Response> {
  const claims = await authenticate(req);
  if (!claims) return unauthorized();
  if (claims.st !== subjectType) return forbidden();
  return claims;
}

/** Require a staff actor, optionally with a specific role (e.g. "admin"). */
export async function requireStaff(
  req: Request,
  role?: StaffRole,
): Promise<AccessClaims | Response> {
  const result = await requireSubject(req, "staff");
  if (result instanceof Response) return result;
  if (role && result.role !== role) return forbidden();
  return result;
}
