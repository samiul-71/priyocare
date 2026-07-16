import { listCatalogue } from "@/lib/server/catalogue/queries";
import { isDbConfigured } from "@/lib/server/db";

// GET /api/v1/services — the public catalogue (§8): services, their archetype,
// and (for `visit` services) their priced variants.
//
// Returns REAL ids. Until now the office phone-booking form guessed them from
// the seed's sort order, which is right only on a freshly seeded database and
// silently wrong on any other — a booking against the wrong service id.
//
// Public and read-only: this is the same catalogue the marketing pages show.
// Inactive services are included but flagged, because Ops books them over the
// phone (Physiotherapy has no web flow at all) — hiding them here would make
// the P0 phone-booking form unable to see half the business.
export async function GET() {
  if (!isDbConfigured()) {
    return Response.json(
      { error: { code: "unconfigured", message: "The catalogue is unavailable." } },
      { status: 503 },
    );
  }

  const services = await listCatalogue();
  return Response.json(
    { services },
    // The catalogue changes rarely and is identical for everyone; a short
    // shared cache spares the DB the checkout page's repeat reads.
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
