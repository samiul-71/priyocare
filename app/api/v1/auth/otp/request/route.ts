import { otpRequestSchema } from "@/lib/shared/auth-schemas";
import { issueOtp, sms } from "@/lib/server/auth/otp";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

// POST /api/v1/auth/otp/request — start customer login (§8). Rate-limited per
// phone and per IP (§10.3). Response is identical whether or not the phone is
// known — never reveal account existence.
export async function POST(req: Request) {
  const parsed = await parseBody(req, otpRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { phone } = parsed.data;

  const byPhone = await rateLimiter.check(
    `otp:phone:${phone}`,
    RATE_LIMITS.otpPerPhone.limit,
    RATE_LIMITS.otpPerPhone.windowMs,
  );
  const byIp = await rateLimiter.check(
    `otp:ip:${clientIp(req)}`,
    RATE_LIMITS.otpPerIp.limit,
    RATE_LIMITS.otpPerIp.windowMs,
  );
  if (!byPhone.allowed || !byIp.allowed) {
    return tooManyRequests(Math.max(byPhone.retryAfterMs, byIp.retryAfterMs));
  }

  const code = issueOtp(phone);
  await sms.send(phone, `Your PriyoCare verification code is ${code}. It expires in 5 minutes.`);

  return Response.json({ ok: true });
}
