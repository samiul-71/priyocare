# PRD — Module 05: Customer Tracking & Reports

| Field | Value |
|---|---|
| Module | Customer Tracking & Reports |
| Status | Draft |
| Created | 2026-07-16 |
| Related | [`design.md`](./design.md) · master PRD §5, §11, §10.5 |
| Stakeholders | PM, Eng, Compliance |

---

## 1. Executive summary

**What** — the post-booking customer views: **live tracking** of the collector/caregiver and the **sample/report status** stepper with a secure download. **Why** — the status timeline *is* the trust product; it's what tells a family "someone is on the way / it's done." **Who** — customers with an active or completed booking. **How** — a tracking screen with masked calling and ETA, and a status stepper that unlocks a **15-minute signed report link**. **Success** — never a fabricated status; report links never leak. **Effort** — M. **Risks** — masked-calling provider; never surfacing geofence outcomes to the customer (§9).

---

## 2. Purpose & user goal

A customer watches the visit happen and, when the lab is done, downloads the report securely and can forward it to their doctor — without ever seeing internal ops signals like geofence mismatches.

---

## 3. Scope

| | |
|---|---|
| **In scope** | `/bookings/[id]/track` (live map, ETA, arrival status, **masked call**), `/bookings/[id]/status` (sample/report stepper, **15-min signed download**, send-to-doctor) · colour-independent status rendering |
| **Out of scope** | Creating the booking (04) · caregiver-side check-in (07) · report **upload** (module 08 Ops) · office alerts (08) |
| **Assumptions** | modules 02–04 done · masked-calling + object storage configured · caregiver check-in events flowing (07) |

---

## 4. Sections & components

| # | Section | Route |
|---|---|---|
| 1 | Live tracking | `/bookings/[id]/track` |
| 2 | Sample/report status | `/bookings/[id]/status` |

---

## 5. Screens · Key actions · Key fields

| Screen | Route | Key actions | Key fields |
|---|---|---|---|
| Live tracking | `/bookings/[id]/track` | call collector (masked) | photo/rating, live map, ETA, arrival status |
| Sample/report status | `/bookings/[id]/status` | download report, send to doctor | status stepper, report link (15-min expiry) |

---

## 6. User flows

### Flow A — Track then download
```
[Open /bookings/:id/track] → {dispatched?} no→["Collector not yet dispatched"]
                                            yes→[live pin + ETA + arrival badge]
  → visit completes → [/bookings/:id/status stepper]
  → {report_ready?} no→[stepper, "Status update delayed" never fabricated]
                    yes→[unlock 15-min signed link] → [download / send to doctor]
```

---

## 7. Data models

Reads `bookings`, `samples` (status chain, `report_url`), caregiver location/check-in events. Writes nothing except an access log entry when a signed report URL is issued (actor + timestamp, §10.5). No new tables.

---

## 8. API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/v1/reports/{sample_id}` | signed URL | **15-min expiry**, private storage |
| `GET` | booking/sample status reads | customer token | never fabricates a status |

---

## 9. UI states (PRD §11)

| Section | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Live tracking | Pulsing placeholder + "Connecting…" | "Collector not yet dispatched" | "Location temporarily unavailable" — **last-known kept** | live pin, ETA, "Arrived" badge |
| Sample/report status | Skeleton stepper | N/A | "Status update delayed" — **never a fabricated status** | stepper; "Report ready" unlocks 15-min download |

---

## 10. Critical features — examples & scenarios

### Feature: Geofence invisibility (§9)
A >500m geofence mismatch **never reaches the customer** — it's an ops-only alert. Nothing on tracking or status hints at it.

### Feature: Signed report links (§10.5)
15-minute expiry, private storage, never a public path; each issue logged with actor + timestamp.

| # | Scenario | Expected |
|---|---|---|
| S-1 | Report link opened after 15 min | Expired, re-issue required |
| S-2 | Location feed drops | Show last-known + banner, never blank |
| S-3 | Report > 24h (§12.1) | Ops alerted to call family (handled in 08); customer sees honest "delayed" |

---

## 11. Edge cases

- Report link shared/forwarded → expires in 15 min regardless of who holds it.
- Colour-blind user → every stepper state has icon + label; passes greyscale.
- Booking cancelled → tracking shows cancelled state, no map.

---

## 12. Acceptance criteria with test cases

### AC-1 — Report link expiry
| TC | Given | When | Then |
|---|---|---|---|
| 1.1 | Signed link issued | 16 min later | Access denied |

### AC-2 — Geofence never visible to customer (PRD §13)
| TC | Given | When | Then |
|---|---|---|---|
| 2.1 | Check-in flagged | customer opens app | **No indication anywhere** |

### AC-3 — Status never fabricated
| TC | Given | When | Then |
|---|---|---|---|
| 3.1 | Status feed delayed | open status | "delayed" banner, no invented status |

### AC-4 — Colour independence
| TC | Given | When | Then |
|---|---|---|---|
| 4.1 | Stepper greyscale | rendered | Every state distinguishable |

---

## 13. Metrics

| Metric | Target |
|---|---|
| Fabricated status incidents | 0 |
| Report-link leak incidents | 0 |
| Tracking page LCP | < 2.5s |

---

## 14. Open questions

- [ ] Masked-calling provider.
- [ ] Live-location source cadence / cost.
- [ ] Medical-report retention legal sign-off (§10.7).

---

## 15. Out-of-scope / future

- Rating/complaint submission UI (feeds module 08).
- Push notifications for status changes.

---

## 16. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| PM | | | ☐ |
| Compliance | | | ☐ |
