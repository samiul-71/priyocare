# PriyoCare

Trusted home healthcare in Dhaka — **one Next.js application, one repository, one deployment**. The customer website, caregiver PWA, office/admin panel, and the API all live here as route groups (PRD §4.1).

> **Framework note:** this is the latest Next.js (v16.2.10) + React 19, which differs from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework code. Notably, **Middleware is now "Proxy"** (`proxy.ts`).

## Status

- **Module 01 — Design System & Application Foundation** ✅ contrast-safe tokens, self-hosted fonts, three actor shells, boundary + accessibility CI gates, landing page.
- **Module 02 — Catalogue & Data Model** ✅ full Drizzle schema for all §7 entities (21 tables) + generated migration, Zod schemas with the Bangla-Unicode check (unit-tested), the catalogue seed (5 zones, 8 services, 15 nursing variants), and a read-only `/office/catalog`. *(No Postgres in this environment: the migration is generated offline and the schema/validation are unit-tested; the live DB round-trip — `db:migrate`, `db:seed` — runs on the VPS.)*

Everything else is specced in `docs/modules/` and built on top of these.

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
├── (caregiver)/          # field PWA, scope "/caregiver/"
└── (office)/             # admin panel, desktop-first
components/{ui,customer}/  # ui primitives + customer chrome
lib/
├── shared/               # framework-agnostic: Zod schemas, Bangla check, catalogue seed
└── server/db/            # server-only Drizzle schema, client, migrations, seed CLI
proxy.ts                  # route-group auth gating skeleton (Next 16 "Proxy" = old Middleware)
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
npm run test:a11y   # axe-core: fails on ANY serious/critical violation
npm run db:generate # drizzle-kit: regenerate migration SQL from the schema (offline)
npm run db:migrate  # apply migrations (needs DATABASE_URL, on the VPS)
npm run db:seed     # seed zones/services/nursing variants (needs DATABASE_URL)
```

## Guardrails (blocking, same severity as typecheck)

- **Module boundaries** (`eslint-plugin-boundaries`): `(customer)` may never import `components/office` or another group's code; `lib/server` is reachable only by the API. (PRD §4.2)
- **Accessibility** (`@axe-core/playwright`): zero serious/critical violations on critical routes; contrast is contract, not preference. (PRD §17.9)
- **Design tokens are closed**: the default Tailwind colour palette is cleared, so the failing brand teal can never be typed as text. (design.md §2)

## Ground rules

- Never push to `main`; work on `development` or feature branches.
- Bangla is Unicode (UTF-8) everywhere — Bijoy/ANSI is rejected. (PRD §18.1)
