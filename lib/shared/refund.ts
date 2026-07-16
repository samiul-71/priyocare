/**
 * Cancellation / refund tiers (PRD §9). Computed server-side and shown before
 * the customer confirms — never recalculated client-side.
 *
 *   > 6h before slot      → full refund
 *   2–6h before slot      → 75%
 *   < 2h before slot      → 50%
 *   after caregiver arrived→ 0% (caregiver is still paid)
 *   PriyoCare's own no-show→ full refund + apology credit, automatic
 */

export interface RefundInput {
  hoursUntilSlot: number;
  caregiverArrived: boolean;
  companyNoShow: boolean;
}

export interface RefundResult {
  refundPercent: number;
  apologyCredit: boolean;
  caregiverPaid: boolean;
}

export function computeRefund(input: RefundInput): RefundResult {
  if (input.companyNoShow) {
    return { refundPercent: 100, apologyCredit: true, caregiverPaid: false };
  }
  if (input.caregiverArrived) {
    return { refundPercent: 0, apologyCredit: false, caregiverPaid: true };
  }
  if (input.hoursUntilSlot > 6) {
    return { refundPercent: 100, apologyCredit: false, caregiverPaid: false };
  }
  if (input.hoursUntilSlot >= 2) {
    return { refundPercent: 75, apologyCredit: false, caregiverPaid: false };
  }
  return { refundPercent: 50, apologyCredit: false, caregiverPaid: false };
}
