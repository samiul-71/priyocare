import { eq } from "drizzle-orm";
import { caregiverLoginSchema } from "@/lib/shared/auth-schemas";
import { getDb } from "@/lib/server/db";
import { caregivers } from "@/lib/server/db/schema";
import { verifyPin } from "@/lib/server/auth/password";
import { issueSession } from "@/lib/server/auth/sessions";
import { setPageSessionCookie } from "@/lib/server/auth/dal";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

// POST /api/v1/auth/caregiver/login — phone + PIN (§8, §10.1). A caregiver has
// no credential before approval: pin_hash is null and verification_status must
// be 'approved' (§7.4, §12.2).
export async function POST(req: Request) {
  const parsed = await parseBody(req, caregiverLoginSchema);
  if (!parsed.ok) return parsed.response;
  const { phone, pin } = parsed.data;

  const limit = await rateLimiter.check(
    `login:ip:${clientIp(req)}`,
    RATE_LIMITS.loginPerIp.limit,
    RATE_LIMITS.loginPerIp.windowMs,
  );
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

  const invalid = Response.json(
    { error: { code: "invalid_credentials", message: "Wrong phone or PIN." } },
    { status: 401 },
  );

  const [caregiver] = await getDb()
    .select()
    .from(caregivers)
    .where(eq(caregivers.phone, phone))
    .limit(1);

  if (!caregiver || !caregiver.pinHash) return invalid;
  if (caregiver.verificationStatus !== "approved") return invalid;
  if (!(await verifyPin(caregiver.pinHash, pin))) return invalid;

  const session = await issueSession("caregiver", caregiver.id);
  // 30-day page cookie — long by design, so an expired 15-min access token can
  // never bounce a caregiver to the login screen mid-shift (§10.1, Flow A).
  await setPageSessionCookie({ sub: String(caregiver.id), st: "caregiver" });
  return Response.json(session);
}
