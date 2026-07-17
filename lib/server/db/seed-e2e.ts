// E2E fixture (`npm run db:seed-e2e`). LOCAL/TEST ONLY — refuses in production.
//
// The caregiver a11y suite needs something the office suite did not: office
// pages render fine with no data, but /caregiver/today/{tasks,scan,care-log}
// call notFound() without an assigned job, and every caregiver page diverts to
// /caregiver/change-pin until her PIN is hers. So a real pass needs a real
// caregiver with a real job.
//
// IT GOES THROUGH THE ACTUAL CHAIN — application → 5 steps → payout →
// activate → issue PIN → change PIN — using the same mutations Ops uses. That
// is deliberate. A script that INSERTed an approved caregiver with a PIN would
// bypass the §7.4/§12.2 activation gate, which is exactly the shortcut refused
// during module 07; here the fixture exercises the gate instead of ducking it.
// If the gate ever breaks, this script stops working, which is a feature.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  bookingItems,
  bookings,
  careLogs,
  caregivers,
  patientProfiles,
  staffAccounts,
  syncEvents,
  users,
} from "./schema";
import {
  activateCaregiver,
  createCaregiverApplication,
  issueCaregiverPin,
  updateCaregiverFile,
  transitionVerificationStep,
} from "../office/mutations";
import { changeCaregiverPin, resetCaregiverPin } from "../caregiver/pin";
import { REQUIRED_STEPS } from "../../shared/onboarding";
import { createCaregiverSchema, updateCaregiverSchema } from "../../shared/office-schemas";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — DATABASE_URL comes from the real environment.
}

const PHONE = process.env.E2E_CAREGIVER_PHONE ?? "01799887766";
const PIN = process.env.E2E_CAREGIVER_PIN ?? "824193";
const FIXTURE_CODE = "PC-E2E-0001";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed E2E fixtures in production.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema: { caregivers, bookings } });

  try {
    const [staff] = await db
      .select({ id: staffAccounts.id })
      .from(staffAccounts)
      .where(eq(staffAccounts.role, "admin"))
      .limit(1);
    if (!staff) {
      throw new Error("No admin staff account — run db:create-staff first.");
    }

    // 1. The caregiver, through the real onboarding chain.
    let [caregiver] = await db
      .select({ id: caregivers.id, pinHash: caregivers.pinHash })
      .from(caregivers)
      .where(eq(caregivers.phone, `+880${PHONE.replace(/^0/, "")}`))
      .limit(1);

    if (!caregiver) {
      // PARSE, do not cast. `createCaregiverApplication` expects input that has
      // already been through `createCaregiverSchema`, which is what normalises
      // `01…` to `+8801…`. An `as` cast type-checks and silently stores the raw
      // number, so login — which normalises — never finds her. That is exactly
      // the bug this comment exists to stop someone reintroducing.
      const input = createCaregiverSchema.parse({
        fullName: "E2E Caregiver",
        phone: PHONE,
        skill: "nurse",
        bnmcRegNo: "BNMC-E2E-01",
        nidFrontRef: "e2e/nid-front",
        nidBackRef: "e2e/nid-back",
        photoRef: "e2e/photo",
        policeClearanceRef: "e2e/police",
        zones: [1],
      });
      const created = await createCaregiverApplication(input);
      caregiver = { id: created.id, pinHash: null };
      console.log(`  application #${created.id} created (pending, no PIN)`);
    }

    for (const step of REQUIRED_STEPS) {
      await transitionVerificationStep(caregiver.id, step, staff.id);
    }
    // Parsed too — the payout number is a bdPhone and must normalise the same way.
    await updateCaregiverFile(caregiver.id, updateCaregiverSchema.parse({ bkashPayoutNumber: PHONE }));

    const activation = await activateCaregiver(caregiver.id);
    if (!activation.canActivate) {
      throw new Error(`The gate refused activation: ${activation.missing.join(", ")}`);
    }

    // Always land on a known PIN that is HERS (must_change false), or every
    // caregiver page would divert to /caregiver/change-pin and the suite would
    // scan that instead of the screens it claims to cover.
    const issued = caregiver.pinHash
      ? await resetCaregiverPin(caregiver.id)
      : await issueCaregiverPin(caregiver.id);
    if (!issued.ok) throw new Error(`Could not issue a PIN: ${JSON.stringify(issued)}`);
    const temp = "pin" in issued ? issued.pin : "";
    const changed = await changeCaregiverPin(caregiver.id, temp, PIN);
    if (!changed.ok) throw new Error(`Could not settle the PIN: ${changed.reason}`);

    // 2. Today's job. Rebuilt every run so it is always dispatched and today —
    //    `getTodayJob` filters on both.
    const [existing] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.bookingCode, FIXTURE_CODE))
      .limit(1);

    if (existing) {
      await db.delete(syncEvents).where(eq(syncEvents.bookingId, existing.id));
      await db.delete(careLogs).where(eq(careLogs.bookingId, existing.id));
      await db.delete(bookingItems).where(eq(bookingItems.bookingId, existing.id));
      await db.delete(bookings).where(eq(bookings.id, existing.id));
    }

    const [user] = await db
      .insert(users)
      .values({ name: "E2E Customer", phone: "+8801700000001" })
      .onConflictDoNothing()
      .returning({ id: users.id });
    const customerId =
      user?.id ??
      (
        await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.phone, "+8801700000001"))
          .limit(1)
      )[0].id;

    const [patient] = await db
      .insert(patientProfiles)
      .values({ userId: customerId, name: "E2E Patient" })
      .returning({ id: patientProfiles.id });

    const [booking] = await db
      .insert(bookings)
      .values({
        bookingCode: FIXTURE_CODE,
        customerId,
        patientId: patient.id,
        serviceId: 2, // nursing — matches her skill
        zoneId: 1,
        caregiverId: caregiver.id,
        addressLine: "House 12, Road 27, Dhanmondi",
        landmark: "Beside Anam Rangs Plaza",
        lat: "23.750900",
        lng: "90.373500",
        priceBdt: "600.00",
        status: "dispatched",
        source: "phone",
      })
      .returning({ id: bookings.id });

    // A ticklist for /caregiver/today/tasks to render.
    const variants = await db
      .select({ id: bookingItems.id })
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, booking.id));
    if (variants.length === 0) {
      await db.insert(bookingItems).values([
        { bookingId: booking.id, variantId: 1, nameSnapshot: "Deep Muscle Injection", priceSnapshot: "400.00", quantity: 1 },
        { bookingId: booking.id, variantId: 2, nameSnapshot: "IM Injection", priceSnapshot: "300.00", quantity: 1 },
      ]);
    }

    console.log(`E2E fixture ready: caregiver #${caregiver.id} (${PHONE}), booking ${FIXTURE_CODE}`);
    console.log(`Set E2E_CAREGIVER_PHONE / E2E_CAREGIVER_PIN in .env.local to run the suite.`);
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

