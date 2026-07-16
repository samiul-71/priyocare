import { eq } from "drizzle-orm";
import { resetPinWithOtpSchema } from "@/lib/shared/auth-schemas";
import { getDb } from "@/lib/server/db";
import { caregivers } from "@/lib/server/db/schema";
import { verifyOtp } from "@/lib/server/auth/otp";
import { setPinAfterOtp } from "@/lib/server/caregiver/pin";
import { issueSession } from "@/lib/server/auth/sessions";
import { setPageSessionCookie } from "@/lib/server/auth/dal";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

/**
 * POST /api/v1/auth/caregiver/forgot-pin/verify — code + new PIN → signed in.
 *
 * The PIN she sets here is **not** `must_change`, unlike the one Ops issues:
 * nobody else ever saw it. That asymmetry is the entire reason this flow is
 * worth having — it takes Ops out of the loop for the common case.
 *
 * The OTP is consumed on the first verify (success or not, it counts an
 * attempt), so a code cannot be reused, and `setPinAfterOtp` revokes every
 * existing session: a forgotten PIN may mean a lost phone, and whoever has that
 * phone should not stay signed in.
 */
export async function POST(req: Request) {
  const parsed = await parseBody(req, resetPinWithOtpSchema);
  if (!parsed.ok) return parsed.response;
  const { phone, code, newPin } = parsed.data;

  const limit = await rateLimiter.check(
    `otp:verify:${clientIp(req)}`,
    RATE_LIMITS.otpPerIp.limit,
    RATE_LIMITS.otpPerIp.windowMs,
  );
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

  const invalid = Response.json(
    { error: { code: "invalid_code", message: "That code is wrong or has expired." } },
    { status: 401 },
  );

  // Verify the code BEFORE touching the caregiver row: a wrong code must not
  // even confirm that the phone belongs to anyone.
  if (!verifyOtp(phone, code)) return invalid;

  const [caregiver] = await getDb()
    .select({ id: caregivers.id })
    .from(caregivers)
    .where(eq(caregivers.phone, phone))
    .limit(1);
  if (!caregiver) return invalid;

  const updated = await setPinAfterOtp(caregiver.id, newPin);
  if (!updated) return invalid;

  // She proved she holds the phone and chose the PIN — sign her straight in
  // rather than bouncing her to a login she would immediately pass.
  const session = await issueSession("caregiver", caregiver.id);
  await setPageSessionCookie({ sub: String(caregiver.id), st: "caregiver" });
  return Response.json(session);
}
