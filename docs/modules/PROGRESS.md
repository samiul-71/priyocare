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
| 05 | Customer Tracking & Reports | ✅ | `eec3cbd` | Status steppers (colour-independent), 15-min signed report links, geofence invisibility; `/bookings/[id]/track` + `/status` |
| — | Page auth guards + login pages | ✅ | _this commit_ | `pc_session` cookie, DAL guards on every `/office` + `/caregiver` page, `/office/login` + `/caregiver/login` |
| 06 | Lead Capture & CRM (lead) | ⬜ | — | Depends on 02, 03 — **next** |
| 07 | Caregiver PWA (offline-first) | ⬜ | — | Depends on 02, 03 |
| 09 | API Layer | ⬜ | — | Route handlers consolidated; partly built alongside 03/04/08 |

## Next up

**Now:** Module 06 — Lead Capture & CRM (lead archetype): `/enquiry/[service]` + `/office/leads` Kanban, overdue follow-ups, 30-day dormancy. The new `/office/leads` page must call `requireStaffPage()` like every other office page.
**After 06:** 07 (Caregiver PWA), folding shared route handlers into 09 as they land.

### Page auth guards — what's full vs. deferred

Closed the gap where `/office/*` and `/caregiver/*` pages were viewable by anyone (the API was always gated).

- **Full:** `pc_session` httpOnly cookie signed with a **distinct JWT audience** from access tokens, so neither token works in the other's seam (unit-tested both directions, and verified live); per-subject lifetime tracking the *refresh* token (staff 7d, caregiver 30d); a DAL (`lib/server/auth/dal.ts`) with `requireStaffPage`/`requireCaregiverPage` — cookie verify **plus** a DB check that the account is still active, so suspension revokes page access and not just tokens; `?next=` return paths validated by a shared rule (`lib/shared/return-path.ts`, unit-tested against open-redirect, cross-actor, and CRLF cases); `/office/login` + `/caregiver/login` in a new `(auth)` route group; sign-out that clears both halves of the session.
- **Design note — why not the layouts:** the original plan said "a check in the `(office)`/`(caregiver)` layouts". Next 16 is explicit that layouts **do not re-render on client-side navigation** (Partial Rendering), so a layout-only check is not a guard. Every page calls the guard itself; the layouts also call it for their chrome, and React `cache` collapses the duplicate work to one verify + one row read per render.
- **The caregiver rule holds (§10.1, Flow A):** the guard reads the 30-day cookie, never the 15-minute access token, so an expired access token can never surface a login screen. A caregiver sees `/caregiver/login` only after a full month away, or on suspension.
- **Deferred:** the office forms still hold Bearer tokens in `localStorage` (XSS-readable) because `/api/v1/office/*` is Bearer-gated — see the follow-up below. Login itself needs Postgres, so it is typechecked and unit-tested here and exercised on the VPS.
- **a11y coverage:** `tests/auth-guard.spec.ts` asserts all 9 guarded routes redirect, the `?next=` round-trip, forged-cookie rejection, no login loop, and that `/book/*` stays public. The 7 office pages are scanned **signed in** by `tests/a11y-office.spec.ts` (restored once local Postgres existed) — opt-in via `E2E_STAFF_EMAIL`/`E2E_STAFF_PASSWORD` so it never provisions a known-password account itself; unset → skips, and the rest of the suite still runs. `/caregiver` has no authenticated a11y pass yet (needs an approved caregiver row) — worth adding with module 07.

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

- [x] **Page-level auth guards + login pages** — done (see above). Customer `/book/*` stays intentionally public (guest booking, Flow A).
- [ ] **Get Bearer tokens out of the browser** (module 09). The office forms keep the access + refresh pair in `localStorage` (`lib/shared/client-tokens.ts`) because `/api/v1/office/*` authenticates with Bearer headers. Any XSS on the origin can read them; the page cookie is httpOnly and cannot. The real fix is to make office mutations **Server Actions authorised by the cookie**, leaving Bearer for genuine API clients — a module 09 refactor, since it changes every office handler's entry point.
- [ ] **A missing `JWT_SECRET` silently signs everyone out.** `verifyPageSession`/`verifyAccessToken` catch *all* errors and return null, including the "JWT_SECRET must be set" throw — so a misconfigured deploy would redirect every user to login rather than failing loudly. Fail fast at boot instead (pre-existing in `tokens.ts`; the page session inherits it).

## Environment (updated — local Postgres now exists)

**Postgres 17 is installed locally** (service `postgresql-x64-17`, port 5432), with a dedicated `priyocare` role + database, migrations applied and the catalogue seeded. `.env.local` (gitignored) supplies `DATABASE_URL` + `JWT_SECRET`; `next` reads it automatically and the Node scripts load it via `process.loadEnvFile`. Setup steps are in the README.

**This retires the "no Postgres in the build environment" caveat** that qualified every module above. Until now *nothing was ever persisted*: reads returned `[]` via `isDbConfigured()` (which is why the office panel showed empty states — no database, not an empty one) and every write path threw. The 21-table schema existed only as unapplied SQL.

Verified against the live database once it existed: staff login (argon2id — wrong password 401, correct 200), the `pc_session` cookie (`HttpOnly`, `SameSite=lax`, `Max-Age=604800` = the intended 7-day staff window), all guarded pages rendering at 200 with a session, **deactivation revoking page access on the next request while the cookie is still valid** (the DB check earning its keep — Flow C), logout clearing the cookie, refresh-token rotation + revocation (revoked → 401 on `/auth/refresh`).

Still not local: **Redis** (rate limits use the in-memory limiter — correct for one process, swap on the VPS), the SMS/OTP provider, the payment gateway, and private report storage (§19).

Each commit message states exactly what was verified vs. deferred.
