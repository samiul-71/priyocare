# PRD — Module 06: Lead Capture & CRM (lead archetype)

| Field | Value |
|---|---|
| Module | Lead Capture & CRM |
| Status | Draft |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) · master PRD §3.2, §6 Flow C, §7.3, §9, §11 |
| Stakeholders | PM, Ops, Sales |

---

## 1. Executive summary

**What** — the `lead` archetype end to end: a public **enquiry form** and the Ops **lead Kanban** for Medical Tourism, Health Insurance (and later Mental Health). **Why** — these are **not bookings**; they run for weeks/months as a CRM pipeline, and forcing them into `bookings` produces a mess nobody untangles (§3.2). **Who** — customers submitting enquiries (mostly by phone → Ops), Ops owning and advancing leads. **How** — `POST /leads` creates a lead at stage `new` with an owner and follow-up date; Ops advances stages and logs activities; overdue follow-ups pin to the top. **Success** — a lead is never allowed to go silent; baseline lead-conversion measured. **Effort** — M. **Risks** — Mental Health leads carry crisis-protocol + data-isolation requirements (§10.6) and stay off-platform until Phase 3.

---

## 2. Purpose & user goal

Capture every enquiry (web or phone), never lose one to silence, and give Ops a Kanban that makes the next action obvious.

> **There is no slot, no dispatch, no caregiver, no check-in, and no SLA timer here. It is a CRM pipeline. Keep it that way.**

---

## 3. Scope

| | |
|---|---|
| **In scope** | `/enquiry/[service]` public form (name, phone, condition summary, document upload) → creates a `lead` · `/office/leads` Kanban (stages: new/contacted/qualified/proposal_sent/negotiating/won/lost/dormant) · move stage, log `lead_activity`, set `next_action_at`, overdue pinning, 30-day auto-`dormant` |
| **Out of scope** | Bookings/slots/dispatch (not applicable to leads) · Mental Health session handling (Phase 3, §10.6) · off-platform contract management after `won` |
| **Assumptions** | modules 02 (`leads`, `lead_activities`) + 03 (Ops auth) done · service archetype must be `lead` |

---

## 4. Sections & components

| # | Section | Route |
|---|---|---|
| 1 | Enquiry form | `/enquiry/[service]` |
| 2 | Lead Kanban | `/office/leads` |

---

## 5. Screens · Key actions · Key fields

| Screen | Route | Key actions | Key fields |
|---|---|---|---|
| Enquiry / callback | `/enquiry/[service]` | submit enquiry | name, phone, condition summary, document upload → creates a `lead` |
| Lead Kanban | `/office/leads` | move stage, log activity, set follow-up | new/contacted/qualified/proposal/won/lost; owner, next action, notes, overdue marker |

---

## 6. User flows

### Flow C — Lead capture (PRD §6 Flow C)
```
[Website enquiry form OR Ops takes a call] → [POST /api/v1/leads]
  → lead lands in /office/leads at stage 'new' + owner + next_action_at
  → Ops calls → logs lead_activity → stage advances
  → {won?} yes→[convert to manual booking OR off-platform contract]
           no →[lost + reason]  OR  [silent 30d → dormant, surfaced weekly]
```

---

## 7. Data models

Writes `leads` (+`lead_activities`), per module 02 §7.3. `service_id` must reference an archetype-`lead` service. `user_id` nullable (most arrive by phone). Index `(stage, next_action_at)` powers the overdue view.

---

## 8. API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/v1/leads` | public, rate-limited | tourism/insurance/mental-health enquiry |
| `PATCH` | `/api/v1/office/leads/{id}` | Ops | stage change **logs a `lead_activity`** |

---

## 9. UI states (PRD §11)

| Section | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Lead Kanban | Skeleton columns | "No leads in this stage" | Retry | Cards; **overdue follow-ups pinned to top** |
| Enquiry form | — | — | inline validation | "We'll call you" confirmation |

---

## 10. Critical features — examples & scenarios

### Feature: Lead follow-up never goes silent (§9)
**Example** — a lead with `next_action_at` in the past appears at the **top** of `/office/leads` with a visible overdue marker.

### Feature: 30-day dormancy (§12.1)
A lead quiet for 30 days auto-moves to `dormant` and is surfaced weekly for a re-touch.

| # | Scenario | Expected |
|---|---|---|
| S-1 | Enquiry for Medical Tourism | lead created; **no booking, no slot** |
| S-2 | `next_action_at` passes | pinned overdue |
| S-3 | Mental Health enquiry | captured as lead but service stays off-platform (Phase 3) |

---

## 11. Edge cases

- Enquiry against a non-`lead` service → rejected (wrong archetype).
- Duplicate phone enquiries → surfaced to owner, not auto-merged.
- `won` → hands off to manual booking (module 08) or off-platform; lead marked converted.
- Document upload with sensitive medical reports → private storage, signed access.

---

## 12. Acceptance criteria with test cases

### AC-1 — Overdue leads surface (PRD §13)
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | `next_action_at` in the past | Ops opens `/office/leads` | Lead **pinned to top**, marked overdue |

### AC-2 — Leads are not bookings
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | Lead created | inspect data | No slot/dispatch/caregiver/SLA attached |

### AC-3 — Stage change logs activity
| TC | Given | When | Then |
|---|---|---|---|
| 3.1 | Ops advances stage | `PATCH /office/leads/{id}` | `lead_activity` recorded |

---

## 13. Metrics

| Metric | Target |
|---|---|
| Lead conversion (`won`/total) | baseline at launch |
| Leads going silent | 0 (overdue always surfaced) |

---

## 14. Open questions

- [ ] Mental-health crisis protocol + note encryption before any session (§10.6).
- [ ] Document-storage retention for lead attachments.

---

## 15. Out-of-scope / future

- Mental Health session archetype (Phase 3).
- Automated lead scoring.

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| PM | | | ☐ |
| Ops | | | ☐ |
