# PriyoCare

Trusted home healthcare in Dhaka — **one Next.js application, one repository, one deployment**. The customer website, caregiver PWA, office/admin panel, and the API all live here as route groups (PRD §4.1).

> **Framework note:** this is the latest Next.js (v16.2.10) + React 19, which differs from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework code. Notably, **Middleware is now "Proxy"** (`proxy.ts`).

## Status

**Module 01 — Design System & Application Foundation** is built. It establishes the contrast-safe token system, self-hosted fonts, the three actor shells, the boundary + accessibility CI gates, and the landing page. Everything else is specced in `docs/modules/` and built on top of this.

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
lib/shared/               # framework-agnostic shared code (Zod schemas land here in module 09)
proxy.ts                  # route-group auth gating skeleton (Next 16 "Proxy" = old Middleware)
public/…manifest.webmanifest  # two path-scoped PWA manifests
tests/a11y.spec.ts        # axe-core accessibility gate
```

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve production build
npm run lint       # eslint + eslint-plugin-boundaries (cross-actor imports are errors)
npm run test:a11y  # axe-core: fails on ANY serious/critical violation
```

## Guardrails (blocking, same severity as typecheck)

- **Module boundaries** (`eslint-plugin-boundaries`): `(customer)` may never import `components/office` or another group's code; `lib/server` is reachable only by the API. (PRD §4.2)
- **Accessibility** (`@axe-core/playwright`): zero serious/critical violations on critical routes; contrast is contract, not preference. (PRD §17.9)
- **Design tokens are closed**: the default Tailwind colour palette is cleared, so the failing brand teal can never be typed as text. (design.md §2)

## Ground rules

- Never push to `main`; work on `development` or feature branches.
- Bangla is Unicode (UTF-8) everywhere — Bijoy/ANSI is rejected. (PRD §18.1)
