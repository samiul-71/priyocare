import { eq } from "drizzle-orm";
import { staffLoginSchema } from "@/lib/shared/auth-schemas";
import { getDb } from "@/lib/server/db";
import { staffAccounts } from "@/lib/server/db/schema";
import { verifyPassword } from "@/lib/server/auth/password";
import { issueSession } from "@/lib/server/auth/sessions";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

// POST /api/v1/auth/staff/login — email + password → token with a role claim
// (§8, §10.1). No self-registration; inactive accounts cannot log in.
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
  return Response.json(session);
}
