import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_FEE_BDT,
  computeBookingTotal,
  computeItemsSubtotal,
  pricesMatch,
} from "../lib/shared/pricing.ts";
import { computeRefund } from "../lib/shared/refund.ts";
import { isSlotOpen, remainingCapacity } from "../lib/shared/slots.ts";
import { signPayload, verifyWebhookSignature } from "../lib/server/payments/webhook.ts";

test("booking total = itemised subtotal + collection fee (PRD §9 worked example)", () => {
  const items = [
    { priceBdt: 500, quantity: 2 }, // 1000
    { priceBdt: 200, quantity: 1 }, // 200
  ];
  assert.equal(computeItemsSubtotal(items), 1200);
  assert.equal(computeBookingTotal(items), 1200 + COLLECTION_FEE_BDT); // 1400
  assert.equal(computeBookingTotal([]), 0); // no items, no fee
});

test("pricesMatch compares at 2-decimal precision", () => {
  assert.equal(pricesMatch(1400, 1400.0), true);
  assert.equal(pricesMatch(1400, 1400.004), true);
  assert.equal(pricesMatch(1400, 1399.99), false);
});

test("refund tiers (PRD §9)", () => {
  assert.deepEqual(computeRefund({ hoursUntilSlot: 8, caregiverArrived: false, companyNoShow: false }), { refundPercent: 100, apologyCredit: false, caregiverPaid: false });
  assert.equal(computeRefund({ hoursUntilSlot: 4, caregiverArrived: false, companyNoShow: false }).refundPercent, 75);
  assert.equal(computeRefund({ hoursUntilSlot: 1, caregiverArrived: false, companyNoShow: false }).refundPercent, 50);
  const arrived = computeRefund({ hoursUntilSlot: 1, caregiverArrived: true, companyNoShow: false });
  assert.equal(arrived.refundPercent, 0);
  assert.equal(arrived.caregiverPaid, true);
  const companyNoShow = computeRefund({ hoursUntilSlot: 0, caregiverArrived: true, companyNoShow: true });
  assert.equal(companyNoShow.refundPercent, 100);
  assert.equal(companyNoShow.apologyCredit, true);
});

test("slot openness and remaining capacity (AC 1.1)", () => {
  assert.equal(isSlotOpen({ capacity: 3, bookedCount: 2 }), true);
  assert.equal(isSlotOpen({ capacity: 3, bookedCount: 3 }), false);
  assert.equal(remainingCapacity({ capacity: 3, bookedCount: 2 }), 1);
  assert.equal(remainingCapacity({ capacity: 3, bookedCount: 5 }), 0);
});

test("webhook HMAC verifies and rejects tampering", () => {
  const secret = "gateway-secret";
  const body = JSON.stringify({ ref: "BKASH-7Y2F9K", amount: 1400 });
  const sig = signPayload(secret, body);
  assert.equal(verifyWebhookSignature(secret, body, sig), true);
  assert.equal(verifyWebhookSignature(secret, body, sig.slice(0, -2) + "00"), false);
  assert.equal(verifyWebhookSignature("wrong-secret", body, sig), false);
  assert.equal(verifyWebhookSignature(secret, body + " ", sig), false);
});
