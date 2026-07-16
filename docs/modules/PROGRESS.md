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
| — | Page auth guards + login pages | ✅ | `79809b7` | `pc_session` cookie, DAL guards on every `/office` + `/caregiver` page, `/office/login` + `/caregiver/login` |
| 06 | Lead Capture & CRM (lead) | ✅ | `187ef14` | `/enquiry/[service]` + `/office/leads` Kanban, overdue pinning, 30-day dormancy, archetype gate |
| 07 | Caregiver PWA (offline-first) | ✅ | `5cd3778` | IndexedDB queue, idempotent sync, advisory geofence, service worker; `/caregiver/today` + tasks/scan/care-log |
| — | Caregiver onboarding (unblocks 07) | ✅ | `a15dc0b` | Intake → checklist → payout → activate → **PIN issuance**; `/office/caregivers` + `/[id]/verify` |
| 09 | API Layer | ⬜ | — | Route handlers consolidated; partly built alongside 03/04/08 |

## Next up

**Now:** Module 09 — API Layer: fold the route handlers built alongside 03/04/06/07/08 into one consolidated, documented surface, and take the localStorage-Bearer refactor with it (below).
**Then:** the deferred items below — Redis-backed rate limits + the scheduled jobs, the storage provider that unblocks report/document upload, and the SMS/OTP provider (which also closes the admin-issued-PIN trade-off).

### Caregiver onboarding — what's full vs. deferred

Closes the blocking gap module 07 surfaced: no shipped path created a caregiver, so the field app was unusable by anyone.

- **Full:** the whole chain — `POST /api/v1/office/caregivers` (intake → `pending`, no PIN), `PATCH /office/caregivers/{id}` (bKash payout, BNMC, zones), the existing `/verify` step endpoint, and **`POST /office/caregivers/{id}/pin`** (the missing link: `activateCaregiver` flipped status but never issued a credential, so even an approved caregiver could not log in). Pages: `/office/caregivers` board + `/office/caregivers/[id]/verify`. 15 unit tests.
- **The gate is the point (§12.2, AC 2.2):** PIN issuance re-evaluates `evaluateActivation` **from the database** — not from the caller, and not from `verification_status` alone, which an older code path could have set. Verified live: empty checklist → 409 listing all six blockers; 5/5 steps but no payout → 409 `["bkash_payout_number"]`; **babysitter with 5/5 + payout → 409 `["references","safeguarding"]`** (the two extra steps are genuinely mandatory, not advisory); complete file → PIN issued → caregiver logs in 200, wrong PIN 401. Re-issuing is refused (409) — overwriting a live PIN would lock out a working caregiver mid-shift; a forgotten PIN is a reset, not a re-issue.
- **Design notes:** documents take an opaque **reference, never a URL** — a caller-supplied URL for a police clearance would let anyone point the highest-trust record in the system at any address (same rule as lead documents; storage keys once §19 lands). The PIN is generated with `randomInt` (CSPRNG), argon2id-hashed, returned once, never stored/logged/retrievable; `pin_hash` is never selected into a page — asserted against the rendered HTML.
- **Deferred / trade-off recorded:** the initial PIN is **admin-issued**, so Ops briefly knows it. The better flow — she sets it herself over OTP (§10.1's fallback) — needs the SMS provider (§19). **"Change PIN on first login" is the follow-up that closes this**, tracked below. Also not built: reject-with-reason, PIN reset, and document upload UI (all wait on the same storage/SMS providers).

### Module 07 — what's full vs. deferred

- **Full:** pure offline logic (`lib/shared/geo.ts` haversine + 500m advisory, `caregiver-events.ts` uuid/dedupe/replay-ordering, `caregiver-schemas.ts`) with 21 unit tests; `lib/caregiver/queue.ts` IndexedDB queue and `sync.ts` (silent-refresh-then-flush); `POST /caregiver/{check-in,check-out,sync}`, `POST /bookings/{id}/care-log`, `PATCH /bookings/{id}/tasks`; service worker at `/caregiver/sw.js` (scope-pinned, network-first pages, **never caches the API**); `/caregiver/today` + tasks/scan/care-log; live sync chrome that owns the flush triggers.
- **The composition holds (§10.1 Flow A), structurally not carefully:** `enqueue` reads no token and checks no network — `lib/caregiver/sync.ts` is the *only* file that touches either. So an expired access token cannot block a tick (AC-4.1), because the tick never asks. The page guard reads the 30-day cookie, never the 15-minute access token (verified: caregiver cookie `Max-Age` = 30d vs staff 7d).
- **Geofence is invisible (AC-1), verified live:** a check-in 5,313m away returned `{"ok":true}` — byte-identical in shape to one at the doorstep — while Ops silently got a `geofence_mismatch` alert. `getTodayJob` does not even *select* the booking's lat/lng, so the target cannot be read off the device; asserted against the rendered HTML.
- **Idempotency (AC-2), verified live:** a whole shift sent **twice** produced 4 `sync_events`, 1 `care_log`, 1 `ops_alert` — zero duplicates (§13 target: 0). A replayed check-in kept its original `occurred_at` of 09:00 rather than the replay's 23:59, and created no second alert. Out-of-order delivery (check-out first) replayed in device order, so the booking still ended `completed` rather than reopening. `care_logs.logged_at`=11:30 (device) vs `synced_at`=20:04 (arrival) — both facts kept.
- **Deferred:** **camera barcode scanning** — manual entry only, which §11 requires as a fallback anyway and §14 leaves the library an open question; building the fallback first means every device works today. **Background Sync** is deliberately not used (unavailable on iOS, unreliable on cheap Androids): a worker retrying writes would be a second invisible path over the same events. **Photo upload** in the care log waits on the storage provider (§19). The **missed check-in/out sweep** (`flagMissedCheckIns`) is a plain function until Redis/BullMQ.
- **Blocking gap surfaced — now closed (`a15dc0b`):** nothing could create a caregiver, so this app was unusable by anyone. Verification here used a throwaway fixture rather than a `db:create-caregiver` CLI, because minting an approved caregiver with a PIN bypasses the §7.4/§12.2 activation gate — a safety rule, not paperwork. Onboarding now builds that chain properly; see its section above.

### Module 06 — what's full vs. deferred

- **Full:** pure pipeline logic (`lib/shared/leads.ts` — overdue, dormancy, stage rules, Kanban ordering) with 20 unit tests; `POST /api/v1/leads` (public, rate-limited 5/10min, **archetype-gated** → 422 for a non-`lead` service); `PATCH /api/v1/office/leads/{id}` (staff-gated; stage change + activity in one transaction → 409 on reopen/missing lost reason, 404 unknown, 422 empty patch); `/enquiry/[service]` public form (lead services only; a non-lead slug 404s); `/office/leads` Kanban with overdue pinning, duplicate-phone surfacing, and a dormant shelf; `sweepDormantLeads` for the §12.1 job.
- **Design notes:** stage rules are permissive about ORDER (Ops skips steps; a board that fights them gets worked around) but strict about the two moves that lose information — reopening a closed lead, and marking lost without a reason. The Kanban uses a `<select>` + button, not drag-and-drop: dragging is the part of a Kanban that fails keyboard and screen-reader users, and the board's job is making the next action obvious. Duplicates are computed at query time, never stored — a repeat caller is a fact about current data, and a stored flag goes stale the moment the other lead closes.
- **Deferred:** **document upload** — `documents` accepts a storage KEY, never a caller-supplied URL, and the form submits none until private storage + signed access exist (§11, §19); a medical report must not be attachable before it has somewhere private to land. **`sweepDormantLeads` is not scheduled** — it is a plain function until BullMQ/Redis is on the VPS (§3.4). **Mental Health** enquiries are captured (S-3) but the service stays off-platform until Phase 3 (§10.6) — crisis protocol + note encryption first.
- **Open question raised:** Flow C says a new lead lands "+ owner", but no PRD rule says WHO. Rather than invent a round-robin, `ownerId` stays null and the Kanban shows "Unassigned" — with `next_action_at` set to +24h, so an unclaimed lead surfaces as overdue tomorrow instead of resting at `new` forever. Needs an assignment rule.

### Page auth guards — what's full vs. deferred

Closed the gap where `/office/*` and `/caregiver/*` pages were viewable by anyone (the API was always gated).

- **Full:** `pc_session` httpOnly cookie signed with a **distinct JWT audience** from access tokens, so neither token works in the other's seam (unit-tested both directions, and verified live); per-subject lifetime tracking the *refresh* token (staff 7d, caregiver 30d); a DAL (`lib/server/auth/dal.ts`) with `requireStaffPage`/`requireCaregiverPage` — cookie verify **plus** a DB check that the account is still active, so suspension revokes page access and not just tokens; `?next=` return paths validated by a shared rule (`lib/shared/return-path.ts`, unit-tested against open-redirect, cross-actor, and CRLF cases); `/office/login` + `/caregiver/login` in a new `(auth)` route group; sign-out that clears both halves of the session.
- **Design note — why not the layouts:** the original plan said "a check in the `(office)`/`(caregiver)` layouts". Next 16 is explicit that layouts **do not re-render on client-side navigation** (Partial Rendering), so a layout-only check is not a guard. Every page calls the guard itself; the layouts also call it for their chrome, and React `cache` collapses the duplicate work to one verify + one row read per render.
- **The caregiver rule holds (§10.1, Flow A):** the guard reads the 30-day cookie, never the 15-minute access token, so an expired access token can never surface a login screen. A caregiver sees `/caregiver/login` only after a full month away, or on suspension.
- **Deferred:** the office forms still hold Bearer tokens in `localStorage` (XSS-readable) because `/api/v1/office/*` is Bearer-gated — see the follow-up below. (The full login cycle *is* now verified locally — see the Environment section; that caveat is retired.)
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
- [x] **Caregiver onboarding** — done (see above). The PIN is only ever set on a caregiver who passes the full §12.2 gate.
- [ ] **Change PIN on first login + PIN reset.** The initial PIN is admin-issued, so Ops knows it until she changes it — and today there is no way to change it. Needs the SMS/OTP provider (§10.1 fallback, §19). Until then an Ops user could log in as a caregiver they onboarded, which is exactly the kind of thing the geofence-invisibility and complaint rules assume cannot happen quietly.
- [ ] **Reject a caregiver with a reason.** `verification_status` has `rejected` and nothing sets it — a failed police check currently has no recorded outcome.
- [ ] **Get Bearer tokens out of the browser** (module 09). The office forms keep the access + refresh pair in `localStorage` (`lib/shared/client-tokens.ts`) because `/api/v1/office/*` authenticates with Bearer headers. Any XSS on the origin can read them; the page cookie is httpOnly and cannot. The real fix is to make office mutations **Server Actions authorised by the cookie**, leaving Bearer for genuine API clients — a module 09 refactor, since it changes every office handler's entry point.
- [ ] **A missing `JWT_SECRET` silently signs everyone out.** `verifyPageSession`/`verifyAccessToken` catch *all* errors and return null, including the "JWT_SECRET must be set" throw — so a misconfigured deploy would redirect every user to login rather than failing loudly. Fail fast at boot instead (pre-existing in `tokens.ts`; the page session inherits it).

## Environment (updated — local Postgres now exists)

**Postgres 17 is installed locally** (service `postgresql-x64-17`, port 5432), with a dedicated `priyocare` role + database, migrations applied and the catalogue seeded. `.env.local` (gitignored) supplies `DATABASE_URL` + `JWT_SECRET`; `next` reads it automatically and the Node scripts load it via `process.loadEnvFile`. Setup steps are in the README.

**This retires the "no Postgres in the build environment" caveat** that qualified every module above. Until now *nothing was ever persisted*: reads returned `[]` via `isDbConfigured()` (which is why the office panel showed empty states — no database, not an empty one) and every write path threw. The 21-table schema existed only as unapplied SQL.

Verified against the live database once it existed: staff login (argon2id — wrong password 401, correct 200), the `pc_session` cookie (`HttpOnly`, `SameSite=lax`, `Max-Age=604800` = the intended 7-day staff window), all guarded pages rendering at 200 with a session, **deactivation revoking page access on the next request while the cookie is still valid** (the DB check earning its keep — Flow C), logout clearing the cookie, refresh-token rotation + revocation (revoked → 401 on `/auth/refresh`).

Still not local: **Redis** (rate limits use the in-memory limiter — correct for one process, swap on the VPS), the SMS/OTP provider, the payment gateway, and private report storage (§19).

Each commit message states exactly what was verified vs. deferred.
