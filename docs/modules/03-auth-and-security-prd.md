# PRD — Module 03: Auth & Security

| Field | Value |
|---|---|
| Module | Auth & Security |
| Status | Draft |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) · master PRD §4.4, §10 |
| Stakeholders | CTO, Senior Eng, Security |

---

## 1. Executive summary

**What** — one authentication system for three actors (Customer, Caregiver, Ops/Admin) behind **one `middleware.ts`**, one `refresh_tokens` table, one verification function. **Why** — the monolith has one origin and one auth stack; the actor difference is only *which credential the path prefix expects*, not three separate systems (§4.4). **Who** — every authenticated request in every module. **How** — JWT access + rotating refresh; Customer = mobile+OTP, Caregiver = **phone+PIN** (OTP fallback), Ops = email+password (argon2id) with a `role` claim; path-prefix gating in middleware. **Success** — a suspended caregiver's tokens die immediately; an offline caregiver never gets a login wall mid-shift. **Effort** — M. **Risks** — the offline-first vs. token-expiry composition (below) is the subtle one; get it wrong and field work breaks.

---

## 2. Purpose & user goal

Each actor logs in the way that fits their context and stays logged in exactly as long as their privilege warrants — while a caregiver in a signal dead zone keeps working regardless of token state.

---

## 3. Scope

| | |
|---|---|
| **In scope** | `/auth/*` route handlers (otp request/verify, caregiver login, staff login, refresh, logout) · JWT issue/verify (access ~15min; refresh: customer ~30d, caregiver ~30d, staff ~7d — all rotated & revocable) · `refresh_tokens` (subject_type `customer`/`caregiver`/`staff`) · `middleware.ts` path-prefix gating (`/office/*` staff, `/caregiver/*` caregiver, `/book,/bookings,/enquiry` guest-or-customer) · argon2id hashing · per-account & per-IP rate limits · security headers (HSTS, nosniff, X-Frame DENY, scoped CSP) · suspend → **revoke all refresh tokens** |
| **Out of scope** | Caregiver onboarding/verification workflow (module 08) · booking/lead authorization rules beyond token presence (owning modules) · managed auth platform (explicitly out, §3.4) · cookie-based **refresh** (rotation stays Bearer-only — see §17) |
| **Assumptions** | Same-origin → **no CORS** · Redis available for rate limits · module 02 `refresh_tokens`, `users`, `staff_accounts`, `caregivers` exist |

> **Amended (§17):** "Bearer only, so CSRF is N/A" held until pages needed guarding — a navigation sends no `Authorization` header. Pages now use a **read-only session cookie**; mutations stay Bearer, so the CSRF conclusion survives. See §17.

---

## 4. Sections & components

| # | Section | Purpose |
|---|---|---|
| 1 | Token service | issue/verify/rotate access+refresh; `subject_type` aware |
| 2 | Proxy + page DAL | headers & actor classification in the proxy; the real page gate is the DAL (§17); caregiver never redirects on expiry |
| 3 | OTP service | request/verify, rate-limited, per phone & IP |
| 4 | Password/PIN | argon2id (staff), PIN hash (caregiver) |
| 5 | Revocation | logout, suspend → revoke refresh tokens |
| 6 | Security headers | per-route-group |

---

## 5. Screens · Key actions · Key fields

| Screen | Route | Key actions | Key fields |
|---|---|---|---|
| Customer login (modal/flow) | in `/book`, `/bookings` | request OTP, verify | mobile (+880, E.164), 6-digit OTP, timer |
| Caregiver login | `/caregiver/login` | log in | phone + **PIN** (OTP fallback link) |
| Office login | `/office/login` | log in | email, password (no self-registration) |

---

## 6. User flows

### Flow A — Offline caregiver, expired access token (the composition that must hold)
**Pre:** caregiver logged in previously; access token expired; **no network**. **Post:** work never blocked.
```
[Tick task / check out] → [write to IndexedDB regardless of auth state]
  → {network back?} no → stays queued, intact
                    yes → [silent refresh via refresh token] → [POST /caregiver/sync]
  → {refresh also expired (~30d)?} yes → [login screen; queued events remain intact, unsent]
```

### Flow B — Staff login with role claim
```
[POST /auth/staff/login {email,password}] → argon2id verify
  → issue access(role) + refresh(7d) → middleware admits /office/* by role
```

### Flow C — Suspend a caregiver
```
[Ops suspends caregiver] → set verification_status='suspended'
  → revoke ALL their refresh tokens immediately → next sync attempt 401 → removed from dispatch
```

---

## 7. Data models

Reuses module 02 `refresh_tokens` (`subject_type`, `subject_id`, `token_hash`, `issued_at`, `expires_at`, `revoked_at`), `users`, `staff_accounts`, `caregivers.pin_hash`. No new tables; may add indices on `(subject_type, subject_id)` and `token_hash`.

---

## 8. API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/otp/request` | public, rate-limited | caregiver OTP is fallback only |
| `POST` | `/auth/otp/verify` | public, rate-limited | issues access+refresh pair |
| `POST` | `/auth/caregiver/login` | public, rate-limited | `{phone, pin}` |
| `POST` | `/auth/staff/login` | public, rate-limited | `{email, password}` → token w/ `role` |
| `POST` | `/auth/refresh` | refresh token | rotates pair, revokes old |
| `POST` | `/auth/logout` | access token | revokes refresh token |

All bodies validated by shared Zod schemas (module 09 wires the handlers).

---

## 9. UI states

| Section | Loading | Empty | Error | Success |
|---|---|---|---|---|
| OTP entry | spinner | N/A | "Too many attempts — try in X min"; generic "Incorrect code" | auto-proceeds |
| Caregiver login | spinner | N/A | "Wrong PIN"; offline → still enters cached shell | lands on `/caregiver/today` |

---

## 10. Critical features — examples & scenarios

### Feature: Rotating refresh with revocation
**Example** — refresh rotates on every use; old token immediately revoked (single-use). Reuse of a rotated token → treated as theft → revoke the chain.

| # | Scenario | Expected |
|---|---|---|
| S-1 | Refresh token reused after rotation | Chain revoked, forces re-login |
| S-2 | Staff refresh at 8 days | Expired (7d) → re-login |

### Feature: Rate limiting
**Example** — OTP request limited per phone and per IP; `/bookings` and `/leads` writes tighter.

| # | Scenario | Expected |
|---|---|---|
| S-3 | 10 OTP requests in a minute | Throttled with retry-after |

---

## 11. Edge cases

- Caregiver offline entire shift → auth checked only at sync; original `occurred_at` preserved.
- Password never logged; refresh tokens stored **hashed** only.
- Contractor offboarding / suspected exposure → rotate signing secret (§10.4).
- Endpoint ever adopts cookie refresh → revisit CSRF (currently N/A).

---

## 12. Acceptance criteria with test cases

### AC-1 — Expired token never blocks offline work (PRD §13)
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | Access expired, offline | tick task, check out | Events queue, **no login prompt** |
| 1.2 | Reconnect, refresh valid | app syncs | Silent refresh then sync, no interruption |
| 1.3 | Refresh also expired | app syncs | Login appears; queued events intact, unsent |

### AC-2 — Suspend revokes tokens
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | Caregiver suspended | their next request | 401; removed from dispatch immediately |

### AC-3 — Role gating
| TC | Given | When | Then |
|---|---|---|---|
| 3.1 | Customer token hits `/office/*` | request | Rejected by middleware |

---

## 13. Metrics

| Metric | Target |
|---|---|
| Unauthorized cross-actor access | 0 |
| Time-to-revoke on suspend | immediate (< 1 req) |
| OTP abuse blocked | rate limits effective |

---

## 14. Open questions

- [ ] SMS/OTP provider (blocks OTP) — see §19.
- [ ] JWT signing-secret rotation runbook.
- [ ] Threat model / OWASP API Top 10 pass (§10.7).

---

## 15. Out-of-scope / future

- Caregiver verification steps → module 08.
- External pentest → pre-launch (§10.7).

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| CTO | | | ☐ |
| Security | | | ☐ |

---

## 17. Implementation note — page sessions (built after module 05)

Page guards were deferred out of this module and built once modules 04/05 had shipped the pages worth guarding. Four decisions departed from the spec above and are now the built behaviour.

**1. Hybrid credentials, split by surface.** §10.2 left this open. A page navigation carries no `Authorization` header, so pages authenticate with an httpOnly `pc_session` cookie while `/api/v1/*` keeps Bearer. The cookie authorises **reads only** — every mutation still goes through a Bearer-gated handler — so the "CSRF is N/A" conclusion in §3 survives the arrival of a cookie (`sameSite=lax` besides).

**2. Same secret, different audience.** The cookie and the access token are both HS256 with `JWT_SECRET`, but their JWT `aud` differs (`priyocare:page-session` vs `priyocare`). Without this, a stolen 30-day cookie would be a 30-day API credential. Asserted in both directions in `tests/page-session.test.ts` and verified live.

**3. The gate is the DAL, not the middleware.** §4 called for path-prefix gating in middleware. Next 16 says Proxy is for optimistic checks only, and — more decisively — that **layouts do not re-render on client-side navigation**, so the "check in the layout" plan is not a guard either. The real check is `requireStaffPage`/`requireCaregiverPage` (`lib/server/auth/dal.ts`) called by **each page**; layouts call it too for their chrome, and React `cache` collapses the duplicates. The guards also re-read the account's status, so **Flow C suspension revokes page access**, not just tokens.

**4. Cookie lifetime tracks the refresh token, not the access token** (staff 7d, caregiver 30d). This is what makes AC-1 structural rather than careful: the caregiver guard never looks at the access token, so an expired one **cannot** produce a login wall. `/caregiver/login` appears only after ~30 days away or on suspension — and queued IndexedDB writes survive either way (module 07).

Login screens live in an `(auth)` route group, outside the guarded shells — inside them, an anonymous visitor would be redirected to a login page that redirects them again.

**5. A login screen judges the session by the same authority as the guard.** Sitting outside the shell is only half of "does not loop". The login pages also skip their form when you are already signed in, and that check has to agree with the guard pointing at them. It did not: they asked `getPageSession` (cookie only) while `requireStaffPage` asks `getStaffActor` (cookie **and** the row). A cookie can pass the first and fail the second — suspended account, or `iat` older than `password_changed_at` after a reset — and the two seams then redirected at each other forever, `ERR_TOO_MANY_REDIRECTS`, locking the user out of the one page that would have replaced the stale cookie. Both login pages now use the DB-backed actor helpers; `getPageSession` is for checks where being wrong costs nothing. Regression test: `tests/auth-guard.spec.ts` › "a refused-but-valid cookie".

**6. The scoped CSP (§4, row 6) is not identical in dev and production.** React's development build calls `eval()` to reconstruct server-side error stacks in the browser, so `script-src` carries `'unsafe-eval'` under `next dev` — without it the dev error overlay is itself blocked, and takes the error it was reporting down with it. Production never gets it: neither React nor Next `eval()` in a production build, and `'unsafe-eval'` there would let any injected string become code, which is most of what the CSP is for. The branch keys off `NODE_ENV`, which is inlined at build time, so the production bundle cannot carry it. Asserted against the production build in `tests/security-headers.spec.ts` — a too-wide CSP is invisible at runtime (nothing breaks; the policy just stops being worth having), so it has to be tested for rather than noticed.

**Known gap:** the office forms still hold the Bearer pair in `localStorage`, which XSS can read and the cookie cannot. Closing it means moving office mutations to cookie-authorised Server Actions (module 09). Tracked in `PROGRESS.md`.

**Known gap:** `script-src`/`style-src` still carry `'unsafe-inline'`, because Next's inline bootstrap is not yet nonce-plumbed. That is the remaining CSP hardening pass (§10.7); the nonce recipe is in Next's own CSP guide.
