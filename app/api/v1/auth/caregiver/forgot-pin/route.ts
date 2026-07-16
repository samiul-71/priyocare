import { eq } from "drizzle-orm";
import { z } from "zod";
import { bdPhone } from "@/lib/shared/auth-schemas";
import { getDb, isDbConfigured } from "@/lib/server/db";
import { caregivers } from "@/lib/server/db/schema";
import { issueOtp, sms } from "@/lib/server/auth/otp";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

/**
 * POST /api/v1/auth/caregiver/forgot-pin — request a reset code (§10.1's OTP
 * fallback: PIN is primary, OTP is how you get back when you forget it).
 *
 * ALWAYS ANSWERS 200, whether or not that phone belongs to a caregiver. The
 * response must not reveal who works here: "not a caregiver" would turn this
 * into a free directory of PriyoCare staff for anyone with a phone book, and
 * these are women whose home addresses are in the system.
 *
 * Rate-limited per phone and per IP — an unauthenticated endpoint that sends
 * SMS costs real money and can be turned into a way to harass someone's phone.
 */
const forgotPinSchema = z.object({ phone: bdPhone });

export async function POST(req: Request) {
  const parsed = await parseBody(req, forgotPinSchema);
  if (!parsed.ok) return parsed.response;
  const { phone } = parsed.data;

  for (const [key, policy] of [
    [`otp:phone:${phone}`, RATE_LIMITS.otpPerPhone],
    [`otp:ip:${clientIp(req)}`, RATE_LIMITS.otpPerIp],
  ] as const) {
    const limit = await rateLimiter.check(key, policy.limit, policy.windowMs);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);
  }

  // The honest answer either way — see above.
  const ok = Response.json({ ok: true });
  if (!isDbConfigured()) return ok;

  const [caregiver] = await getDb()
    .select({ id: caregivers.id, verificationStatus: caregivers.verificationStatus })
    .from(caregivers)
    .where(eq(caregivers.phone, phone))
    .limit(1);

  // Unknown phone, or suspended: no code, same response. A suspended caregiver
  // must not be able to reset her way back in (Flow C).
  if (!caregiver || caregiver.verificationStatus !== "approved") return ok;

  const code = issueOtp(phone);
  await sms.send(phone, `PriyoCare: your PIN reset code is ${code}. It expires in 5 minutes.`);
  return ok;
}
