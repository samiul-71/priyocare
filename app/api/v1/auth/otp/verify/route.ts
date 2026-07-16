import { eq } from "drizzle-orm";
import { otpVerifySchema } from "@/lib/shared/auth-schemas";
import { getDb } from "@/lib/server/db";
import { users } from "@/lib/server/db/schema";
import { verifyOtp } from "@/lib/server/auth/otp";
import { issueSession } from "@/lib/server/auth/sessions";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

// POST /api/v1/auth/otp/verify — finish customer login (§8). On success,
// find-or-create the user and issue an access + refresh pair.
export async function POST(req: Request) {
  const parsed = await parseBody(req, otpVerifySchema);
  if (!parsed.ok) return parsed.response;
  const { phone, code } = parsed.data;

  const limit = await rateLimiter.check(
    `otp:ip:${clientIp(req)}`,
    RATE_LIMITS.otpPerIp.limit,
    RATE_LIMITS.otpPerIp.windowMs,
  );
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

  if (!verifyOtp(phone, code)) {
    return Response.json(
      { error: { code: "invalid_code", message: "Incorrect or expired code." } },
      { status: 401 },
    );
  }

  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  const user =
    existing[0] ??
    (await db.insert(users).values({ name: "", phone }).returning())[0];

  const session = await issueSession("customer", user.id);
  return Response.json(session);
}
