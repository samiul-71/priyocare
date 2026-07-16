import { authenticate, unauthorized } from "@/lib/server/auth/require-auth";
import { revokeByToken } from "@/lib/server/auth/sessions";

// POST /api/v1/auth/logout — any actor with a valid access token (§8). Revokes
// the presented refresh token (X-Refresh-Token header or { refreshToken } body).
export async function POST(req: Request) {
  const claims = await authenticate(req);
  if (!claims) return unauthorized();

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
