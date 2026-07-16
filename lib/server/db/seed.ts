// Seed CLI (run with `npm run db:seed`, needs DATABASE_URL). Like the migration
// tooling and schema.ts, this is a Node script, not app code, so it creates its
// own client and omits the `server-only` guard (which is for the client bundle).
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  NURSING_VARIANTS,
  SERVICE_SEED,
  ZONES,
} from "../../shared/catalogue-seed";
import { serviceVariants, services, zones } from "./schema";

// Like drizzle.config.ts: a plain Node process gets no .env.local from Next.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — DATABASE_URL comes from the real environment (the VPS).
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema: { services, serviceVariants, zones } });

  try {
    // Zones — insert any that are missing (no natural unique key on name).
    const existingZones = new Set((await db.select().from(zones)).map((z) => z.name));
    const zonesToAdd = ZONES.filter((name) => !existingZones.has(name)).map(
      (name) => ({ name, isActive: true }),
    );
    if (zonesToAdd.length) await db.insert(zones).values(zonesToAdd);

    // Services — slug is unique, so this is idempotent.
    await db
      .insert(services)
      .values(
        SERVICE_SEED.map((s) => ({
          slug: s.slug,
          archetype: s.archetype,
          nameBn: s.nameBn,
          nameEn: s.nameEn,
          requiresPrescription: s.requiresPrescription,
          requiredSkill: s.requiredSkill,
          windowStart: s.windowStart,
          windowEnd: s.windowEnd,
          isActive: s.isActive,
          sortOrder: s.sortOrder,
        })),
      )
      .onConflictDoNothing({ target: services.slug });

    // Nursing variants — resolve the parent service id, insert any missing.
    const nursing = (
      await db.select().from(services).where(eq(services.slug, "nursing"))
    )[0];
    if (nursing) {
      const existingVariants = new Set(
        (
          await db
            .select()
            .from(serviceVariants)
            .where(eq(serviceVariants.serviceId, nursing.id))
        ).map((v) => v.nameEn),
      );
      const variantsToAdd = NURSING_VARIANTS.filter(
        (v) => !existingVariants.has(v.nameEn),
      ).map((v) => ({
        serviceId: nursing.id,
        nameBn: v.nameBn,
        nameEn: v.nameEn,
        priceBdt: v.priceBdt.toFixed(2),
        durationMin: v.durationMin ?? null,
        isActive: true,
      }));
      if (variantsToAdd.length)
        await db.insert(serviceVariants).values(variantsToAdd);
    }

    const [{ count: serviceCount }] = await db.select().from(services).then(
      (rows) => [{ count: rows.length }],
    );
    console.log(
      `Seed complete: ${zonesToAdd.length} zones added, ${serviceCount} services present, nursing variants synced.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
