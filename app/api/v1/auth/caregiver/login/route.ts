import { caregiverLoginSchema } from "@/lib/shared/auth-schemas";
import { verifyCaregiverCredentials } from "@/lib/server/auth/credentials";
import { issueSession } from "@/lib/server/auth/sessions";
import { setPageSessionCookie } from "@/lib/server/auth/dal";
import { beginLoginAttempt, finishLoginAttempt } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

// POST /api/v1/auth/caregiver/login — phone + PIN (§8, §10.1). A caregiver has
// no credential before approval: pin_hash is null and verification_status must
// be 'approved' (§7.4, §12.2), both enforced in verifyCaregiverCredentials.
//
// Unlike the office, the caregiver PWA DOES keep the Bearer pair: its sync
// flush runs outside a rendered page (module 07). So this response carries both
// halves — the 30-day cookie for pages, the tokens for sync.
export async function POST(req: Request) {
  const parsed = await parseBody(req, caregiverLoginSchema);
  if (!parsed.ok) return parsed.response;
  const { phone, pin } = parsed.data;

  // Per-phone is the limit that matters for a 4–6 digit PIN; per-IP is the
  // spray backstop, and only failures count (see rate-limit.ts). Caregivers
  // share mobile-carrier NAT — a tight IP limit would lock out a whole
  // neighbourhood at shift start.
  const identityKey = `login:phone:${phone}`;
  const ipKey = `login:ip:${clientIp(req)}`;
  const throttle = await beginLoginAttempt(identityKey, ipKey);
  if (!throttle.allowed) return tooManyRequests(throttle.retryAfterMs);

  const caregiver = await verifyCaregiverCredentials(phone, pin);
  await finishLoginAttempt(identityKey, ipKey, caregiver !== null);

  if (!caregiver) {
    // Also the answer for "not approved yet" and "suspended" — never
    // distinguished, or this becomes a way to probe someone's status.
    return Response.json(
      { error: { code: "invalid_credentials", message: "Wrong phone or PIN." } },
      { status: 401 },
    );
  }

  const session = await issueSession("caregiver", caregiver.id);
  // 30-day page cookie — long by design, so an expired 15-min access token can
  // never bounce a caregiver to the login screen mid-shift (§10.1, Flow A).
  await setPageSessionCookie({ sub: String(caregiver.id), st: "caregiver" });
  return Response.json(session);
}
