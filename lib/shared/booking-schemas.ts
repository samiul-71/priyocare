import { z } from "zod";
import { bdPhone } from "./auth-schemas";

/**
 * Customer booking schemas (PRD §5, §8). Shared by the checkout UI and
 * POST /api/v1/bookings. `priceBdt` is the client-computed total; the server
 * recomputes from the catalogue and blocks on mismatch (§9), so this value is
 * validated, never trusted.
 */

export const bookingPaymentMethodSchema = z.enum([
  "bkash",
  "nagad",
  "rocket",
  "card",
  "cash",
]);

export const bookingItemInputSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive().max(50).default(1),
});

export const createBookingSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  zoneId: z.coerce.number().int().positive(),
  slotId: z.coerce.number().int().positive().optional(),
  patientName: z.string().trim().min(1).max(120),
  patientPhone: bdPhone,
  addressLine: z.string().trim().min(1).max(500),
  landmark: z.string().trim().min(1).max(200), // required — Dhaka runs on landmarks
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  items: z.array(bookingItemInputSchema).min(1),
  priceBdt: z.coerce.number().positive().max(10_000_000),
  paymentMethod: bookingPaymentMethodSchema,
  prescriptionUrl: z.string().url().optional(),
  /**
   * Retry key (module 09 §3, S-1). Supplied by the client via the
   * `Idempotency-Key` header, not the body — it describes the REQUEST, not the
   * booking, and putting it in the header keeps it out of forms that might
   * reuse a stale one. The handler merges it in before validation.
   *
   * Optional: Ops' phone bookings do not carry one, and a booking without a key
   * is still a valid booking — just not retry-safe.
   */
  idempotencyKey: z.string().trim().min(8).max(64).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
