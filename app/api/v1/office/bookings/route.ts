import { phoneBookingSchema } from "@/lib/shared/office-schemas";
import { requireStaff, limitWrites } from "@/lib/server/auth/require-auth";
import { createPhoneBooking } from "@/lib/server/office/mutations";
import { parseBody } from "@/lib/server/http";

// POST /api/v1/office/bookings — manual phone booking (P0, §3.1). Staff-gated;
// records source='phone' with created_by_staff for any of the services.
export async function POST(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof Response) return auth;

  // Runaway-loop guard, per authenticated account (§10.3).
  const limited = await limitWrites(auth);
  if (limited) return limited;

  const parsed = await parseBody(req, phoneBookingSchema);
  if (!parsed.ok) return parsed.response;

  const booking = await createPhoneBooking(parsed.data, Number(auth.sub));
  return Response.json(
    { id: booking.id, bookingCode: booking.bookingCode },
    { status: 201 },
  );
}
