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
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
