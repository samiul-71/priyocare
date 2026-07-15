# PRD — Module 01: Design System & Application Foundation

| Field | Value |
|---|---|
| Module | Design System & Application Foundation |
| Status | Draft for build (this is the **first module to implement**) |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) · master PRD §4.1–§4.5, §17, §18 |
| Stakeholders | CTO, Senior Eng, Design |

---

## 1. Executive summary

**What** — the skeleton every other module is built on: the design tokens, self-hosted fonts, the three route-group shells (`(customer)`, `(caregiver)`, `(office)`), the auth-gating middleware skeleton, PWA manifests, the accessibility CI gate, and a real landing page. **Why** — PRD §17 is explicit that the design system (with the fixed teal) must exist *before any UI is built*, and the route tree in §4.1 must exist before any surface has somewhere to live. **Who** — every engineer, every module, from day one. **How** — Tailwind v4 `@theme` + `globals.css` encode [`design.md`](./design.md) tokens; `next/font/local` self-hosts the three fonts; route groups give each actor an isolated shell. **Success** — `npm run build` passes, axe-core CI is green on the landing route, and no raw hex exists outside `globals.css`. **Effort** — M, no external dependencies (no DB, no gateway). **Risks** — the isolated heart-mark SVG is blocked (§17.5); ship a code-drawn placeholder.

---

## 2. Purpose & user goal

This module has no end-user screen goal of its own beyond the landing page; its "user" is every downstream module. It exists so that the moment module 02+ starts, the contrast-safe palette, the fonts, the boundaries lint, the a11y gate, and the actor shells are already there — nobody re-derives them, and nobody ships teal-on-white text in month four.

---

## 3. Scope

| | |
|---|---|
| **In scope** | Tailwind v4 theme + `globals.css` tokens (design.md §2, §3) · self-hosted Hind Siliguri / Poppins / Inter via `next/font/local` · root layout with correct `metadata`/`viewport` (§17.8) · route groups `(customer)`, `(caregiver)`, `(office)` each with a `layout.tsx` shell · `middleware.ts` skeleton keyed by path prefix (no real verification yet) · two PWA manifests (customer scope `/`, caregiver scope `/caregiver/`) · `eslint-plugin-boundaries` config · `@axe-core/playwright` CI gate wiring · a real customer landing page (`/`) with hotline CTA, service tiles, zone banner · shared `ui` primitives: `Button`, `StatusBadge` (icon+label), `Skeleton`, `SectionError` |
| **Out of scope** | Any DB access (module 02) · real auth verification (module 03) · booking/lead/caregiver/office feature screens · `next-intl` full wiring (stub the locale strategy, don't build the switcher) · service-worker offline write-queue (module 07) · real logo SVG assets (blocked, §9 of design.md) |
| **Assumptions** | Next.js 16.2.10 App Router, React 19, Tailwind v4 (already installed) · no dark mode · fonts are self-hosted from `app/fonts/` or `public/fonts/` |

---

## 4. Sections & components

| # | Area | Purpose | Artifacts |
|---|---|---|---|
| 1 | Theme | Encode design tokens | `app/globals.css` (`@theme`, `:root` vars) |
| 2 | Fonts | Self-host 3 families | `app/fonts.ts` (`next/font/local`), font files |
| 3 | Root layout | Metadata, viewport, `lang`, font vars | `app/layout.tsx` |
| 4 | Customer shell | Warm chrome, header w/ hotline, footer | `app/(customer)/layout.tsx` |
| 5 | Caregiver shell | Teal header, 18px base, sync-status slot | `app/(caregiver)/layout.tsx` |
| 6 | Office shell | Navy sidebar, dense | `app/(office)/layout.tsx` |
| 7 | Landing | `/` hero, search, service tiles, zone banner | `app/(customer)/page.tsx` |
| 8 | UI primitives | Reusable, a11y-correct | `components/ui/{Button,StatusBadge,Skeleton,SectionError,Logo}.tsx` |
| 9 | Middleware | Path-prefix routing skeleton | `middleware.ts` |
| 10 | PWA | Two manifests + icons ref | `public/manifest.webmanifest`, `public/caregiver/manifest.webmanifest` |
| 11 | Guardrails | Boundaries + a11y CI | `eslint.config.mjs`, Playwright axe test |

---

## 5. Screens · Key actions · Key fields

| Screen | Route | Key actions | Key fields |
|---|---|---|---|
| Landing / search | `/` | Search, tap a service tile, tap hotline | search box, 8 service tiles (bn+en), **hotline `01335995555` CTA**, zone banner (Mirpur DOHS → Mirpur → Pallabi → Uttara → Gulshan) |
| Caregiver shell (empty) | `/caregiver` | — (redirect to login later) | teal header, sync-status placeholder |
| Office shell (empty) | `/office` | — (redirect to login later) | navy sidebar nav placeholder |

---

## 6. User flows

### Flow A — First paint of the landing page

**Pre:** none (public, unauthenticated). **Post:** LCP < 2.5s on Fast 3G; fonts self-hosted (no third-party request); axe-core clean.

```
[GET /] → [Root layout: lang=bn, font vars, metadata/viewport]
        → [(customer) shell: header + hotline CTA]
        → [Landing: hero + search + 8 service tiles + zone banner + footer]
        → {tile is 'lead' archetype?} yes → link to /enquiry/[service]
                                       no  → link to /book/[service]/select
```

### Flow B — Route-group isolation holds at build time

**Pre:** a dev writes `import Something from "@/components/office/…"` inside `app/(customer)/…`. **Post:** `eslint-plugin-boundaries` fails the lint step (same severity as typecheck); PR cannot merge.

---

## 7. Data models

None. This module touches no database. It only defines the CSS-variable "token contract" and the component prop contracts. (First DB entities arrive in module 02.)

---

## 8. API contracts

None. No route handlers in this module. `middleware.ts` is a **skeleton**: it recognises the three path prefixes and is ready to attach verification in module 03, but performs no token verification yet (it lets everything through, with a `TODO` and a typed seam).

---

## 9. UI states

| Section | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Landing service tiles | `<Skeleton>` grid (static in this module — tiles are hardcoded from the catalogue constant until module 02) | N/A (always 8) | N/A | 8 tiles render |
| Shared primitives | `<Skeleton>` variants exist | — | `<SectionError onRetry>` exists | `<Button>`, `<StatusBadge>` render |

`StatusBadge` must render **icon + text label**, never colour alone (design.md §5.2), and stay legible in greyscale.

---

## 10. Critical features — examples & scenarios

### Feature: Contrast-safe token system

**Example** — a link uses `text-teal-700` (4.58:1 ✅). There is **no** `teal-500` utility, so a dev physically cannot type `text-teal-500`. A filled secondary button uses `bg-teal-800` + white (5.09:1 ✅), never `bg-teal-brand` (3.40:1 ❌).

| # | Scenario | Expected |
|---|---|---|
| S-1 | Dev writes a raw hex in a component | ESLint/review rejects; only `globals.css` holds hex |
| S-2 | Dev sets `maximum-scale=1` in viewport | Rejected — zoom must never be blocked |
| S-3 | Bangla text at 16px | Bumped to 17px via `font-bn` utility / `lang="bn"` rule |

### Feature: Self-hosted fonts

**Example** — `app/fonts.ts` exposes `hindSiliguri`, `poppins`, `inter` via `next/font/local`; root layout applies their CSS variables to `<html>`. No network call to `fonts.googleapis.com` appears in the Network tab on cold load.

| # | Scenario | Expected |
|---|---|---|
| S-4 | Offline / third-party blocked | Fonts still render (self-hosted) |
| S-5 | Price rendered | Inter tabular figures — digits align in a column |

### Feature: Two distinct PWA scopes

**Example** — `/manifest.webmanifest` scope `/`, theme `#012967`; `/caregiver/manifest.webmanifest` scope `/caregiver/`, theme `#0A7B7A`. Two installable apps, visually distinct icons (customer white bg, caregiver teal bg).

| # | Scenario | Expected |
|---|---|---|
| S-6 | iOS multi-PWA quirk | Documented as best-effort; needs real-device verification (§4.3 open) |

---

## 11. Edge cases

- Real heart-mark SVG missing → ship a code-drawn `<Logo>` heart; leave an Open Question and a swap point.
- 200% zoom on the landing page → no horizontal scroll, nothing clipped.
- `prefers-reduced-motion` → all fades disabled.
- Very long Bangla service names in tiles → wrap, never truncate mid-conjunct.
- JS disabled → landing is server-rendered and readable; hotline is a plain `tel:` link.

---

## 12. Acceptance criteria with test cases

### AC-1 — Build & lint pass
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | Clean checkout | `npm run build` | Succeeds with no type errors |
| 1.2 | Cross-group import added | `npm run lint` | `eslint-plugin-boundaries` fails |

### AC-2 — Tokens are contrast-safe and closed
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | Any component | grep for hex outside `globals.css` | Zero matches |
| 2.2 | Author types `text-teal-500` | build | No such utility exists → fails |

### AC-3 — Accessibility gate
| TC | Given | When | Then |
|---|---|---|---|
| 3.1 | Landing route | `@axe-core/playwright` run | Zero serious/critical violations |
| 3.2 | Landing at 200% zoom | browser zoom | No horizontal scroll |
| 3.3 | `StatusBadge` greyscale | rendered greyscale | Still distinguishable (icon+label) |

### AC-4 — Fonts self-hosted
| TC | Given | When | Then |
|---|---|---|---|
| 4.1 | Cold load | inspect network | No request to Google Fonts |
| 4.2 | Bangla text | rendered | 17px (Latin 16px), Hind Siliguri |

### AC-5 — Viewport never blocks zoom
| TC | Given | When | Then |
|---|---|---|---|
| 5.1 | Any page | inspect meta viewport | `maximumScale=5`, no `user-scalable=no` |

---

## 13. Metrics

| Metric | Target | Source |
|---|---|---|
| Landing LCP (mobile, Fast 3G, p75) | < 2.5s | RUM/Lighthouse |
| Lighthouse Accessibility (landing) | ≥ 95 | CI |
| Axe serious/critical violations | 0 | CI |
| Font payload | self-hosted, subset | build report |

---

## 14. Open questions

- [ ] Isolated heart-mark SVG + icon PNGs (blocks real PWA icons & favicon) — using code-drawn placeholder until delivered.
- [ ] Confirm font licences allow self-hosting (Hind Siliguri/Poppins/Inter are OFL — OK; verify).
- [ ] Field-verify iOS multi-PWA scoping on a real device.

---

## 15. Out-of-scope / future

- Full `next-intl` locale switcher + message catalogues (stubbed here, built alongside module 04/06 copy).
- Real service-worker offline queue → module 07.
- Populating tiles from the live catalogue API → module 02.

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| CTO | | | ☐ |
| Design | | | ☐ |
| Senior Eng | | | ☐ |
