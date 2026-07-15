# PRD — Module 04: Customer Booking (visit archetype)

| Field | Value |
|---|---|
| Module | Customer Booking |
| Status | Draft |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) · master PRD §5 (Customer), §6 Flow A, §9, §11 |
| Stakeholders | PM, Eng, Ops |

---

## 1. Executive summary

**What** — the public multi-step booking flow for `visit` services (Home Pathology, Nursing), from search to paid confirmation. **Why** — it digitises the phone booking the company already does, and it is the customer-facing revenue funnel. **Who** — guests and authed customers in the 5 launch zones. **How** — a stepped flow (`select → patient → address → slot → checkout → payment → confirmation`) with **server-side price re-validation** and **race-safe slot capacity**. **Success** — 0 price-mismatch incidents, 0 overbooking, growing web-booking share vs. the hotline. **Effort** — L. **Risks** — payment-gateway onboarding lead time; landmark-based addressing in Dhaka; price integrity must be transactional, never reconciled after the fact.

> **Sequencing note:** per PRD §3.1 the manual **phone** booking (module 08) is P0 and is built and tested *before* this customer flow.

---

## 2. Purpose & user goal

A first-time customer books a home pathology or nursing visit in one clean pass, sees an itemised price that exactly equals what they'll be charged, and gets an SMS confirmation with a booking code.

---

## 3. Scope

| | |
|---|---|
| **In scope** | `/book/[service]/select` (tests/procedures + prescription upload), `/book/patient`, `/book/address` (pin + **required landmark** + zone auto-detect), `/book/slot` (open slots only), `/book/checkout` (itemised, discounts), `/book/payment` (bKash/Nagad/Rocket/card/cash), `/book/confirmation` · server price re-validation · race-safe capacity · SMS + async reminders |
| **Out of scope** | `placement` subscriptions (caregiver continuity) · `lead` enquiries (module 06) · tracking/reports (module 05) · caregiver dispatch (module 08) · the payment webhook source-of-truth handler (module 09, consumed here) |
| **Assumptions** | modules 02 (catalogue/slots/bookings) + 03 (customer auth) done · payment gateway + SMS providers configured · zones seeded |

---

## 4. Sections & components

| # | Section | Purpose | Route |
|---|---|---|---|
| 1 | Item selection | pick tests/procedures, upload prescription | `/book/[service]/select` |
| 2 | Patient picker | choose/add patient profile (payer ≠ patient) | `/book/patient` |
| 3 | Address | pin, current location, **landmark required**, zone detect | `/book/address` |
| 4 | Slot | open windows w/ remaining capacity | `/book/slot` |
| 5 | Checkout | itemised total, discount | `/book/checkout` |
| 6 | Payment | gateway tiles + cash | `/book/payment` |
| 7 | Confirmation | code, receipt, fasting reminder, SMS indicator | `/book/confirmation` |

---

## 5. Screens · Key actions · Key fields

Mirror of master PRD §5 (Customer rows for the booking flow). Key fields: item list + price, prescription photo + required flag; saved patients + new-patient form; map pin, **landmark (required)**, flat/floor, zone auto-detect; date + hourly windows + remaining-capacity; itemised price; payment tiles + cash toggle; booking ID, receipt, fasting reminder, SMS-sent indicator.

---

## 6. User flows

### Flow A — Book a home visit end to end (PRD §6 Flow A)
```
[Search] → [Select items + prescription] → [Select patient] → [Pin + landmark]
  → {zone served?} no→[honest "not yet" + capture demand signal]
                   yes→[Select slot]
  → {capacity?} no→[hidden, pick another] yes→[Checkout] → [Payment]
  → {price == charge?} no→[block, 422, no booking] yes→[POST /bookings]→[SMS]→[Confirmation]
```
**Post:** booking `confirmed`; slot `booked_count` incremented in the same transaction; receipt generated; analytics fired.

---

## 7. Data models

Writes `bookings` (+ `booking_items` snapshots), increments `slots.booked_count`, creates `payments`. Reads `services`/`service_variants`/`variant_zone_prices`/`zones`/`slots`/`patient_profiles`. Source `'web'`. All per module 02 §7.

---

## 8. API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/v1/slots?zone_id&date&service_id` | public | **excludes full slots server-side** |
| `POST` | `/api/v1/bookings` | customer or Ops | **price re-validated server-side; blocks on mismatch** |
| `POST` | `/api/v1/payments/webhook/{provider}` | HMAC | server is source of truth, not browser redirect |
| `GET` | `/api/v1/services` | public | archetype-aware |

---

## 9. UI states

| Section | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Slot picker | Skeleton grid | "No slots left today — try tomorrow" + date-shift | `<SectionError onRetry>` | **Open slots only; full never render, not even disabled** |
| Checkout | Skeleton | N/A | inline 422 on price mismatch | itemised total |
| Confirmation | Spinner | N/A | recovered from gateway callback if client crashed | code + receipt + SMS indicator |

---

## 10. Critical features — examples & scenarios

### Feature: Price integrity (§9)
**Example** — 1,400 BDT = 1,200 tests + 200 collection fee must equal the gateway-confirmed charge, checked **in the same transaction as the booking insert**. Mismatch → no booking, charge reversed, `ops_alerts` incident. Never post-hoc reconciliation.

### Feature: Race-safe slot capacity (§9)
**Example** — `UPDATE slots SET booked_count = booked_count + 1 WHERE id=$1 AND booked_count < capacity`. Two simultaneous last-slot bookings → exactly one `200`, other `409` "this slot just filled", **no charge attempted**.

### Feature: Cancellation/refund tiers
`>6h → full · 2–6h → 75% · <2h → 50% · after caregiver arrived → 0% (caregiver paid) · PriyoCare no-show → full refund + apology credit`. Computed server-side, shown before confirm, never recalculated client-side.

| # | Scenario | Expected |
|---|---|---|
| S-1 | Client price ≠ server price | 422, no booking row, no capture |
| S-2 | Payment ok, client crashes pre-confirmation | Booking created from gateway callback |
| S-3 | Address outside 5 zones | Honest "not yet", captured as demand |

---

## 11. Edge cases

- Prescription-required service without upload → block continue.
- Slot fills between select and pay → 409 before any charge.
- Browser back mid-flow → preserve draft.
- 200% zoom / sticky mobile CTA → no clipping, no horizontal scroll.

---

## 12. Acceptance criteria with test cases

### AC-1 — Full slot never selectable (PRD §13)
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | API excludes full slots | open picker | No full slot renders, **not even disabled** |
| 1.2 | 1 left, two race | both submit | one `200`, other `409`, **no charge** |

### AC-2 — Price equals charge
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | client == server price | `POST /bookings` | `confirmed` in same txn as check |
| 2.2 | prices differ | `POST /bookings` | `422`, no booking, no capture |

---

## 13. Metrics

| Metric | Target |
|---|---|
| Price-mismatch incidents | 0 |
| Slot overbooking | 0 |
| Web-booking share | tracked (hotline winning today) |
| Booking creation p95 | < 400ms |
| Booking completion rate | baseline at launch |

---

## 14. Open questions

- [ ] Payment gateway (SSLCommerz onboarding 3–6 wk lead time — §19).
- [ ] SMS provider + masked-calling.
- [ ] Home-diagnostics licensing legal opinion (blocks launch).

---

## 15. Out-of-scope / future

- Subscriptions (`placement`) checkout.
- Saved-card tokenisation UX.

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| PM | | | ☐ |
| Eng | | | ☐ |
