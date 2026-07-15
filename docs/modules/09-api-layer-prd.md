# PRD — Module 09: API Layer

| Field | Value |
|---|---|
| Module | API Layer (`app/api/v1/*`) |
| Status | Draft |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) · master PRD §4.5, §8, §9, §10.3 |
| Stakeholders | CTO, Senior Eng |

---

## 1. Executive summary

**What** — the versioned API for the whole product as **route handlers under `app/api/v1/`**, sharing the same `lib/shared` Zod schemas the pages import. **Why** — the monolith removes the `@priyocare/api-contract` publish/version-bump loop: a schema change and all its consumers land in **one PR** (§4.5). **Who** — every surface (customer, caregiver, office) plus external webhooks. **How** — thin handlers that validate with shared Zod, call `lib/server` services, and return typed responses; webhooks are HMAC-verified and are the **source of truth over browser redirects**. **Success** — no drift between what a page sends and what a handler expects; 0 price-mismatch, 0 overbooking, 0 sync duplicates. **Effort** — L (breadth). **Risks** — payment webhook correctness; idempotency for sync and bookings.

---

## 2. Purpose & user goal

Give every surface one consistent, validated, typed API with no contract-package overhead, where the same Zod schema guards the form and the handler.

---

## 3. Scope

| | |
|---|---|
| **In scope** | All §8 route handlers: `/auth/*`, `/services`, `/slots`, `/bookings` + `/bookings/[id]/{tasks,care-log}`, `/leads`, `/caregiver/{check-in,check-out,sync}`, `/samples/[barcode]/scan`, `/payments/webhook/[provider]`, `/reports/[sample_id]`, `/office/{bookings/[id]/dispatch, leads/[id], caregivers/[id]/verify, caregivers/[id]/suspend}` · shared Zod schemas in `lib/shared` · rate limiting · idempotency (bookings, sync) · HMAC webhook verification · standard error envelope |
| **Out of scope** | UI (owning modules) · DB schema (02) · auth token mechanics (03, consumed here) · business decisions already specified in owning modules (this module wires the handlers to services) |
| **Assumptions** | modules 02, 03 done · `lib/server` services (db, queue, payments, storage) exist · same-origin → **no CORS** |

---

## 4. Sections & components

| # | Section | Purpose |
|---|---|---|
| 1 | Shared schemas | `lib/shared/*` Zod — single source of truth |
| 2 | Auth handlers | `/auth/*` |
| 3 | Booking handlers | `/slots`, `/bookings`, `/bookings/[id]/*` |
| 4 | Lead handlers | `/leads`, `/office/leads/[id]` |
| 5 | Caregiver handlers | `/caregiver/*` |
| 6 | Sample/report handlers | `/samples/[barcode]/scan`, `/reports/[sample_id]` |
| 7 | Payment webhook | `/payments/webhook/[provider]` |
| 8 | Office handlers | `/office/*` |

---

## 5. Screens · Key actions · Key fields

None — this module has no screens. Its "surface" is the HTTP contract in §8 of the master PRD.

---

## 6. User flows

### Flow — A schema change lands with its consumers in one PR (§4.5)
```
[Edit lib/shared/bookingSchema] → [page form + route handler both import it]
  → [typecheck fails everywhere out of sync] → [fix in same PR] → [one CI pipeline]
```

---

## 7. Data models

No new tables. Handlers read/write the module 02 schema. This module owns the **Zod** representations of those tables and request/response envelopes in `lib/shared`.

---

## 8. API contracts

Implements master PRD §8 in full. Load-bearing handlers:

| Method | Path | Auth | Critical rule |
|---|---|---|---|
| `GET` | `/slots?zone_id&date&service_id` | public | excludes full slots server-side |
| `POST` | `/bookings` | customer/Ops | price re-validated in same txn; race-safe capacity; 422 on mismatch |
| `POST` | `/leads` | public, rate-limited | archetype must be `lead` |
| `POST` | `/caregiver/sync` | caregiver | idempotent by `event_uuid`, excludes `occurred_at` from update |
| `POST` | `/payments/webhook/{provider}` | HMAC | **server is source of truth, not browser redirect** |
| `GET` | `/reports/{sample_id}` | signed URL | 15-min expiry |
| `POST` | `/office/caregivers/{id}/suspend` | Ops | revokes refresh tokens |

Standard error envelope: `{ error: { code, message, fields? } }`; field errors keyed for inline rendering (`{errors: {landmark: ["required"]}}`).

---

## 9. UI states

N/A (no UI). Response contracts define the states owning modules render.

---

## 10. Critical features — examples & scenarios

### Feature: Shared-schema validation (§10.3)
Every request body validated against **the same `lib/shared` Zod schema the page imports** — no drift possible. Includes the Unicode-Bangla refinement for `*_bn` fields.

### Feature: Webhook as source of truth (§9)
Booking is created/confirmed from the gateway callback, independent of what the browser showed — so a client crash before confirmation still yields a booking.

| # | Scenario | Expected |
|---|---|---|
| S-1 | duplicate `POST /bookings` (retry) | idempotency key dedupes |
| S-2 | webhook with bad HMAC | rejected |
| S-3 | sync batch replayed | no duplicate rows |
| S-4 | raw SQL anywhere | must use placeholders (Drizzle parameterised) |

---

## 11. Edge cases

- Rate-limit breach → `429` with retry-after.
- Partial batch sync failure → per-event result, client retries only failed `event_uuid`s.
- Version prefix `v1` fixed; breaking changes → `v2`, never silent.

---

## 12. Acceptance criteria with test cases

### AC-1 — No schema drift
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | shared schema changed | typecheck | page + handler fail together until fixed |

### AC-2 — Price & capacity integrity
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | price mismatch | `POST /bookings` | 422, no row, no capture |
| 2.2 | last slot race | two requests | one 200, one 409 |

### AC-3 — Sync idempotency
| TC | Given | When | Then |
|---|---|---|---|
| 3.1 | duplicate `event_uuid` | sync | no duplicate; `occurred_at` preserved |

### AC-4 — Webhook auth
| TC | Given | When | Then |
|---|---|---|---|
| 4.1 | invalid HMAC | webhook POST | rejected |

---

## 13. Metrics

| Metric | Target |
|---|---|
| API uptime (monthly) | ≥ 99.5% |
| Booking creation p95 | < 400ms |
| Price-mismatch / overbooking / sync-duplicate | 0 each |

---

## 14. Open questions

- [ ] Payment/SMS/masked-calling provider specifics (webhook shapes).
- [ ] Rate-limit thresholds per endpoint.
- [ ] OWASP API Top 10 self-review (§10.7).

---

## 15. Out-of-scope / future

- GraphQL/BFF variants (not planned).
- Public partner API.

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| CTO | | | ☐ |
| Senior Eng | | | ☐ |
