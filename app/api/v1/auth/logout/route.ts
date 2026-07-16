import { revokeByToken } from "@/lib/server/auth/sessions";
import { clearPageSessionCookie } from "@/lib/server/auth/dal";

// POST /api/v1/auth/logout — ends the caller's own session (§8). Revokes the
// presented refresh token (X-Refresh-Token header or { refreshToken } body) and
// drops the page-session cookie.
//
// NOTE — no Bearer gate here, deliberately (this endpoint used to 401 without a
// valid access token). Logout must never fail closed: access tokens live 15
// minutes but the page cookie lives 7–30 days, so refusing to log someone out
// because their access token had expired left the session that actually matters
// alive. Nothing here is privileged — it only destroys the caller's own
// session, and the refresh token being revoked is its own credential.
export async function POST(req: Request) {
  await clearPageSessionCookie();

  const header = req.headers.get("x-refresh-token");
  let token = header?.trim() ?? null;
  if (!token) {
    try {
      const body = (await req.json()) as { refreshToken?: unknown };
      if (typeof body.refreshToken === "string") token = body.refreshToken;
    } catch {
      // no body — nothing to revoke beyond letting the access token expire
    }
  }

  if (token) await revokeByToken(token);
  return Response.json({ ok: true });
}
