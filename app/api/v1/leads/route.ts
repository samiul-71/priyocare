import { createLeadSchema } from "@/lib/shared/lead-schemas";
import { createLead, WrongArchetypeError } from "@/lib/server/leads/mutations";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";
import { isDbConfigured } from "@/lib/server/db";

// POST /api/v1/leads — public enquiry (§8, Flow C). Tourism / insurance /
// mental-health. Rate-limited per IP like the other public write (§10.3): this
// endpoint is unauthenticated by design, so the limiter is the only thing
// between it and a bot filling Ops' board with junk.
export async function POST(req: Request) {
  const limit = await rateLimiter.check(
    `leads:ip:${clientIp(req)}`,
    RATE_LIMITS.leadsPerIp.limit,
    RATE_LIMITS.leadsPerIp.windowMs,
  );
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

  const parsed = await parseBody(req, createLeadSchema);
  if (!parsed.ok) return parsed.response;

  if (!isDbConfigured()) {
    return Response.json(
      { error: { code: "unconfigured", message: "Enquiries are not available right now." } },
      { status: 503 },
    );
  }

  try {
    const lead = await createLead(parsed.data);
    // No slot, no dispatch, no payment — a lead is not a booking (AC-2.1).
    return Response.json({ id: lead.id, leadCode: lead.leadCode, stage: lead.stage }, { status: 201 });
  } catch (err) {
    if (err instanceof WrongArchetypeError) {
      return Response.json(
        {
          error: {
            code: "wrong_archetype",
            message: "That service does not take enquiries. Please book it instead.",
          },
        },
        { status: 422 },
      );
    }
    throw err;
  }
}
