# PriyoCare — Design System

| Field | Value |
|---|---|
| Status | Draft for build |
| Created | 2026-07-16 |
| Source of truth | Derived from `docs/priyo-care-logo.jpeg` and PRD §17–§18 (`docs/priyocare-prd.md`) |
| Applies to | Every surface — Customer website, Caregiver PWA, Office/Admin panel |
| Related | [`01-design-system-and-foundation-prd.md`](./01-design-system-and-foundation-prd.md) — the module that implements this document |

> This is the **single source of truth** for colour, type, spacing, and accessibility. Tailwind theme, `globals.css`, and every component must trace back to a token here. If a value is not in this file, it does not ship.

---

## 1. The logo, read literally

The wordmark is **`Priyo♥Care`** set horizontally:

- **`Priyo`** in solid **navy** (`#012967`).
- A **heart mark** in the centre — two overlapping strokes, **navy resolving into teal**, forming a single heart. It reads as two hands / two people meeting.
- **`Care`** in **teal** (`#0D9B9A`).
- Set on a **pure white** field, generous whitespace around it.

**What the logo already says, and the product must not drift from:** *"Someone is there when you can't be."* Navy is the trusted institution; teal is the warmth of the person who shows up. The heart is the handover between them. Every screen is either the institution (navy, structural) or the person (teal, human). Keep that division honest.

Sampled pixel share (PRD §17.1): Navy **37.5%**, Teal **41.2%** — the two are co-equal, teal very slightly dominant. **Do not** let one crowd the other into an accent role.

### 1.1 Logo usage

| Do | Don't |
|---|---|
| Use the horizontal lockup with clear space ≥ the height of the `P` on all sides | Squeeze the horizontal wordmark into a square app-icon slot — it letterboxes to an illegible sliver |
| Use the **isolated heart mark** for app icons / favicon | Recolour the heart, add a gradient the logo doesn't have, or add a drop shadow |
| Place on white or `--navy-50` (`#F4F7FA`) | Place teal-heavy logo on a mid-tone or busy photo |
| Request assets as **SVG** (see §9) | Rasterise and scale a JPEG |

> **Blocked asset (PRD §17.5, §19):** the isolated heart mark as SVG does not exist yet. App icons, favicon, and the two PWA icon sets cannot be finalised until it arrives. Until then, ship a **temporary heart glyph** built in code (see the foundation module) and swap it when the SVG lands.

---

## 2. Colour

### 2.1 The problem this system exists to fix

The brand teal `#0D9B9A` is **3.49:1 on white — it fails WCAG AA (4.5:1) for text.** The printed leaflet already ships teal-on-white body text. On glossy paper that's fine; **on a phone, in Dhaka sunlight, read by a 68-year-old, it is not.** The logo teal stays. **The text teal is a different, darker token.** We never change the logo — we split the teal.

> **Navy carries the weight. Teal carries the warmth. Teal never carries the text.**

### 2.2 Tokens (the complete, closed set)

```css
:root {
  /* Navy — structure, primary text, primary actions */
  --navy:      #012967;  /* 13.75:1 on white ✅ AAA */
  --navy-800:  #012F76;
  --navy-100:  #E6EBF2;
  --navy-50:   #F4F7FA;

  /* Teal — split into a decorative brand value and text-safe darks */
  --teal-brand: #0D9B9A; /* ⚠️ DECORATIVE ONLY — 3.49:1. Logo, gradients, fills, headings ≥24px bold */
  --teal-700:   #0B8383; /* 4.58:1 ✅ — links, secondary text, icons */
  --teal-800:   #0A7B7A; /* 5.09:1 on white ✅ — button fills (white text) */
  --teal-900:   #086362; /* 7.07:1 ✅ AAA — high-emphasis text, focus rings */
  --teal-50:    #EAF7F7;

  /* Semantic status — each ≥4.5:1 on white, and each paired with an icon (never colour alone) */
  --success: #15803D;
  --warning: #B45309;
  --danger:  #B91C1C;

  /* Neutrals */
  --text:       #1A202C;
  --text-muted: #4A5568;  /* the LIGHTEST grey permitted for text */
  --border:     #E2E8F0;
  --surface:      #FFFFFF;
  --surface-alt:  #F7FAFC;
}
```

**Deliberately absent: any `teal-500` or bare `teal`.** If the token can't be typed, nobody ships `text-teal-500` and a silent contrast failure. Same philosophy as `import "server-only"` — *make the wrong thing impossible to write.*

### 2.3 Contrast reference (memorise the failures)

| Combination | Ratio | Verdict |
|---|---|---|
| Navy on white | 13.75:1 | ✅ AAA |
| `teal-700` on white | 4.58:1 | ✅ AA text |
| `teal-800` fill + white text | 5.09:1 | ✅ AA |
| `teal-900` on white | 7.07:1 | ✅ AAA |
| **`teal-brand` on white** | **3.49:1** | ❌ **text FAIL** — decorative/≥24px-bold only |
| **White on `teal-brand` button** | **3.40:1** | ❌ **FAIL** — use `teal-800` for filled buttons |
| `text-muted` on white | 7.5:1 | ✅ — do not go lighter |

### 2.4 Usage map

| Role | Token |
|---|---|
| Primary text | `--text` (or `--navy` for headings) |
| Secondary / helper text | `--text-muted` |
| Links (on white) | `--teal-700` (underlined; never colour-only) |
| Links (on tinted bg: `surface-alt`/`teal-50`/`navy-50`) | `--teal-900` — `teal-700` is only 4.58:1 on **pure white** and drops to ~4.36:1 on `surface-alt`, failing AA. Use `teal-900` on any tinted surface. |
| Primary button (fill / text) | `--navy` / white |
| Secondary button (fill / text) | `--teal-800` / white |
| Ghost / tertiary button | transparent / `--navy`, `--border` outline |
| Icons | `--teal-700` or `--navy` |
| Focus ring | `--teal-900`, 2px |
| Decorative fills, gradients, hero heart | `--teal-brand` (never behind text) |
| Success / warning / danger | semantic tokens **+ an icon and a label** |

---

## 3. Typography

The leaflet used **eight** fonts. That's not a system; it's whatever was installed that day, and it's megabytes on 3G. **Three fonts, self-hosted, no exceptions.**

| Role | Family | Weights | Notes |
|---|---|---|---|
| **Bangla — everything** | **Hind Siliguri** | 400 / 500 / 600 / 700 | Default language of the product |
| Latin display / headings | **Poppins** | 600 / 700 | Matches the wordmark geometry; **headings only** |
| Latin body / UI / numerals | **Inter** | 400 / 500 / 600 | **Tabular figures** for prices & booking codes |

**Rules**
- **Self-host.** Never call Google Fonts from Dhaka on 3G — it adds a DNS + TLS round trip to a cold render. Use `next/font/local`.
- **Bangla renders +1px over Latin.** Body is 16px Latin → **17px Bangla**; conjuncts are denser and fail earlier at small sizes.
- Prices, booking codes (`PC-260715-0042`), and any tabular number use Inter with `font-variant-numeric: tabular-nums`.
- Never letter-space Bangla.

### 3.1 Type scale

| Token | Size / line-height | Font | Use |
|---|---|---|---|
| `display` | 32 / 40 | Poppins 700 | Landing hero |
| `h1` | 28 / 36 | Poppins 700 | Page title |
| `h2` | 22 / 30 | Poppins 600 | Section |
| `h3` | 18 / 26 | Inter 600 / Hind 600 | Sub-section |
| `body` | 16 / 24 (bn 17 / 26) | Inter 400 / Hind 400 | Default |
| `body-lg` | 18 / 28 | Inter / Hind | **Caregiver default** |
| `label` | 14 / 20 | Inter 500 | Form labels, chips |
| `caption` | 13 / 18 | Inter 400 | Timestamps, meta |

---

## 4. Spacing, radius, elevation

- **Spacing scale (4px base):** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Nothing off-grid.
- **Radius:** `sm` 6px (chips, inputs) · `md` 10px (cards, buttons) · `lg` 16px (sheets, modals) · `full` (avatars, pills).
- **Elevation:** flat by default. `shadow-card` = `0 1px 2px rgba(1,41,103,.06), 0 2px 8px rgba(1,41,103,.08)`. Modals one step deeper. No neumorphism, no glow. **No dark mode** (out of scope, PRD §3.4).

---

## 5. Components — the baseline contract

Every interactive component must satisfy **all** of these or it does not merge:

- **Tap target:** ≥ 44px (customer) · **≥ 56px (caregiver)** · 32px (office, mouse).
- **Focus:** visible 2px `teal-900` ring on `:focus-visible`. Never remove outlines. Never `user-scalable=no` / `maximum-scale=1`.
- **Label:** every input has an associated `<label htmlFor>`; errors linked via `aria-describedby`, required via `aria-required`.
- **State, never colour-only:** status is conveyed by **icon + text label** as well as colour (PRD §11 — ~8% of Bangladeshi men are colour-blind, and the status timeline *is* the trust product).
- **Motion:** none beyond opacity/transform fades ≤150ms; respect `prefers-reduced-motion`. No animation system (out of scope).

### 5.1 Buttons

| Variant | Fill | Text | Use |
|---|---|---|---|
| Primary | `--navy` | white | The one main action per screen |
| Secondary | `--teal-800` | white | Supporting positive action |
| Ghost | transparent, `--border` outline | `--navy` | Cancel / back |
| Danger | `--danger` | white | Destructive, with confirm |

### 5.2 Status token → icon + label (the colour-independence table)

| Status | Colour | Icon | Label |
|---|---|---|---|
| Confirmed / booked | navy | ✓ circle | "Confirmed" |
| Dispatched / en route | `teal-700` | → arrow | "On the way" |
| Arrived | `teal-900` | ⌖ pin | "Arrived" |
| In progress | `teal-800` | ● pulse | "In progress" |
| Completed | `success` | ✓✓ | "Completed" |
| Cancelled | `text-muted` | ✕ | "Cancelled" |
| Overdue (lead / SLA) | `danger` | ! triangle | "Overdue" |

Every status timeline / stepper renders **legibly in greyscale** — verified in CI by a greyscale snapshot (PRD §13 AC-7.3).

---

## 6. Three audiences, one origin

The same codebase serves three people who need opposite things. **The Caregiver PWA is not a smaller customer site.**

| | Customer | Caregiver | Office |
|---|---|---|---|
| Feeling | Warm, calm, trustworthy | Fast, obvious, unmissable | Dense, neutral, invisible |
| Chrome | White, navy text, teal accents | **`teal-800` header, white heart icon** | Navy sidebar, white content |
| Body size | 16 / bn 17 | **18 minimum** | 14 (dense tables fine) |
| Tap target | 44px | **56px** | 32px (mouse) |
| Density | Generous whitespace | **One decision per screen** | Maximum |
| Sunlight mode | — | Navy on white; **no grey below `#4A5568`; no teal text** | — |

> The caregiver is a tired woman on a cheap phone in bad light who must press one large obvious button and not make a mistake. She doesn't need brand warmth. She needs to not get it wrong.

---

## 7. Accessibility — the blocking bar

Treated exactly like a type error: **a contrast regression fails the build.**

| Requirement | Spec |
|---|---|
| Text contrast | ≥ 4.5:1 body · ≥ 3:1 for ≥24px bold |
| Body size | 16px customer · 18px caregiver · Bangla **+1px** |
| Tap target | ≥ 44px customer · ≥ 56px caregiver |
| Never colour-alone | every status has an icon **or** text label |
| Focus visible | 2px `teal-900` ring on every interactive element |
| Zoom | survives 200% — no horizontal scroll, nothing clipped; **never** block zoom |
| Headings | one `h1`, then nested `h2/h3` in order |
| Language | `lang` set correctly; Bangla content in `lang="bn"` regions |

**CI gate — `@axe-core/playwright` on 8 critical routes**, build fails on ANY serious/critical violation, no warnings-only mode:

```
/  ·  /book/[service]/select  ·  /book/address  ·  /book/slot  ·  /book/checkout
/bookings/[id]/track  ·  /caregiver/today  ·  /caregiver/today/care-log
```

Target: **Lighthouse Accessibility ≥ 95** on those routes.

---

## 8. Content & Bangla (from PRD §18)

- **Bangla is the default; English is the toggle.** Locale in the URL (`/bn/…`, `/en/…`), `next-intl`.
- **Bangla must be Unicode (UTF-8).** Bijoy/ANSI (e.g. `LiShadhinata`) is **not text** on the web — unsearchable, unindexable, invisible to screen readers and Google, breaks without the font. Reject any `*_bn` field with a high concentration of Latin characters, at the Zod layer **and** as a DB check.
- **No hardcoded user-facing strings** in components — CI fails the build otherwise.
- Numerals: use Western digits for prices/codes by default (tabular); Bangla digits only where content explicitly calls for it.

---

## 9. Assets to request (blocking — PRD §17.5, §19)

- [ ] SVG lockup — horizontal **and** stacked
- [ ] **Isolated heart mark (SVG)** — blocks all app icons
- [ ] Reversed / white version · single-colour navy version
- [ ] Icon PNGs @ 192 / 256 / 384 / 512 + **512 maskable**
- [ ] Two visually distinct app icons: **Customer** = white bg, full-colour heart · **Caregiver** = teal bg, white heart (must differ at arm's length, at 6 AM)
- [ ] favicon + apple-touch-icon
- [ ] OG image 1200×630

Until these land, the foundation module ships a **code-drawn heart** placeholder and a note in Open Questions.

---

## 10. Design tokens → code

These tokens map to the Tailwind v4 `@theme` block and `globals.css` in the foundation module. The canonical CSS variable names in §2.2 and the type scale in §3.1 are the contract; Tailwind utility names derive from them (`bg-navy`, `text-teal-700`, `ring-teal-900`, `font-bn`, `font-display`). No component may introduce a raw hex value outside this file.
