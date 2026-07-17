# PriyoCare

Trusted home healthcare in Dhaka — **one Next.js application, one repository, one deployment**. The customer website, caregiver PWA, office/admin panel, and the API all live here as route groups (PRD §4.1).

> **Framework note:** this is the latest Next.js (v16.2.10) + React 19, which differs from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework code. Notably, **Middleware is now "Proxy"** (`proxy.ts`).

## Status

- **Module 01 — Design System & Application Foundation** ✅ contrast-safe tokens, self-hosted fonts, three actor shells, boundary + accessibility CI gates, landing page.
- **Module 02 — Catalogue & Data Model** ✅ full Drizzle schema for all §7 entities (21 tables) + generated migration, Zod schemas with the Bangla-Unicode check (unit-tested), the catalogue seed (5 zones, 8 services, 15 nursing variants), and a read-only `/office/catalog`. *(Migrations and seed now applied to a **local Postgres 17**: 21 tables live, 5 zones / 8 services / 15 variants present.)*
- **Module 03 — Auth & Security** ✅ JWT access tokens (jose) + rotating opaque refresh tokens stored hashed; argon2id passwords/PINs; sliding-window rate limits; `/api/v1/auth/*` handlers (OTP request/verify, caregiver PIN login, staff login, refresh, logout); `requireAuth`/`requireStaff` API gate; security headers (HSTS, nosniff, frame-deny, scoped CSP) in `proxy.ts`. *(Token/hash/rate-limit are unit-tested; validation + OTP-issue paths + headers verified against a running server; DB-touching login/session paths run on the VPS.)*
- **Page auth guards & login screens** ✅ (deferred out of 03, built after 05) `pc_session` httpOnly cookie with an audience distinct from access tokens; `requireStaffPage`/`requireCaregiverPage` on every office/caregiver page (cookie + still-active DB check); `/office/login` + `/caregiver/login`; open-redirect-safe `?next=`; `db:create-staff` bootstrap CLI. *(Cookie/audience/return-path logic unit-tested; guard redirects, audience separation and header-spoof resistance verified live; **full login cycle verified against local Postgres** — argon2id 401/200, 7-day HttpOnly cookie, deactivation revoking page access mid-session, logout, refresh rotation + revocation.)*
- **Module 08 — Office / Admin Panel** ✅ (built before customer booking, PRD §3.1) **P0 manual phone booking**, dispatch with eligibility + override-reason rule, caregiver verify→activate gate, suspend→token-revocation, ops-only alerts; `/api/v1/office/*` handlers + queue/assign/alerts pages. *(Dispatch ranking, activation gate, booking-code, complaint rules unit-tested; pages a11y-tested and empty-safe without a DB; endpoints confirmed staff-gated; DB writes run on the VPS.)*
- **Module 04 — Customer Booking (visit)** ✅ server-side **price integrity** (recompute + block on mismatch in the same transaction as the insert) and **race-safe slot capacity** (`UPDATE … WHERE booked_count < capacity`); refund tiers; payment-webhook HMAC (gateway is source of truth); `GET /slots` excludes full slots; `/book/[service]/select → checkout → confirmation`. *(Pricing/refund/slot/webhook logic unit-tested; endpoints verified (400/422/409/503) and pages a11y-tested; gateway reconciliation + DB writes run on the VPS.)*
- **Module 05 — Customer Tracking & Reports** ✅ colour-independent status steppers (booking + sample), **15-minute signed report links** (HMAC; `GET /reports/[sample_id]` returns 410 expired / 401 forged before any lookup), and **geofence invisibility** (tracking reads never select distance/lat-lng); `/bookings/[id]/track` + `/status`. *(Stepper + signed-link logic unit-tested; expiry/forgery + honest empty states verified live; pages a11y-tested; live map + masked-calling provider run on the VPS.)*

- **Module 06 — Lead Capture & CRM (lead)** ✅ the `lead` archetype end to end — **leads are not bookings** (no slot, dispatch, caregiver or SLA anywhere in it, §3.2): public `/enquiry/[service]` (lead-archetype services only; `POST /leads` is archetype-gated and rate-limited) and the `/office/leads` Kanban with **overdue follow-ups pinned to the top**, duplicate-phone surfacing, a dormant shelf, and stage changes that always log a `lead_activity`. *(Pipeline logic unit-tested — 20; verified live: enquiry → lead with zero bookings/payments/slots created, non-lead service 422, stage change logging its activity to the real staff actor, overdue pinning, 409 on lost-without-reason. Document upload waits on private storage; the dormancy sweep waits on Redis.)*

- **Module 07 — Caregiver PWA (offline-first)** ✅ every write goes to an **IndexedDB queue before any network call** — `enqueue` reads no token and checks no network, so an expired token cannot block field work (§10.1 Flow A) — then a **batched sync, idempotent by `event_uuid`**, replays with the original device timestamps. Advisory geofence: check-in always succeeds and the caregiver is never told (§6 Flow B). Service worker (scope `/caregiver/`, never caches the API) for the offline shell; `/caregiver/today` + tasks/scan/care-log; live sync chrome. *(Geo/event/replay logic unit-tested — 21. Verified live: a 5,313m check-in returned plain success while Ops got the alert; a shift sent twice produced zero duplicate rows; a replay kept its original `occurred_at`; out-of-order delivery replayed in device order. Camera scanning and photo upload deferred; **caregiver onboarding does not exist yet** — see PROGRESS.)*

- **Caregiver onboarding** ✅ (unblocks 07) intake → 5-step checklist (7 for a babysitter) → bKash payout → activate → **PIN issuance**, the link that was missing: `activateCaregiver` flipped status but never issued a credential, so no caregiver could ever log in. PIN issuance re-evaluates the whole gate **from the database**, never from `verification_status` alone. `/office/caregivers` + `/[id]/verify`. *(15 unit tests. Verified live: empty checklist → 409 listing all blockers; 5/5 steps without a payout number → 409; babysitter with 5/5 + payout → 409 on `references`/`safeguarding`; complete file → PIN → caregiver logs in. Re-issue refused; no hash reaches the page. Initial PIN is admin-issued — "change PIN on first login" needs the SMS provider and is tracked.)*

- **Module 09 — API Layer** ✅ closed the four real gaps in the §8 surface: **`POST /bookings` idempotency** (`Idempotency-Key` → a retry returns the original instead of taking a second slot and a second payment), **`GET /services`** (real ids — the phone form used to guess them from seed order), **`POST /samples/{barcode}/scan`**, and per-account **write rate limits** on all 14 write handlers. Also **removed Bearer tokens from the office browser** — pages mutate through cookie-authorised Server Actions, so there is no API credential in the page to steal. Full surface documented in [`docs/api.md`](docs/api.md). *(Verified live: the same idempotency key three times → one booking/payment/item; browser sign-in through the action stores no token; login throttling reworked — see below.)*

- **Force PIN change on first login** ✅ closes the admin-issued-PIN gap: Ops reads the initial PIN out, so until she replaces it they know her credential. Every caregiver page now diverts to `/caregiver/change-pin` until she does. Crucially, the change **revokes what the old PIN opened** — refresh tokens outright, and the stateless page cookie via a `pin_changed_at` stamp the guard compares against the session's `iat`. *(9 unit tests. Verified by performing the attack: Ops signed in as her with the issued PIN, she changed it, Ops' cookie → login and their refresh token → 401; old PIN 401, new PIN 200.)*

- **PIN reset** ✅ two routes, because they fail differently — a lost phone breaks OTP, a Saturday night breaks the office. **Ops-mediated** (`/office/caregivers/{id}/pin/reset`, works today, new PIN is must-change) and **self-service OTP** (`/caregiver/forgot-pin`, built behind the `SmsSender` seam — module 03's OTP service was already complete, only the provider adapter is missing). The request endpoint **always answers 200** so it can't become a directory of who works here. With no provider the page shows the hotline rather than a form that could never deliver. *(4 unit tests; verified live: Ops reset kills her live session, old PIN 401, Ops-issued PIN diverts to change-pin; self-service lands her straight on her job, wrong code 401, weak PIN 422, replayed code 401.)*

- **Staff passwords: forced change, self-service change, admin reset** ✅ staff had **none** of what a caregiver has — set once by `db:create-staff`, never changed. Now: `password_must_change` diverts every office page to `/office/change-password` until the admin-set password is replaced; a self-service change; an **admin-only** reset of a colleague's forgotten password; and `/office/staff`, since an admin panel that can't answer "who can read every patient's address?" is missing something basic. 12 chars, **no composition rules** (NIST — length defends a hash; "one uppercase, one symbol" produces `Password1!` and a sticky note), plus a short list of what everyone tries first. *(13 unit tests. Verified live: an `ops` user resetting an admin → **403**; self-reset → 409; after a change the old session 307s to login and the old password 401s; `/office/staff` sends `ops` to `/office`, not login.)*

- **Reject a caregiver with a reason** ✅ `rejected` existed in the enum and **nothing set it** — a failed police check left the application at `pending` forever. Now `POST /office/caregivers/{id}/reject` records the reason with who and when, refuses an already-approved caregiver (that is `suspend`'s job), and can be reopened — without that, rejection is a trap, since the phone number is unique and she could never re-apply. It also caught the mirror bug: **suspend demanded a reason, parsed it, and threw it away.** *(8 unit tests; verified live end to end.)*

See [`docs/modules/PROGRESS.md`](docs/modules/PROGRESS.md) for the ordered status of every module. Everything else is specced in `docs/modules/` and built on top of these.

### Auth architecture (module 03)

**Hybrid, split by what's being protected** (PRD §10.2):

| Surface | Credential | Gate |
|---|---|---|
| `/api/v1/*` | Bearer JWT in `Authorization` | `requireAuth` / `requireStaff` in the route handler |
| Pages (`/office/*`, `/caregiver/*`) | `pc_session` httpOnly cookie | `requireStaffPage` / `requireCaregiverPage` from the DAL |

A page navigation carries no `Authorization` header, so pages need a cookie; APIs keep Bearer. The two tokens share a signing secret but use **different JWT audiences**, so a stolen cookie can't be replayed as an API token and vice versa — asserted in both directions in `tests/page-session.test.ts`.

Since module 09 the **office browser holds no Bearer token at all**: its mutations go through cookie-authorised Server Actions (`app/(office)/actions.ts`), which Next invokes POST-only with an `Origin`/`Host` check. `/api/v1/office/*` keeps its Bearer gate for real API clients. The caregiver PWA still stores a token, deliberately — its sync flush runs outside a rendered page (see `lib/shared/client-tokens.ts`).

**Login throttling** is tight **per identity** (5/15min) and loose per IP (50/5min), and **only failed attempts count** — a success clears the identity's history. The tight limit cannot be the IP one: an Ops floor shares a single office IP, so that would lock out the staff while barely inconveniencing an attacker.

The cookie authorises **reads only** — every mutation still goes through a Bearer-gated handler, so classic CSRF stays out of scope even though a cookie now exists (`sameSite=lax` besides). Session lifetime follows the *refresh* token (staff 7d, caregiver 30d), never the 15-minute access token: that's what upholds the caregiver rule (§10.1) that an expired access token must **never** produce a login screen.

Guards live in **each page**, not just the layouts: Next 16 layouts don't re-render on client-side navigation, so a layout-only check isn't a guard. React `cache` collapses the repeated work to one verify + one row read per render. The guards also re-check the account is still active, so suspending a caregiver revokes their page access and not merely their tokens. The **proxy does headers + classification only** — no auth redirect. Refresh tokens are opaque, rotated on every use, and revoked on logout or suspension.

Login screens live in the `(auth)` route group, deliberately **outside** the guarded shells — inside them, an anonymous visitor would be redirected to a login page that redirects them again.

### Environment variables (never committed — `.env*` is gitignored)

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Drizzle client, migrations, seed | Postgres connection string |
| `JWT_SECRET` | access-token **and** page-session-cookie signing | ≥32 chars; rotate on suspected exposure / contractor offboarding. Rotating it invalidates both, signing everyone out — expected. |

**The server refuses to start without these** (`instrumentation.ts` → `lib/server/env.ts`), naming every problem at once. It used to come up anyway and redirect every user to a login screen where every login also failed — a config mistake that read like an auth bug. `next build` is deliberately *not* gated: build and deploy environments are routinely different, and a build signs no tokens. `DATABASE_URL` is required in production only; locally the app is no-DB-safe by design.
| `SMS_PROVIDER_CONFIGURED` | the OTP flows | Set to `1` in production only once a real `SmsSender` is wired (§19). Until then `/caregiver/forgot-pin` shows the hotline instead of a form that cannot deliver, and the console sender **throws** in production rather than pretending to send. |

Locally these live in `.env.local`. `next dev|build` reads it automatically; the plain-Node scripts (`drizzle.config.ts`, `db:seed`, `db:create-staff`) call `process.loadEnvFile(".env.local")` themselves and fall back to real env vars on the VPS.

## Local setup (from a fresh clone)

Needs **Postgres 17** running locally (`winget install PostgreSQL.PostgreSQL.17`).

```bash
# 1. Create the role + database (psql as a superuser)
psql -U postgres -c "CREATE ROLE priyocare LOGIN PASSWORD '<pick-one>';" \
     -c "CREATE DATABASE priyocare OWNER priyocare;"

# 2. Write .env.local (gitignored)
#    DATABASE_URL=postgres://priyocare:<pick-one>@localhost:5432/priyocare
#    JWT_SECRET=<at least 32 chars>

# 3. Schema + catalogue
npm run db:migrate      # applies lib/server/db/migrations/*.sql
npm run db:seed         # 5 zones, 8 services, 15 nursing variants (idempotent)

# 4. A staff account to sign in with — there is no self-registration (§10.1)
npm run db:create-staff -- --email you@example.com --password 'at-least-8' --role admin

npm run dev             # sign in at /office/login
```

Without `DATABASE_URL` the app does **not** fall back to anything: reads return empty via `isDbConfigured()` and writes throw. Empty office lists mean *no database*, not an empty one.

## Documentation

- `docs/api.md` — the `/api/v1` surface: every endpoint, its auth, and its critical rule
- `docs/modules/README.md` — module index and dependency-driven build order
- `docs/modules/design.md` — the design system (colour, type, a11y) derived from the logo
- `docs/modules/0X-*-prd.md` — one PRD per module
- `docs/priyocare-prd.md` — the master PRD (kept local, gitignored)

## Structure

```
app/
├── layout.tsx            # root: metadata, viewport (zoom never blocked), fonts, lang="bn"
├── fonts.ts              # self-hosted Hind Siliguri / Poppins / Inter (no runtime Google call)
├── globals.css           # design tokens (@theme); default palette cleared so teal-500 can't be typed
├── (customer)/           # public site, PWA scope "/"
├── (caregiver)/          # field PWA, scope "/caregiver/"  — guarded
├── (office)/             # admin panel, desktop-first      — guarded
└── (auth)/               # login screens, OUTSIDE the guarded shells (no redirect loop)
components/{ui,customer,office,caregiver,auth}/  # ui primitives + per-actor chrome
lib/
├── shared/               # framework-agnostic: Zod schemas, Bangla check, catalogue seed, ?next= rule
└── server/
    ├── auth/             # tokens, sessions, page-session cookie, dal.ts (page guards)
    └── db/               # Drizzle schema, client, migrations, seed + create-staff CLIs
proxy.ts                  # security headers + actor/pathname classification (Next 16 "Proxy" = old Middleware)
drizzle.config.ts         # drizzle-kit config
public/…manifest.webmanifest  # two path-scoped PWA manifests
tests/a11y.spec.ts        # axe-core accessibility gate
```

## Commands

```bash
npm run dev         # dev server
npm run build       # production build
npm run start       # serve production build
npm run lint        # eslint + eslint-plugin-boundaries (cross-actor imports are errors)
npm run test:unit   # node:test unit tests (e.g. the Bangla-Unicode rule)
npm run test:a11y   # playwright: axe-core a11y gate + the page-guard gate
npm run db:generate # drizzle-kit: regenerate migration SQL from the schema (offline)
npm run db:migrate  # apply migrations (needs DATABASE_URL)
npm run db:seed     # seed zones/services/nursing variants (idempotent)
npm run db:create-staff -- --email x@y.z --password '…' [--name N] [--role ops|admin]
                    # provision a staff login — the bootstrap path, since §10.1 forbids
                    # self-registration. Min 12 chars; they must change it at first sign-in.
npm run db:seed-e2e # fixture for the caregiver a11y suite: an approved caregiver with a
                    # settled PIN + today's job. Goes through the REAL onboarding chain,
                    # so it cannot become a way around the §12.2 gate. Local/test only.
```

## Guardrails (blocking, same severity as typecheck)

- **Module boundaries** (`eslint-plugin-boundaries`): `(customer)` may never import `components/office` or another group's code; `lib/server` is reachable only by the API. (PRD §4.2)
- **Accessibility** (`@axe-core/playwright`): zero serious/critical violations on critical routes; contrast is contract, not preference. (PRD §17.9) **Every surface is scanned**: anonymous routes in `a11y.spec.ts`, the signed-in office in `a11y-office.spec.ts`, the signed-in caregiver PWA in `a11y-caregiver.spec.ts`. The two authenticated suites are opt-in — set `E2E_STAFF_*` / `E2E_CAREGIVER_*` (after `npm run db:seed-e2e`) or they skip. The caregiver suite also asserts the **56px** tap target, since axe only checks WCAG's 24px and would pass a button less than half the size this product promises.
- **Page guards** (`tests/auth-guard.spec.ts`): every `/office/*` and `/caregiver/*` route must redirect to its login screen when signed out. A page that forgets `requireStaffPage()` fails here. (PRD §10.2)
- **Design tokens are closed**: the default Tailwind colour palette is cleared, so the failing brand teal can never be typed as text. (design.md §2)

## Ground rules

- Never push to `main`; work on `development` or feature branches.
- Bangla is Unicode (UTF-8) everywhere — Bijoy/ANSI is rejected. (PRD §18.1)
