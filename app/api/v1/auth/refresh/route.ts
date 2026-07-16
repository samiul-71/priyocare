import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { staffAccounts } from "@/lib/server/db/schema";
import { signAccessToken } from "@/lib/server/auth/tokens";
import { verifyAndRotate } from "@/lib/server/auth/sessions";

// POST /api/v1/auth/refresh — silent, any actor (§8). Rotates the refresh pair
// and revokes the old token. The caregiver PWA calls this before /sync, never
// forcing a mid-shift login (§10.1). Token comes from the X-Refresh-Token
// header or a { refreshToken } body.
async function readRefreshToken(req: Request): Promise<string | null> {
  const header = req.headers.get("x-refresh-token");
  if (header) return header.trim();
  try {
    const body = (await req.json()) as { refreshToken?: unknown };
    return typeof body.refreshToken === "string" ? body.refreshToken : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const presented = await readRefreshToken(req);
  const invalid = Response.json(
    { error: { code: "invalid_refresh", message: "Refresh token is invalid or expired." } },
    { status: 401 },
  );
  if (!presented) return invalid;

  const rotated = await verifyAndRotate(presented);
  if (!rotated) return invalid;

  // Staff: re-check the account on every refresh so a deactivated account
  // cannot keep minting access tokens; carry the role claim forward.
  let role: "ops" | "admin" | undefined;
  if (rotated.subjectType === "staff") {
    const [staff] = await getDb()
      .select()
      .from(staffAccounts)
      .where(eq(staffAccounts.id, rotated.subjectId))
      .limit(1);
    if (!staff || !staff.isActive) return invalid;
    role = staff.role;
  }

  const accessToken = await signAccessToken({
    sub: String(rotated.subjectId),
    st: rotated.subjectType,
    ...(role ? { role } : {}),
  });

  return Response.json({
    accessToken,
    refreshToken: rotated.refreshToken,
    tokenType: "Bearer",
    expiresIn: 900,
  });
}
