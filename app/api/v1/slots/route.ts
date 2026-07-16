import { jsonError } from "@/lib/server/auth/require-auth";
import { listOpenSlots } from "@/lib/server/booking/slots";

// GET /api/v1/slots?zone_id&service_id&date — slot picker (§8). Full slots are
// excluded server-side, so a full slot never reaches the client (AC 1.1).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const zoneId = Number(searchParams.get("zone_id"));
  const serviceId = Number(searchParams.get("service_id"));
  const date = searchParams.get("date") ?? undefined;

  if (!zoneId || !serviceId) {
    return jsonError(400, "missing_params", "zone_id and service_id are required.");
  }

  const slots = await listOpenSlots(zoneId, serviceId, date);
  return Response.json({ slots });
}
