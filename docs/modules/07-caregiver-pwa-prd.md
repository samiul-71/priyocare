# PRD — Module 07: Caregiver PWA (offline field work)

| Field | Value |
|---|---|
| Module | Caregiver PWA |
| Status | Draft |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) §6 · master PRD §5 (Caregiver), §6 Flow B, §9, §11, §4.3 |
| Stakeholders | PM, Eng, Ops |

---

## 1. Executive summary

**What** — the installable, **offline-first** field app the caregiver/collector uses on the job: check-in/out, task ticklist, sample scan, daily care log, and a persistent sync-status indicator. **Why** — this runs on a cheap Android in bad signal; every write must survive zero network and sync later without duplication or timestamp corruption. **Who** — approved caregivers on shift. **How** — writes go to **IndexedDB regardless of auth state**, GPS+timestamp captured **locally before any network call**, and a batched idempotent sync (`event_uuid`) replays with the **original `occurred_at`**. **Success** — 100% sync reliability, 0 duplicate writes, check-in success ≥99% including offline. **Effort** — L (offline correctness is the hard part). **Risks** — iOS multi-PWA scoping (§4.3); geofence must be **advisory only and never visible to the caregiver**.

---

## 2. Purpose & user goal

> The caregiver is a tired woman on a cheap phone in bad light. One large obvious button per screen. She needs to not make a mistake — and to never be blocked by a login wall or a dead signal.

She checks in, does the tasks, logs the care, checks out — and everything reaches the office eventually, exactly once, with the times she actually did them.

---

## 3. Scope

| | |
|---|---|
| **In scope** | `/caregiver/login` (phone+PIN) · `/caregiver/today` (check-in/out) · `/caregiver/today/tasks` · `/caregiver/today/scan` (barcode) · `/caregiver/today/care-log` · persistent sync-status chrome · service worker (real offline-write queue) · IndexedDB event queue · `event_uuid` idempotent batched sync · 56px tap targets, 18px base, sunlight mode |
| **Out of scope** | Onboarding/verification (module 08) · dispatch/assignment (08) · customer tracking (05) · geofence *decisioning* beyond advisory capture |
| **Assumptions** | modules 02, 03 done · caregiver already approved with a PIN · manifest scope `/caregiver/`, own service worker (module 01 shell) |

---

## 4. Sections & components

| # | Section | Route |
|---|---|---|
| 1 | Login | `/caregiver/login` |
| 2 | Today / check-in-out | `/caregiver/today` |
| 3 | Task ticklist | `/caregiver/today/tasks` |
| 4 | Sample scan | `/caregiver/today/scan` |
| 5 | Daily care log | `/caregiver/today/care-log` |
| 6 | Sync status | persistent shell chrome |

---

## 5. Screens · Key actions · Key fields

Mirror of master PRD §5 (Caregiver). Key fields: phone + **PIN** (OTP fallback); address+landmark, patient name, GPS state, timestamps; service-dependent checklist; camera + barcode value; notes, photo, vitals, mood; queued-event count + last-sync time.

---

## 6. User flows

### Flow B — Check-in with geofence verification (PRD §6 Flow B)
```
[Tap "Check in"] → [Capture GPS + timestamp locally, before any network call]
  → {online?} no→[Queue in IndexedDB w/ local occurred_at] ─────┐
              yes→[POST /check-in, geofence advisory, always success]│
                          ▼                                          │
              [UI shows success — identical either way]◄─────────────┘
                          ▼
              [Job → in_progress; family notified if online]
   (if queued) ▼
   [Signal returns] → [Silent token refresh] → [Sync with ORIGINAL occurred_at]
```
A >500m mismatch silently creates an `ops_alerts` record visible only in `/office/alerts` — **never signalled to the caregiver.**

---

## 7. Data models

Writes `sync_events` (`event_uuid` unique), `care_logs` (`logged_at` device time authoritative), check-in/out events; updates `bookings.status`. Reads assigned job. IndexedDB mirrors the queue client-side. Per module 02 §7.

---

## 8. API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/v1/caregiver/check-in` | caregiver | **geofence advisory — never blocks** |
| `POST` | `/api/v1/caregiver/check-out` | caregiver | — |
| `PATCH` | `/api/v1/bookings/{id}/tasks` | caregiver | task tick |
| `POST` | `/api/v1/caregiver/sync` | caregiver | **batched offline events, idempotent by `event_uuid`** |
| `POST` | `/api/v1/bookings/{id}/care-log` | caregiver | end of shift |
| `POST` | `/api/v1/samples/{barcode}/scan` | caregiver/lab | advances chain-of-custody |

---

## 9. UI states (PRD §11)

| Section | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Today's Job | Skeleton card | "No job assigned yet today" | "Couldn't load — showing last cached version" (**never blank**) | job card: address, landmark, patient |
| Sync status | N/A | "All synced" | "X events queued — will sync when connected" (**informational, never blocking**) | "Synced just now" |

---

## 10. Critical features — examples & scenarios

### Feature: Offline-sync idempotency (§9)
Every event carries a client `event_uuid`. Sync upserts `ON CONFLICT (event_uuid) DO UPDATE` **excluding `occurred_at`**, so a retried sync never overwrites the device-captured time.

### Feature: Geofence advisory, invisible to caregiver
Server computes distance, **always returns success**, no outcome signalled. Mismatch → `/office/alerts` only, framed neutrally, never an accusation.

| # | Scenario | Expected |
|---|---|---|
| S-1 | GPS 2km away | identical success, **no warning** |
| S-2 | Entire shift offline | all events sync in one batch with original timestamps |
| S-3 | Sync batch sent twice | no duplicate rows (`event_uuid`) |
| S-4 | Access token expired, offline | events queue, no login prompt |
| S-5 | Never opened before, offline | can't load (expected — first load needs connectivity) |

---

## 11. Edge cases

- Caregiver calls in sick (§12.1) → job returns to assignment queue (module 08 consumes).
- Never checks in / never calls → flagged to Ops (`ops_alerts`).
- Camera unavailable → manual barcode entry fallback.
- Two devices → same `event_uuid` dedupe still holds.
- Sunlight mode: navy on white, no grey below `#4A5568`, **no teal text**.

---

## 12. Acceptance criteria with test cases

### AC-1 — Check-in succeeds regardless of geofence; zero caregiver-visible signal (PRD §13)
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | GPS 2km from address | tap check in | identical success, no warning |
| 1.2 | GPS within radius | tap check in | same success, visually indistinguishable |

### AC-2 — Offline writes preserve timestamps
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | entire shift offline | signal returns | batch syncs with original local timestamps |
| 2.2 | batch submitted twice | duplicate received | no duplicate rows |

### AC-3 — PWA offline after first load
| TC | Given | When | Then |
|---|---|---|---|
| 3.1 | opened once online | goes offline | shell, job, ticklist usable from cache |
| 3.2 | never opened | offline | cannot load (expected) |

### AC-4 — Expired token never blocks
| TC | Given | When | Then |
|---|---|---|---|
| 4.1 | access expired, offline | tick/checkout | queue, no login prompt |
| 4.3 | refresh also expired | sync | login appears; queued events intact |

---

## 13. Metrics

| Metric | Target |
|---|---|
| Check-in success (incl. offline-queued) | ≥ 99% |
| Sync reliability (eventually synced/created) | 100% |
| Offline-sync duplicate writes | 0 |
| Time-to-sync after reconnect (median) | < 30s |

---

## 14. Open questions

- [ ] Field-verify iOS/Android PWA scoping on target budget devices (§4.3).
- [ ] Barcode library choice / camera permissions UX. **As built: manual entry only** — §11 requires the fallback regardless, and shipping it first means every device works today; the camera becomes an accelerator, not a dependency.
- [x] ~~Caregiver onboarding is missing and blocks real use.~~ **Built** — intake → checklist → payout → activate → PIN issuance, gated by `evaluateActivation` re-read from the database. See PROGRESS.md.
- [ ] **Change PIN on first login.** The initial PIN is admin-issued (the OTP self-set flow needs the SMS provider, §19), so Ops knows it until she changes it — and today she cannot.
- [ ] **Two-device conflict beyond dedupe (§11).** `event_uuid` makes replay safe, but two devices ticking *different* task sets both "win" in turn — last write to `care_logs` stands. Real conflict resolution needs a rule from Ops (is that even a scenario worth solving?).

---

## 15. Out-of-scope / future

- Placement shift roster / continuity UI depth.
- Push notifications for new assignments.

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| PM | | | ☐ |
| Eng | | | ☐ |
