import { eq } from "drizzle-orm";
import { staffLoginSchema } from "@/lib/shared/auth-schemas";
import { getDb } from "@/lib/server/db";
import { staffAccounts } from "@/lib/server/db/schema";
import { verifyPassword } from "@/lib/server/auth/password";
import { issueSession } from "@/lib/server/auth/sessions";
import { setPageSessionCookie } from "@/lib/server/auth/dal";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

// POST /api/v1/auth/staff/login — email + password → token with a role claim
// (§8, §10.1). No self-registration; inactive accounts cannot log in.
//
// One credential check serves both halves of the hybrid model (§10.2): the JSON
// body carries the Bearer pair for API calls, and the same response sets the
// httpOnly page-session cookie that /office/* pages are guarded by. Pure API
// clients simply ignore the cookie.
export async function POST(req: Request) {
  const parsed = await parseBody(req, staffLoginSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.data;

  const limit = await rateLimiter.check(
    `login:ip:${clientIp(req)}`,
    RATE_LIMITS.loginPerIp.limit,
    RATE_LIMITS.loginPerIp.windowMs,
  );
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

  const invalid = Response.json(
    { error: { code: "invalid_credentials", message: "Wrong email or password." } },
    { status: 401 },
  );

  const [staff] = await getDb()
    .select()
    .from(staffAccounts)
    .where(eq(staffAccounts.email, email))
    .limit(1);

  if (!staff || !staff.isActive) return invalid;
  if (!(await verifyPassword(staff.passwordHash, password))) return invalid;

  const session = await issueSession("staff", staff.id, staff.role);
  await setPageSessionCookie({ sub: String(staff.id), st: "staff", role: staff.role });
  return Response.json(session);
}
