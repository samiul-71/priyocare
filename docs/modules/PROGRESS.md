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
| 09 | API Layer | ✅ | `e8aeefa` | Booking idempotency, `GET /services`, sample scan, write limits, **office Bearer→cookie**, `docs/api.md` |
| — | Force PIN change on first login | ✅ | `59e1cee` | Closes the admin-issued-PIN gap; revokes sessions predating the change |

## Next up

**All nine modules are built.** What remains is provider-blocked or tracked below: Redis (rate limits + the scheduled jobs), the storage provider (report/document upload), the SMS/OTP provider (now needed only for **PIN reset**, not the first-login change), and the payment gateway's webhook shape. Then §10.7's external pentest / OWASP pass.

### Force PIN change on first login — what's full vs. deferred

Closes the trade-off onboarding recorded: the initial PIN is read out by Ops, so for a moment someone else knows a caregiver's credential. **This did not need SMS** — that is only required for *reset*. The distinction was worth making: it moved a real security gap out of "provider-blocked" and into "done".

- **Full:** `pin_must_change` + `pin_changed_at` (migration 0003, **with a backfill** — every PIN that existed was Ops-issued, so defaulting them to `false` would have exempted exactly the caregivers this protects); `requireCaregiverPage` diverts every caregiver page to `/caregiver/change-pin` until she replaces it; the change screen lives in `(auth)`, outside the guard that points at it (the login-loop rule again); a chosen PIN cannot be a repeated digit or a run like 1234 — the *first* guesses, not a general strength regime, since more rules just move the PIN onto the phone case. 9 unit tests.
- **The half that is easy to miss:** changing the PIN must **revoke what the old one opened**, or the change is theatre. Refresh tokens are rows → revoked outright. The page cookie is a stateless JWT with nothing to revoke → `pin_changed_at` is stamped and the guard refuses any session whose `iat` precedes it. Verified live by actually doing the attack: **Ops signed in as her with the issued PIN, she changed it, and Ops' cookie → 307 to login while their refresh token → 401.** Old PIN 401, new PIN 200 into her job.
- **§10.1 is not violated:** the rule is that TOKEN EXPIRY must never wall off a working shift. This is one-time setup on a brand-new account, before any work exists — her queue is empty by definition, because she could not open the app until now.
- **Deferred:** **PIN reset** (forgot PIN) needs the SMS/OTP fallback — see the follow-up above. Staff passwords have no equivalent flow either; they are admin-set at creation and never rotated.

### Module 09 — what's full vs. deferred

Most of §8 was already built alongside its owning modules. This closed the four real gaps and consolidated the surface.

- **`POST /bookings` was not idempotent (S-1)** — the worst thing in the system to double-execute. A retry took a second slot from a real patient and queued a second payment. Now an `Idempotency-Key` header returns the original booking. Two layers, because a read alone is not enough: the `SELECT` catches an ordinary retry, the **UNIQUE constraint** catches the true race where both requests read nothing and both insert. Verified live: the same key sent three times → one booking, one payment, one item, one slot claimed; a different key → a new booking; no key → still allowed (Ops phone bookings carry none).
- **`GET /services` did not exist**, so the phone-booking form guessed ids from the seed's sort order — right only on a freshly seeded database, and silently the wrong service anywhere else. Now real ids, server-loaded.
- **`POST /samples/{barcode}/scan` did not exist.** Built on module 07's existing idempotent `applySampleScan`. Narrower than §8 on purpose: caregiver-only, because no lab actor exists and inventing one is worse than being narrow.
- **Authenticated writes had no rate limit** — the `writePerAccount` policy existed and nothing used it. Now on all 14 write handlers, keyed by the verified subject rather than the IP.
- **`localStorage` Bearer tokens are gone** (the tracked security item): office pages mutate through cookie-authorised **Server Actions**, so the browser holds no API credential at all — the class of bug is removed, not mitigated. Next invokes actions POST-only and checks `Origin` against `Host`, so CSRF does not return. `/api/v1/office/*` keeps its Bearer gate for real API clients. Verified in a browser: sign-in works through the form, and `localStorage` holds no token while the cookie stays invisible to JS. The caregiver PWA still holds one, deliberately — its sync flush runs outside a rendered page (documented in `client-tokens.ts`).
- **A real flaw the tests surfaced:** the office a11y suite started failing because eleven sign-ins from one address tripped the **10-per-5-minute per-IP login cap**. That is not a test artifact — an Ops floor shares one office IP, so the limiter would have locked out the staff on a Monday morning while barely inconveniencing an attacker, who has the whole internet's IPs. Fixed properly: the tight limit is now **per identity** (5/15min), per-IP is a loose spray backstop (50/5min), and **only failures count** — a success clears the identity's history, because brute force is repeated *failure* and charging a correct password punishes the legitimate user for the attacker's behaviour. 10 unit tests lock the behaviour in.
- **Deferred:** rate-limit thresholds are informed guesses until real traffic (§14); the webhook's payload mapping needs the provider spec (§19) — the HMAC verification is real, the field mapping is not.

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
- [x] **Change PIN on first login** — done (see below). It turned out **not** to need SMS: that is only required for *reset* (forgot PIN), which is still open.
- [ ] **PIN reset (forgot PIN).** Needs the SMS/OTP provider (§10.1's fallback, §19). Today a caregiver who forgets her PIN has no route back in — Ops cannot look it up (nothing stores it) and re-issue is refused while one exists. The honest interim answer is that Ops clears `pin_hash` in the database, which is not a workflow anyone should rely on.
- [ ] **Reject a caregiver with a reason.** `verification_status` has `rejected` and nothing sets it — a failed police check currently has no recorded outcome.
- [x] **Get Bearer tokens out of the browser** — done for the office (Server Actions). The caregiver PWA keeps one by necessity; see `lib/shared/client-tokens.ts`. The office forms keep the access + refresh pair in `localStorage` (`lib/shared/client-tokens.ts`) because `/api/v1/office/*` authenticates with Bearer headers. Any XSS on the origin can read them; the page cookie is httpOnly and cannot. The real fix is to make office mutations **Server Actions authorised by the cookie**, leaving Bearer for genuine API clients — a module 09 refactor, since it changes every office handler's entry point.
- [ ] **A missing `JWT_SECRET` silently signs everyone out.** `verifyPageSession`/`verifyAccessToken` catch *all* errors and return null, including the "JWT_SECRET must be set" throw — so a misconfigured deploy would redirect every user to login rather than failing loudly. Fail fast at boot instead (pre-existing in `tokens.ts`; the page session inherits it).

## Environment (updated — local Postgres now exists)

**Postgres 17 is installed locally** (service `postgresql-x64-17`, port 5432), with a dedicated `priyocare` role + database, migrations applied and the catalogue seeded. `.env.local` (gitignored) supplies `DATABASE_URL` + `JWT_SECRET`; `next` reads it automatically and the Node scripts load it via `process.loadEnvFile`. Setup steps are in the README.

**This retires the "no Postgres in the build environment" caveat** that qualified every module above. Until now *nothing was ever persisted*: reads returned `[]` via `isDbConfigured()` (which is why the office panel showed empty states — no database, not an empty one) and every write path threw. The 21-table schema existed only as unapplied SQL.

Verified against the live database once it existed: staff login (argon2id — wrong password 401, correct 200), the `pc_session` cookie (`HttpOnly`, `SameSite=lax`, `Max-Age=604800` = the intended 7-day staff window), all guarded pages rendering at 200 with a session, **deactivation revoking page access on the next request while the cookie is still valid** (the DB check earning its keep — Flow C), logout clearing the cookie, refresh-token rotation + revocation (revoked → 401 on `/auth/refresh`).

Still not local: **Redis** (rate limits use the in-memory limiter — correct for one process, swap on the VPS), the SMS/OTP provider, the payment gateway, and private report storage (§19).

Each commit message states exactly what was verified vs. deferred.
