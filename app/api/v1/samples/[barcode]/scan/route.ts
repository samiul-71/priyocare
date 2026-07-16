import { z } from "zod";
import { applySampleScan, NotAssignedError } from "@/lib/server/caregiver/mutations";
import { requireSubject, limitWrites } from "@/lib/server/auth/require-auth";
import { parseBody } from "@/lib/server/http";

/**
 * POST /api/v1/samples/{barcode}/scan — advance chain of custody (§8).
 *
 * The barcode is the path, so a scan reads as what it is: an event about a
 * physical tube. Everything else — who, which booking, when — comes from the
 * token and the body.
 *
 * Idempotent by `event_uuid` like every other caregiver write: scanning the
 * same tube twice (a jumpy reader, a retried sync) is one event, not two custody
 * records.
 */
const scanBodySchema = z.object({
  eventUuid: z.string().trim().uuid(),
  bookingId: z.coerce.number().int().positive(),
  occurredAt: z.coerce.date(),
});

export async function POST(req: Request, ctx: { params: Promise<{ barcode: string }> }) {
  // PRD §8 lists this as caregiver/lab. The lab actor does not exist yet
  // (no lab portal, no lab credential), so today it is caregiver-only —
  // narrower than the spec on purpose rather than inventing an actor.
  const auth = await requireSubject(req, "caregiver");
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const { barcode } = await ctx.params;
  const parsed = await parseBody(req, scanBodySchema);
  if (!parsed.ok) return parsed.response;

  if (barcode.trim().length < 4 || barcode.length > 32) {
    return Response.json(
      { error: { code: "invalid_barcode", message: "That barcode does not look right." } },
      { status: 400 },
    );
  }

  try {
    const result = await applySampleScan(
      { ...parsed.data, barcode: barcode.trim() },
      Number(auth.sub),
    );
    return Response.json({
      ok: true,
      eventUuid: result.eventUuid,
      duplicate: !result.applied,
      // False = we had no such tube on file and created one. Ops sees the
      // orphan; the collector is not stopped mid-round over paperwork.
      sampleFound: result.sampleFound,
    });
  } catch (err) {
    if (err instanceof NotAssignedError) {
      return Response.json(
        { error: { code: "not_assigned", message: "That job is not assigned to you." } },
        { status: 403 },
      );
    }
    throw err;
  }
}
