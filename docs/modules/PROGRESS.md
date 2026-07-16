# PriyoCare — Module Build Progress

Single source of truth for **what's done and what's next**, in build order. Update this file whenever a module's status changes. Full specs live in each `NN-*-prd.md`; the ordering rationale is in [`README.md`](./README.md).

Legend: ✅ complete · 🚧 in progress · ⬜ not started

| # | Module | Status | Commit | Notes |
|---|---|---|---|---|
| — | Design system (`design.md`) | ✅ | `067bb20` | Derived from logo; contrast-safe split-teal palette |
| 01 | Design System & Application Foundation | ✅ | `649ef5b` | Tokens, fonts, 3 shells, boundaries + a11y CI gates, landing |
| 02 | Catalogue & Data Model | ✅ | `7d439a0` | 21-table Drizzle schema + migration, Bangla-Unicode check, seed, `/office/catalog` |
| 03 | Auth & Security | ✅ | `9c96272` | JWT + rotating refresh, argon2id, rate limits, `/auth/*`, security headers |
| 08 | Office / Admin Panel (**phone booking P0**) | ✅ | _this commit_ | Phone booking, dispatch, verify/activate, suspend, alerts; queue/assign/alerts pages |
| 04 | Customer Booking (visit) | ⬜ | — | Depends on 02, 03 — **next** |
| 05 | Customer Tracking & Reports | ⬜ | — | Depends on 04 |
| 06 | Lead Capture & CRM (lead) | ⬜ | — | Depends on 02, 03 |
| 07 | Caregiver PWA (offline-first) | ⬜ | — | Depends on 02, 03 |
| 09 | API Layer | ⬜ | — | Route handlers consolidated; partly built alongside 03/08 |

## Next up

**Now:** Module 04 — Customer Booking (visit): the `/book/*` flow, slots, price integrity, payments.
**After 04:** 05 (Tracking) → 06 (Leads) → 07 (Caregiver PWA), folding shared route handlers into 09 as they land.

### Module 08 — what's full vs. scaffolded

- **Full:** pure logic (dispatch ranking, activation gate, booking code, complaint rules) with unit tests; `/api/v1/office/*` handlers (phone booking, dispatch, verify+activate, suspend+revoke); office data-access; pages for queue, **P0 phone booking**, assign/dispatch, alerts.
- **Scaffolded (empty-safe, built out later):** `/office/complaints` and `/office/samples` inbox views — their server-side rules (auto-create, suspend, chain-of-custody) exist; the rich UIs land with modules 04/05.

## Environment caveat (applies to every module here)

No Postgres/Redis in the build environment, so DB/queue round-trips are typechecked and the **pure business logic is unit-tested**; live data paths run on the VPS. Each commit message states exactly what was verified vs. deferred.
