/**
 * Geofence maths (PRD §9, §6 Flow B, module 07).
 *
 * READ THIS BEFORE USING ANY OF IT: the geofence is **advisory only**. It never
 * blocks a check-in, never fails a request, and is **never signalled to the
 * caregiver** in any form — not a warning, not a colour, not a slower response
 * (AC-1.1/1.2: the 2km check-in must be visually indistinguishable from the
 * one at the doorstep). A mismatch creates an `ops_alerts` row that only
 * `/office/alerts` ever reads, framed neutrally, never as an accusation.
 *
 * The reason is human, not technical: GPS drifts, buildings block signal, and
 * addresses in Dhaka are approximate. A caregiver who learns the app is judging
 * her location will start gaming it, and the honest ones will feel accused for
 * their phone's error. Ops looks at patterns; the app says nothing.
 */

/** Beyond this the check-in is worth an Ops look — never a caregiver-visible event. */
export const GEOFENCE_RADIUS_M = 500;

const EARTH_RADIUS_M = 6_371_000;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres (haversine). Accurate to well within a metre
 * at city scale, which is far tighter than the 500m question being asked.
 */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Is this check-in far enough from the booking address to be worth an Ops look?
 *
 * Returns a fact for `/office/alerts`, NOT a decision about the check-in — the
 * check-in already succeeded before anyone called this.
 */
export function isGeofenceMismatch(
  captured: LatLng,
  booking: LatLng,
  radiusM: number = GEOFENCE_RADIUS_M,
): boolean {
  return distanceMetres(captured, booking) > radiusM;
}
