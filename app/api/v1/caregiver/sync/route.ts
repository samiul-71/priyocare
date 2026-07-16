import { syncBatchSchema } from "@/lib/shared/caregiver-schemas";
import { syncBatch } from "@/lib/server/caregiver/mutations";
import { requireSubject } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/caregiver/sync — a whole offline shift in one batch (§8, S-2).
//
// Idempotent by event_uuid: the same batch twice produces the same rows
// (AC-2.2, S-3). So this endpoint answers 200 to a replay rather than 409 — a
// phone on a dying signal WILL send twice, and the honest answer is "yes, I
// have those", not an error that makes it retry.
//
// The per-uuid results let the client delete exactly what landed and keep the
// rest queued. Nothing is ever dropped from the device on a guess.
export async function POST(req: Request) {
  const auth = await requireSubject(req, "caregiver");
  if (auth instanceof Response) return auth;

  const parsed = await parseBody(req, syncBatchSchema);
  if (!parsed.ok) return parsed.response;

  const result = await syncBatch(parsed.data.events, Number(auth.sub));

  return Response.json({
    ok: true,
    applied: result.applied,
    duplicates: result.duplicates,
    // Every uuid we now hold — applied or already known. Both are safe to
    // delete locally; only an event missing from this list stays queued.
    accepted: result.results.map((r) => r.eventUuid),
  });
}
