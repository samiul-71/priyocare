import { createBookingSchema } from "@/lib/shared/booking-schemas";
import { authenticate, jsonError } from "@/lib/server/auth/require-auth";
import {
  createBooking,
  PriceMismatchError,
  SlotFullError,
  type BookingActor,
} from "@/lib/server/booking/create";
import { RATE_LIMITS, rateLimiter } from "@/lib/server/auth/rate-limit";
import { clientIp, parseBody, tooManyRequests } from "@/lib/server/http";

// POST /api/v1/bookings — booking submit (§8). Guest or customer (Ops books via
// /office/bookings). Price is re-validated server-side in the same transaction
// as the insert; a mismatch is 422 with no booking and no charge (AC 2.2). A
// slot that just filled is 409 with no charge attempted (AC 1.2).
//
// Send an `Idempotency-Key` header to make a retry safe (S-1): the same key
// returns the original booking rather than taking a second slot and queueing a
// second payment. Without one, a retry is a second booking — which is why the
// checkout form always sends one.
export async function POST(req: Request) {
  const limit = await rateLimiter.check(
    `booking:ip:${clientIp(req)}`,
    RATE_LIMITS.writePerAccount.limit,
    RATE_LIMITS.writePerAccount.windowMs,
  );
  if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

  const parsed = await parseBody(req, createBookingSchema, {
    idempotencyKey: req.headers.get("idempotency-key")?.trim() || undefined,
  });
  if (!parsed.ok) return parsed.response;

  const claims = await authenticate(req);
  const actor: BookingActor | undefined =
    claims && (claims.st === "customer" || claims.st === "staff")
      ? { subjectType: claims.st, subjectId: Number(claims.sub) }
      : undefined;

  try {
    const booking = await createBooking(parsed.data, actor);
    return Response.json(
      {
        id: booking.id,
        bookingCode: booking.bookingCode,
        status: booking.status,
        priceBdt: booking.priceBdt,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof PriceMismatchError) {
      return jsonError(422, "price_mismatch", "The price changed — please review the total before paying.");
    }
    if (err instanceof SlotFullError) {
      return jsonError(409, "slot_full", "This slot just filled — please pick another.");
    }
    throw err;
  }
}
