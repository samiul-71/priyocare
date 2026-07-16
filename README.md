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

See [`docs/modules/PROGRESS.md`](docs/modules/PROGRESS.md) for the ordered status of every module. Everything else is specced in `docs/modules/` and built on top of these.

### Auth architecture (module 03)

**Hybrid, split by what's being protected** (PRD §10.2):

| Surface | Credential | Gate |
|---|---|---|
| `/api/v1/*` | Bearer JWT in `Authorization` | `requireAuth` / `requireStaff` in the route handler |
| Pages (`/office/*`, `/caregiver/*`) | `pc_session` httpOnly cookie | `requireStaffPage` / `requireCaregiverPage` from the DAL |

A page navigation carries no `Authorization` header, so pages need a cookie; APIs keep Bearer. The two tokens share a signing secret but use **different JWT audiences**, so a stolen cookie can't be replayed as an API token and vice versa — asserted in both directions in `tests/page-session.test.ts`.

The cookie authorises **reads only** — every mutation still goes through a Bearer-gated handler, so classic CSRF stays out of scope even though a cookie now exists (`sameSite=lax` besides). Session lifetime follows the *refresh* token (staff 7d, caregiver 30d), never the 15-minute access token: that's what upholds the caregiver rule (§10.1) that an expired access token must **never** produce a login screen.

Guards live in **each page**, not just the layouts: Next 16 layouts don't re-render on client-side navigation, so a layout-only check isn't a guard. React `cache` collapses the repeated work to one verify + one row read per render. The guards also re-check the account is still active, so suspending a caregiver revokes their page access and not merely their tokens. The **proxy does headers + classification only** — no auth redirect. Refresh tokens are opaque, rotated on every use, and revoked on logout or suspension.

Login screens live in the `(auth)` route group, deliberately **outside** the guarded shells — inside them, an anonymous visitor would be redirected to a login page that redirects them again.

### Environment variables (never committed — `.env*` is gitignored)

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Drizzle client, migrations, seed | Postgres connection string |
| `JWT_SECRET` | access-token **and** page-session-cookie signing | ≥32 chars; rotate on suspected exposure / contractor offboarding. Rotating it invalidates both, signing everyone out — expected. |

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
                    # provision a staff login — the bootstrap path, since §10.1 forbids self-registration
```

## Guardrails (blocking, same severity as typecheck)

- **Module boundaries** (`eslint-plugin-boundaries`): `(customer)` may never import `components/office` or another group's code; `lib/server` is reachable only by the API. (PRD §4.2)
- **Accessibility** (`@axe-core/playwright`): zero serious/critical violations on critical routes; contrast is contract, not preference. (PRD §17.9)
- **Page guards** (`tests/auth-guard.spec.ts`): every `/office/*` and `/caregiver/*` route must redirect to its login screen when signed out. A page that forgets `requireStaffPage()` fails here. (PRD §10.2)
- **Design tokens are closed**: the default Tailwind colour palette is cleared, so the failing brand teal can never be typed as text. (design.md §2)

## Ground rules

- Never push to `main`; work on `development` or feature branches.
- Bangla is Unicode (UTF-8) everywhere — Bijoy/ANSI is rejected. (PRD §18.1)
