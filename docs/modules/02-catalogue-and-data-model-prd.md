# PRD — Module 02: Catalogue & Data Model

| Field | Value |
|---|---|
| Module | Catalogue & Data Model |
| Status | Draft |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) · master PRD §7 (all entities), §3.2–§3.3, §18.1 |
| Stakeholders | CTO, Senior Eng, Ops |

---

## 1. Executive summary

**What** — the Postgres/Drizzle schema for the entire product **and** the Ops-facing `/office/catalog` screen that edits it. **Why** — the `service_archetype` discriminator (`visit`/`placement`/`lead`) drives every other module, and the hard rule is that **adding a service, variant, or price is an Ops task, never a deploy** (PRD §7.1). **Who** — Ops (catalogue CRUD) and every other module (reads the schema). **How** — Drizzle schema in `lib/server/db/`, a seed of the 5 launch zones + the live services + the 15 nursing variants, and a config-driven catalogue admin. **Success** — Physiotherapy can be turned on in Phase 2 as a config change, not a sprint; zero Bijoy/mojibake in `*_bn` fields. **Effort** — L (schema is broad). **Risks** — getting archetype boundaries wrong forces `lead` data into `bookings` (the §3.2 mistake); partner-lab agreement blocks the sample chain.

---

## 2. Purpose & user goal

Ops must be able to run the catalogue — turn services on/off, add variants, set per-zone prices — without engineering. Every other module needs a stable, archetype-aware schema to build against. This module is the data spine.

---

## 3. Scope

| | |
|---|---|
| **In scope** | Drizzle schema for **all** §7 entities: `services`, `service_variants`, `variant_zone_prices`, `zones`, `bookings`, `booking_items`, `leads`, `lead_activities`, `caregivers`, `caregiver_verification_steps`, `slots`, `samples`, `users`, `staff_accounts`, `refresh_tokens`, `patient_profiles`, `care_logs`, `payments`, `complaints`, `ops_alerts`, `sync_events`, plus enums (`service_archetype`, `booking_status`, `lead_stage`, `caregiver_skill`, `verification_status`, `sample_status`) · migrations · seed (5 zones, live services, 15 nursing variants, Physiotherapy inactive) · `/office/catalog` CRUD screen · Unicode-Bangla validation at Zod + DB check |
| **Out of scope** | Business logic that *uses* these tables (booking creation → 04, dispatch → 08, sync → 07) · auth (03) · payment gateway integration (04) |
| **Assumptions** | PostgreSQL + Drizzle per ADR-001 · object storage for documents/reports exists · module 01 shells & tokens exist |

---

## 4. Sections & components

| # | Section | Purpose |
|---|---|---|
| 1 | Enums & catalogue tables | `services`, `service_variants`, `variant_zone_prices`, `zones` |
| 2 | Booking-side tables | `bookings`, `booking_items`, `slots`, `samples`, `patient_profiles` |
| 3 | Lead-side tables | `leads`, `lead_activities` |
| 4 | Caregiver tables | `caregivers`, `caregiver_verification_steps`, `care_logs`, `sync_events` |
| 5 | Account tables | `users`, `staff_accounts`, `refresh_tokens` |
| 6 | Ops/finance tables | `payments`, `complaints`, `ops_alerts` |
| 7 | `/office/catalog` UI | CRUD services/variants/prices/zones |
| 8 | Seed & migrations | reproducible bootstrap |

---

## 5. Screens · Key actions · Key fields

| Screen | Route | Key actions | Key fields |
|---|---|---|---|
| Catalogue | `/office/catalog` | CRUD service, CRUD variant, set price, per-zone price override, toggle active, reorder | slug, archetype, `name_bn`/`name_en`, prep instructions, requires_prescription, required_skill, window_start/end, variant price_bdt, duration_min, zone overrides |

---

## 6. User flows

### Flow A — Ops adds a new nursing variant (no deploy)
**Pre:** Ops authed (module 03). **Post:** variant live for booking immediately; no code change.
```
[/office/catalog] → [pick "Nursing Visit" service] → [Add variant]
  → [name_bn (Unicode), name_en, price_bdt, duration_min]
  → {name_bn is Bijoy/ANSI?} yes → [reject: "Bangla must be Unicode"]
                              no  → [save] → [variant visible in booking select]
```

### Flow B — Enabling Physiotherapy in Phase 2
**Pre:** Physiotherapy seeded `is_active=false`. **Post:** live, config-only.
```
[/office/catalog] → [Physiotherapy] → [toggle is_active=true] → [set variants/prices] → live
```

---

## 7. Data models

Implements **all** SQL in master PRD §7 verbatim as Drizzle tables. Load-bearing rules to encode:

- `service_archetype AS ENUM ('visit','placement','lead')` — the discriminator. `required_skill` NULL for `lead`.
- The **15 nursing procedures are `service_variants`** under one `Nursing Visit` service — not 15 services (§3.3).
- `bookings.service_id` replaces any `service_type` enum; `booking_code` unique (`PC-260715-0042`); `source` `'web'|'phone'`; `created_by_staff` for phone bookings; `landmark` **NOT NULL**.
- `booking_items` snapshot `name_snapshot`/`price_snapshot` — **never join to live catalogue for history**.
- `slots`: capacity per `(zone_id, service_id, window_start)` UNIQUE, `CHECK (booked_count <= capacity)`.
- `leads`: `service_id` must reference an archetype-`lead` service; `user_id` nullable (most arrive by phone); `stage` enum incl. `dormant`; index `(stage, next_action_at)`.
- `caregivers`: `verification_status` cannot be `approved` unless all steps complete AND `bkash_payout_number` non-null; `pin_hash` nullable until interview; `bnmc_reg_no` mandatory when `skill='nurse'`.
- `sync_events.event_uuid` **UNIQUE** — the offline idempotency key.
- **Bangla Unicode check** on every `*_bn` column: DB `CHECK` rejecting high Latin-character concentration, mirrored by a Zod refinement in `lib/shared`.
- **Geofence retention:** raw `lat/lng` purged after 90 days; `distance_m`/status retained (§10.5) — model as a scheduled purge, documented here.

Field reference and JSON samples: see master PRD §7. Seed data:

| Seed | Values |
|---|---|
| `zones` | Mirpur DOHS, Mirpur, Pallabi, Uttara, Gulshan (all active) |
| `services` | Home Pathology (`visit`), Nursing Visit (`visit`), Caregiver (`placement`), Physiotherapy (`visit`, inactive), Babysitter (`placement`, inactive — safeguarding gate), Mental Health (`lead`, inactive — crisis protocol), Health Insurance (`lead`), Medical Tourism (`lead`) |
| `service_variants` | 15 nursing procedures (Deep Muscle Injection, IM/IV Injection, IV Cannula, IV Saline Infusion, Urine & Plain Catheter Setup, NG Tube Setup, Nebulization, General/Foot-Care/Bedsore Dressing, Blood Sugar Check, Pulse Check, General Health Checkup) |

---

## 8. API contracts

| Method | Path | Trigger | Auth | Notes |
|---|---|---|---|---|
| `GET` | `/api/v1/services` | catalogue render | public | archetype-aware; excludes inactive |
| `POST`/`PATCH`/`DELETE` | `/api/v1/office/catalog/*` | Ops CRUD | Ops (module 03) | writes validated by shared Zod incl. Unicode-bn check |

Full handler build lives in module 09; this module owns the schemas they validate against.

---

## 9. UI states (`/office/catalog`)

| Section | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Service list | Skeleton rows | "No services yet" + Add | `<SectionError onRetry>` | Table by `sort_order` |
| Variant editor | Skeleton | "No variants" | inline field errors (incl. Bijoy rejection) | Saved toast, list refresh |

---

## 10. Critical features — examples & scenarios

### Feature: Bangla-Unicode enforcement (§18.1)
**Example** — pasting `DbœZ I gvbm¤§Z` (Bijoy ANSI) into `name_bn` → rejected at Zod and DB. Only `উন্নত ও মানসম্মত` (Unicode) is accepted.

| # | Scenario | Expected |
|---|---|---|
| S-1 | `*_bn` field >~40% Latin chars | Reject with clear message |
| S-2 | Mixed Unicode Bangla + a few Latin (brand names) | Allowed (threshold, not zero-tolerance) |

### Feature: No-deploy price change
**Example** — Ops raises IV Cannula from 500→600 BDT in Gulshan via `variant_zone_prices` → new bookings price at 600 in Gulshan, snapshot preserves old bookings.

| # | Scenario | Expected |
|---|---|---|
| S-3 | Zone override absent | Falls back to `service_variants.price_bdt` |
| S-4 | Historic booking after price change | `booking_items.price_snapshot` unchanged |

---

## 11. Edge cases

- Deactivating a service mid-day → existing bookings unaffected; new bookings blocked.
- Deleting a variant referenced by a booking → soft-delete (`is_active=false`), never hard-delete referenced rows.
- Nurse caregiver without BNMC number → schema/logic blocks approval.
- Slot uniqueness collision → DB constraint prevents duplicate `(zone, service, window_start)`.

---

## 12. Acceptance criteria with test cases

### AC-1 — Archetype integrity
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | Service archetype `lead` | create a `booking` referencing it | Blocked (leads don't book) |
| 1.2 | Service archetype `visit` | create a lead referencing it | Blocked |

### AC-2 — Unicode Bangla (PRD §13 AC-7.4)
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | Bijoy/ANSI text | insert into any `*_bn` | Rejected by validation |

### AC-3 — No-deploy catalogue
| TC | Given | When | Then |
|---|---|---|---|
| 3.1 | New variant added in `/office/catalog` | customer opens booking select | Variant appears without a deploy |

### AC-4 — Slot capacity constraint
| TC | Given | When | Then |
|---|---|---|---|
| 4.1 | `booked_count = capacity` | attempt increment | DB `CHECK` rejects (`booked_count <= capacity`) |

---

## 13. Metrics

| Metric | Target |
|---|---|
| Services addable without deploy | 100% |
| `*_bn` rows containing mojibake in prod | 0 |
| Slot overbooking (`booked_count > capacity`) | 0, always |

---

## 14. Open questions

- [ ] Partner-lab agreement signed? Blocks the sample/report chain (§19).
- [ ] Object-storage provider for documents/reports.
- [ ] Exact Latin-character threshold for the Bangla-Unicode check.

---

## 15. Out-of-scope / future

- Physiotherapy & Babysitter activation (config, later phases).
- Per-zone slot templates automation.

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| CTO | | | ☐ |
| Ops | | | ☐ |
