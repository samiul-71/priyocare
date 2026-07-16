/**
 * Booking price integrity (PRD §9, AC 2.x). The checkout total shown to the
 * customer must equal the amount charged, and the server is the source of
 * truth — it recomputes from the catalogue and blocks on any mismatch, in the
 * same transaction as the booking insert. These pure helpers are the shared
 * definition of "the total", used by the checkout UI and the server re-check so
 * the two can never drift.
 */

export const COLLECTION_FEE_BDT = 200; // sample collection / home-visit fee

export interface PricedItem {
  priceBdt: number;
  quantity: number;
}

export function computeItemsSubtotal(items: PricedItem[]): number {
  return items.reduce((sum, i) => sum + i.priceBdt * i.quantity, 0);
}

/** Itemised subtotal plus the collection fee (only when there is ≥1 item). */
export function computeBookingTotal(
  items: PricedItem[],
  collectionFee: number = COLLECTION_FEE_BDT,
): number {
  if (items.length === 0) return 0;
  return computeItemsSubtotal(items) + collectionFee;
}

/** Compare two BDT amounts at 2-decimal precision (avoids float drift). */
export function pricesMatch(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}
