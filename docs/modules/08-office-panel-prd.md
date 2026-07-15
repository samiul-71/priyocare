# PRD — Module 08: Office / Admin Panel

| Field | Value |
|---|---|
| Module | Office / Admin Panel |
| Status | Draft |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) §6 · master PRD §5 (Office), §9, §11, §12.2, §15 |
| Stakeholders | COO, Ops, Eng |

---

## 1. Executive summary

**What** — the internal panel Ops runs the business from: booking queue, **manual phone booking (P0)**, dispatch/assignment, caregiver verification, complaint inbox, sample/report upload, and the ops-only alerts feed. **Why** — the phone is the *primary* channel today; Ops must be able to record, dispatch, and prove every booking — website or phone — from one place. **Who** — Ops and Admin staff (email+password, `role`-scoped, no self-registration). **How** — dense desktop-first screens over the module 02 schema, with dispatch eligibility enforced by the API filter (not a UI hide). **Success** — <5min reassignment, ≥90% complaint SLA, 100% caregiver-activation accuracy. **Effort** — L. **Risks** — monolith blast radius on these exact routes (§15) → staging smoke-test gate; babysitter safeguarding gate (§12.2).

> **Build order:** `/office/bookings/new` (manual phone booking) is **P0** — built and tested **before** the customer booking flow (module 04).

---

## 2. Purpose & user goal

Ops answers the hotline and books, dispatches the right caregiver, verifies new caregivers rigorously, handles complaints within SLA, uploads reports, and sees safety alerts — all without leaving the panel, and without any of those internal signals leaking to customers or caregivers.

---

## 3. Scope

| | |
|---|---|
| **In scope** | `/office/login` · `/office/bookings` (queue: assign/cancel/urgent/filter) · **`/office/bookings/new` manual phone booking (P0, any of the 8 services)** · `/office/bookings/[id]/assign` (ranked eligible caregivers, masked call) · `/office/caregivers/[id]/verify` (5-step + babysitter's 2 extra) · `/office/complaints` (SLA timer, suspend/escalate) · `/office/samples` (upload report, lab rejection, re-collection) · `/office/alerts` (geofence/missed-checkout, **ops-only**) · `/office/leads` (module 06) and `/office/catalog` (module 02) live in this shell |
| **Out of scope** | Catalogue CRUD internals (02) · lead Kanban internals (06) · customer/caregiver surfaces · payment gateway internals |
| **Assumptions** | modules 02, 03 done; caregiver PWA (07) emits events consumed here; staging smoke-test gate + fast-rollback runbook in place (§15) |

---

## 4. Sections & components

| # | Section | Route |
|---|---|---|
| 1 | Login | `/office/login` |
| 2 | Booking queue | `/office/bookings` |
| 3 | **Manual phone booking (P0)** | `/office/bookings/new` |
| 4 | Assignment / dispatch | `/office/bookings/[id]/assign` |
| 5 | Caregiver verification | `/office/caregivers/[id]/verify` |
| 6 | Complaint inbox | `/office/complaints` |
| 7 | Sample / report upload | `/office/samples` |
| 8 | Ops alerts feed | `/office/alerts` |

---

## 5. Screens · Key actions · Key fields

Mirror of master PRD §5 (Office). Highlights:

| Screen | Route | Key actions | Key fields |
|---|---|---|---|
| Manual phone booking ★P0 | `/office/bookings/new` | search/create patient, check availability, confirm, take payment | caller, patient, address, **any of 8 services**, slot, price, payment method, `source='phone'`, `created_by_staff` |
| Assignment / dispatch | `/office/bookings/[id]/assign` | assign, reassign, masked call | ranked eligible caregivers, photo/ID, distance, current load |
| Caregiver verification | `/office/caregivers/[id]/verify` | approve step, reject+reason, activate | NID, photo, police clearance, skill cert, BNMC no., interview notes, **5-step checklist** (+refs & safeguarding for babysitter), payout number |
| Complaint inbox | `/office/complaints` | open case, suspend, escalate, resolve | source booking, rating, text, severity, SLA timer |
| Sample/report upload | `/office/samples` | upload report, flag lab rejection, mark re-collection | barcode, patient, lab status, report file, timestamp |
| Ops alerts | `/office/alerts` | review, dismiss, escalate | geofence-mismatch, missed check-out — **never visible outside this screen** |

---

## 6. User flows

### Flow — Manual phone booking (P0)
```
[Hotline call] → [/office/bookings/new] → [search/create patient]
  → [pick any of 8 services] → [check slot availability] → [confirm]
  → [take payment / cash] → [POST /bookings source='phone', created_by_staff]
  → [SMS + booking code] → counts toward web-vs-phone metric
```

### Flow — Dispatch
```
[/office/bookings/:id/assign] → [ranked eligible caregivers]
  → {pick top-ranked?} yes→[assign] no→[override requires a logged reason]
  → [masked call if needed] → job dispatched
```

### Flow — Suspend on serious complaint
```
[1–2★ auto-creates complaint ≤5s] → [Ops reviews]
  → {serious tag?} yes→[suspend from all dispatch + revoke refresh tokens immediately]
                   no →[investigate, not auto-suspended]
```

---

## 7. Data models

Reads/writes `bookings`, `booking_items`, `payments`, `caregivers`, `caregiver_verification_steps`, `complaints`, `samples`, `ops_alerts`, `slots`, `patient_profiles`. Per module 02 §7.

---

## 8. API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/v1/bookings` | Ops or customer | phone booking uses Ops token, `source='phone'` |
| `POST` | `/api/v1/office/bookings/{id}/dispatch` | Ops | eligible-only; override requires reason |
| `POST` | `/api/v1/office/caregivers/{id}/verify` | Ops | transitions one step |
| `POST` | `/api/v1/office/caregivers/{id}/suspend` | Ops | immediate, logged, **revokes refresh tokens** |
| `POST` | `/api/v1/samples/{barcode}/scan` | caregiver/lab | chain-of-custody |

---

## 9. UI states (PRD §11)

| Section | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Booking queue | Skeleton rows | "No bookings" | `<SectionError onRetry>` | rows w/ minutes-to-slot |
| Assignment | Skeleton | "No eligible caregivers" | retry | ranked list |
| Alerts | Skeleton | "No alerts" | retry | flags w/ distance + timestamp |

---

## 10. Critical features — examples & scenarios

### Feature: Dispatch eligibility (§9)
Filter: `verification_status='approved'` AND skill match AND zone match AND no time conflict; sort by "served this patient before" (desc) then `rating_avg` (desc). A caregiver missing even one step **never appears** — enforced by the **API filter**, not a UI hide.

### Feature: Onboarding gate (§12.2)
Five mandatory steps (NID, photo, police clearance, skill cert + BNMC for nurses, interview) **and** a bKash payout number before any dispatch or PIN. **Babysitter adds two:** two called previous-employer references + child-safeguarding training & signed code of conduct; stricter clearance; no same-day first placement; auto-suspend at **2** low ratings. Babysitter stays on the hotline until those exist.

### Feature: Complaint auto-escalation (§9)
1–2★ auto-creates a complaint within seconds, pre-filled; caregiver **not** auto-suspended. "Serious" tag → instant suspend from all dispatch + **revoke all active refresh tokens**.

| # | Scenario | Expected |
|---|---|---|
| S-1 | 4 of 5 steps done | absent from assignment list |
| S-2 | 5 steps, no payout number | "Activate" blocked, explicit error |
| S-3 | override non-top caregiver | reason required, stored |
| S-4 | lab rejects sample | free re-collection, never a second charge |
| S-5 | report > 24h | proactive Ops alert to call family |

---

## 11. Edge cases

- Collector arrives, nobody answers → 15-min wait, masked call, "customer not available" + visit fee, routed to Ops for rebooking.
- Payment ok, client crashed → booking created from gateway callback (still visible in queue).
- Monolith risk (§15): staging smoke-test gate must pass `/office/bookings`, `/office/*/assign`, `/office/complaints`, `/office/alerts`, `/office/leads` before any deploy; failure blocks deploy, no override.

---

## 12. Acceptance criteria with test cases

### AC-1 — Phone booking supports every service (PRD §13)
| TC | Given | When | Then |
|---|---|---|---|
| 5.1 | caller wants physiotherapy (no web flow) | Ops opens `/office/bookings/new` | booking created and counted |

### AC-2 — Incompletely-verified caregivers never appear
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | 4 of 5 steps | Ops opens assignment | absent regardless of match |
| 2.2 | 5 steps, no payout | click Activate | blocked, missing-payout error |

### AC-3 — Dispatch override logs reason
| TC | Given | When | Then |
|---|---|---|---|
| 3.1 | non-top caregiver | confirm | reason required, stored |

### AC-4 — Complaint SLA & auto-create
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | 1–2★ | rating submitted | complaint within 5s, linked, no manual step |
| 1.2 | 4★ | rating submitted | no complaint |

### AC-5 — Alerts ops-only
| TC | Given | When | Then |
|---|---|---|---|
| 4.1 | check-in flagged | Ops opens Alerts | appears w/ distance+timestamp |
| 4.2 | same event | customer/caregiver app | no indication anywhere |

---

## 13. Metrics

| Metric | Target |
|---|---|
| Time to reassign (sick-call → new caregiver) | < 5 min |
| Complaint SLA compliance | ≥ 90% |
| Caregiver activation accuracy | 100% |
| Office-route uptime during customer spikes | protected (§15) |

---

## 14. Open questions

- [ ] Babysitter safeguarding process defined before enabling (§12.2).
- [ ] Office subdomain isolation feasible on chosen reverse proxy (§15.4).
- [ ] Masked-calling provider.

---

## 15. Out-of-scope / future

- Physiotherapy/babysitter activation (config once gates met).
- Feature flags & subdomain isolation (first sprint post-cutover, §15).

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| COO | | | ☐ |
| Ops | | | ☐ |
| Eng | | | ☐ |
