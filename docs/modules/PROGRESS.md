# PriyoCare — Module Build Progress

Single source of truth for **what's done and what's next**, in build order. Update this file whenever a module's status changes. Full specs live in each `NN-*-prd.md`; the ordering rationale is in [`README.md`](./README.md).

Legend: ✅ complete · 🚧 in progress · ⬜ not started

| # | Module | Status | Commit | Notes |
|---|---|---|---|---|
| — | Design system (`design.md`) | ✅ | `067bb20` | Derived from logo; contrast-safe split-teal palette |
| 01 | Design System & Application Foundation | ✅ | `649ef5b` | Tokens, fonts, 3 shells, boundaries + a11y CI gates, landing |
| 02 | Catalogue & Data Model | ✅ | `7d439a0` | 21-table Drizzle schema + migration, Bangla-Unicode check, seed, `/office/catalog` |
| 03 | Auth & Security | ✅ | `9c96272` | JWT + rotating refresh, argon2id, rate limits, `/auth/*`, security headers |
| 08 | Office / Admin Panel (**phone booking P0**) | ✅ | `e81287d` | Phone booking, dispatch, verify/activate, suspend, alerts; queue/assign/alerts pages |
| 04 | Customer Booking (visit) | ✅ | `bc75b6b` | Price integrity, race-safe slots, refund tiers, webhook HMAC; `/book/*` select→checkout→confirmation |
| 05 | Customer Tracking & Reports | ✅ | _this commit_ | Status steppers (colour-independent), 15-min signed report links, geofence invisibility; `/bookings/[id]/track` + `/status` |
| 06 | Lead Capture & CRM (lead) | ⬜ | — | Depends on 02, 03 — **next** |
| 07 | Caregiver PWA (offline-first) | ⬜ | — | Depends on 02, 03 |
| 09 | API Layer | ⬜ | — | Route handlers consolidated; partly built alongside 03/04/08 |

## Next up

**Now:** Module 06 — Lead Capture & CRM (lead archetype): `/enquiry/[service]` + `/office/leads` Kanban, overdue follow-ups, 30-day dormancy.
**After 06:** 07 (Caregiver PWA), folding shared route handlers into 09 as they land. Then the deferred auth guards (below).

### Module 05 — what's full vs. deferred

- **Full:** status steppers (booking + sample, colour-independent icon+label, greyscale-safe) with unit tests; signed report links (HMAC + 15-min expiry) with unit tests; `GET /api/v1/reports/[sample_id]` (410 expired / 401 forged, verified before lookup); customer-safe tracking reads (no geofence/lat-lng ever selected); `/bookings/[id]/track` + `/status` pages.
- **Deferred:** live map / real-time location feed and masked-calling provider integration (button is a placeholder); report streaming from private storage (handler redirects to the stored URL once the provider is wired, §19). DB reads run on the VPS.

### Module 04 — what's full vs. deferred

- **Full:** pricing/refund/slot/webhook logic (unit-tested); `createBooking` (server-side price re-validation + race-safe capacity in one transaction); handlers `GET /slots` (excludes full slots), `POST /bookings` (422 mismatch / 409 slot-full), `POST /payments/webhook/[provider]` (HMAC); `/book/[service]/select` → `/book/checkout` → `/book/confirmation`.
- **Deferred:** map-pin lat/lng (fixed default for now), separate patient/address/slot/payment sub-routes (consolidated into checkout), real payment-gateway reconciliation (webhook verified; payload mapping needs the provider spec, §19). DB write paths run on the VPS.

### Module 08 — what's full vs. scaffolded

- **Full:** pure logic (dispatch ranking, activation gate, booking code, complaint rules) with unit tests; `/api/v1/office/*` handlers (phone booking, dispatch, verify+activate, suspend+revoke); office data-access; pages for queue, **P0 phone booking**, assign/dispatch, alerts.
- **Scaffolded (empty-safe, built out later):** `/office/complaints` and `/office/samples` inbox views — their server-side rules (auto-create, suspend, chain-of-custody) exist; the rich UIs land with modules 04/05.

## Deferred / follow-ups (tracked, not yet built)

- [ ] **Page-level auth guards + login pages** (`/office/login`, `/caregiver/login`). The auth *engine* is built and all `/api/v1/office/*` endpoints are gated (`requireStaff` → 401), but the office/caregiver **pages** have no redirect guard and no login screen, so the URLs are viewable. Needs an httpOnly **session cookie** on login + a server-side check in the `(office)`/`(caregiver)` layouts (hybrid: cookies for page sessions, Bearer for APIs — §10.2 left this open). Customer `/book/*` is intentionally public (guest booking, Flow A). _Decision (user): do this after Module 05._

## Environment caveat (applies to every module here)

No Postgres/Redis in the build environment, so DB/queue round-trips are typechecked and the **pure business logic is unit-tested**; live data paths run on the VPS. Each commit message states exactly what was verified vs. deferred.
