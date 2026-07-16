import "server-only";

import { count, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  bookingItems,
  bookings,
  patientProfiles,
  payments,
  serviceVariants,
  slots,
  users,
} from "../db/schema";
import { computeBookingTotal, pricesMatch } from "../../shared/pricing";
import { formatBookingCode } from "../../shared/booking-code";
import type { CreateBookingInput } from "../../shared/booking-schemas";

/** Client-sent total did not match the server-recomputed total (§9, AC 2.2). */
export class PriceMismatchError extends Error {
  constructor(readonly serverTotal: number) {
    super(`Price mismatch: server total ${serverTotal}`);
  }
}

/** The chosen slot filled between selection and submit (§9, AC 1.2). */
export class SlotFullError extends Error {}

export interface BookingActor {
  subjectType: "customer" | "staff";
  subjectId: number;
}

/**
 * Create a booking (PRD §9). In one transaction:
 *  1. recompute the total from the catalogue and block on any mismatch;
 *  2. race-safely claim slot capacity (UPDATE … WHERE booked_count < capacity);
 *  3. insert the booking, item snapshots, and the payment row.
 * The price check and the insert share the transaction — never a post-hoc
 * reconciliation. On mismatch nothing is written and no charge is attempted.
 */
export async function createBooking(input: CreateBookingInput, actor?: BookingActor) {
  return getDb().transaction(async (tx) => {
    // 1. Recompute price from the live catalogue.
    const variantIds = input.items.map((i) => i.variantId);
    const variants = await tx
      .select({ id: serviceVariants.id, nameEn: serviceVariants.nameEn, priceBdt: serviceVariants.priceBdt })
      .from(serviceVariants)
      .where(inArray(serviceVariants.id, variantIds));
    const byId = new Map(variants.map((v) => [v.id, v]));

    const priced = input.items.map((item) => {
      const variant = byId.get(item.variantId);
      if (!variant) throw new PriceMismatchError(0);
      return {
        variantId: item.variantId,
        name: variant.nameEn,
        priceBdt: Number(variant.priceBdt),
        quantity: item.quantity,
      };
    });

    const serverTotal = computeBookingTotal(priced);
    if (!pricesMatch(serverTotal, input.priceBdt)) {
      throw new PriceMismatchError(serverTotal);
    }

    // 2. Race-safe slot capacity: exactly one of two concurrent last-slot
    //    bookings wins; the loser gets zero rows back → SlotFullError → 409.
    if (input.slotId !== undefined) {
      const claimed = await tx
        .update(slots)
        .set({ bookedCount: sql`${slots.bookedCount} + 1` })
        .where(sql`${slots.id} = ${input.slotId} AND ${slots.bookedCount} < ${slots.capacity}`)
        .returning({ id: slots.id });
      if (claimed.length === 0) throw new SlotFullError();
    }

    // 3a. Resolve the customer (authed customer, else find-or-create by phone).
    let customerId: number;
    if (actor?.subjectType === "customer") {
      customerId = actor.subjectId;
    } else {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phone, input.patientPhone))
        .limit(1);
      customerId =
        existing?.id ??
        (await tx.insert(users).values({ name: input.patientName, phone: input.patientPhone }).returning({ id: users.id }))[0].id;
    }

    const [patient] = await tx
      .insert(patientProfiles)
      .values({ userId: customerId, name: input.patientName })
      .returning({ id: patientProfiles.id });

    // 3b. Daily sequence → booking code.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [{ c }] = await tx
      .select({ c: count() })
      .from(bookings)
      .where(gte(bookings.createdAt, startOfDay));
    const bookingCode = formatBookingCode(Number(c) + 1);

    // 3c. Insert booking with the SERVER total (never the client's number).
    const [booking] = await tx
      .insert(bookings)
      .values({
        bookingCode,
        customerId,
        patientId: patient.id,
        serviceId: input.serviceId,
        slotId: input.slotId,
        zoneId: input.zoneId,
        addressLine: input.addressLine,
        landmark: input.landmark,
        lat: String(input.lat),
        lng: String(input.lng),
        prescriptionUrl: input.prescriptionUrl,
        priceBdt: serverTotal.toFixed(2),
        status: "confirmed",
        source: "web",
      })
      .returning();

    // 3d. Item snapshots — never joined to the live catalogue for history.
    await tx.insert(bookingItems).values(
      priced.map((p) => ({
        bookingId: booking.id,
        variantId: p.variantId,
        nameSnapshot: p.name,
        priceSnapshot: p.priceBdt.toFixed(2),
        quantity: p.quantity,
      })),
    );

    // 3e. Payment row (gateway webhook is the source of truth for status).
    await tx.insert(payments).values({
      bookingId: booking.id,
      method: input.paymentMethod,
      status: "pending",
      amountBdt: serverTotal.toFixed(2),
    });

    return booking;
  });
}
