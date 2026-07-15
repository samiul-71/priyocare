# PriyoCare — Module PRDs

This folder decomposes the master PRD ([`../priyocare-prd.md`](../priyocare-prd.md), v2.0) into **buildable modules**, each with its own PRD, and one shared [`design.md`](./design.md) derived from the logo.

Every module PRD follows the shape of [`../templates/page-prd-template.md`](../templates/page-prd-template.md), adapted from "page" to "module". Read [`design.md`](./design.md) before building any UI in any module.

## The single most important idea (PRD §3.2)

Everything PriyoCare sells is exactly one of three **archetypes**, and the archetype drives the data model:

| Archetype | Shape | Services |
|---|---|---|
| `visit` | slot → dispatch → geofenced check-in → task ticklist → complete | Home Pathology, Nursing (15 procedures), Physiotherapy |
| `placement` | subscription → caregiver continuity → shift roster → daily care log | Caregiver, Babysitter, 24/7 attendant |
| `lead` | **no booking** — CRM pipeline with stages, owner, follow-up date | Medical Tourism, Health Insurance, Mental Health enquiry |

## Modules & build order

The order is dependency-driven, not surface-driven. Foundation and data come before any surface; the **manual phone booking is P0** and precedes the customer booking flow (PRD §3.1).

| # | Module | PRD | Builds | Depends on |
|---|---|---|---|---|
| 01 | **Design System & Application Foundation** | [`01-design-system-and-foundation-prd.md`](./01-design-system-and-foundation-prd.md) | Tokens, fonts, route-group shells, middleware skeleton, PWA manifests, a11y CI gate, landing | — |
| 02 | **Catalogue & Data Model** | [`02-catalogue-and-data-model-prd.md`](./02-catalogue-and-data-model-prd.md) | Drizzle schema for all entities, `/office/catalog`, seed of 5 zones + services + 15 nursing variants | 01 |
| 03 | **Auth & Security** | [`03-auth-and-security-prd.md`](./03-auth-and-security-prd.md) | Three-actor auth, refresh tokens, middleware gating, rate limits, security headers | 01, 02 |
| 04 | **Customer Booking (visit)** | [`04-customer-booking-prd.md`](./04-customer-booking-prd.md) | `/book/*` flow, slots, price integrity, payments | 02, 03 |
| 05 | **Customer Tracking & Reports** | [`05-customer-tracking-and-reports-prd.md`](./05-customer-tracking-and-reports-prd.md) | `/bookings/[id]/track`, `/status`, signed report links | 04 |
| 06 | **Lead Capture & CRM (lead)** | [`06-lead-capture-and-crm-prd.md`](./06-lead-capture-and-crm-prd.md) | `/enquiry/[service]`, `/office/leads` Kanban, follow-up | 02, 03 |
| 07 | **Caregiver PWA (placement + visit field work)** | [`07-caregiver-pwa-prd.md`](./07-caregiver-pwa-prd.md) | Offline-first field app, check-in/out, tasks, care log, sync | 02, 03 |
| 08 | **Office / Admin Panel** | [`08-office-panel-prd.md`](./08-office-panel-prd.md) | Booking queue, **manual phone booking P0**, dispatch, verification, complaints, samples, alerts | 02, 03 |
| 09 | **API Layer** | [`09-api-layer-prd.md`](./09-api-layer-prd.md) | `app/api/v1/*` route handlers, shared Zod schemas, webhooks | 02, 03 |

> Modules 04–09 share the API layer (09) and are documented separately for clarity, but in the monolith a schema change and its consumers land in one PR (PRD §4.5). Build 01 → 02 → 03 first; the rest can proceed in parallel tracks with 08's phone-booking path prioritised.

## Cross-cutting rules (apply to every module)

- **No repo isolation → `eslint-plugin-boundaries`** as a blocking CI check (PRD §4.2). `(customer)` may never import `components/office` or another group's `lib`.
- **`lib/server/` is the wall.** Every file starts with `import "server-only"`. DB/JWT/gateway/storage credentials live here and nowhere else.
- **Zod schemas in `lib/shared/`** are the single source of truth — pages and route handlers import the same schema.
- **Accessibility is a build gate** (design.md §7). **Bangla is Unicode** (design.md §8).
- **Framework:** latest Next.js (v16.2.10) + React 19. Read `node_modules/next/dist/docs/` before writing framework code.
