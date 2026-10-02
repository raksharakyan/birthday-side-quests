# Birthday Side Quests: Soft Premium design spec

> **Historical prototype spec.** The live design system is [/DESIGN.md](../../DESIGN.md) (plum accent, as shipped). This file records the original prototype and the accent options that were explored.

**Design read:** a privacy-first consumer utility for young women planning their birthday month, in a soft-premium language (Glossier and Apple calm, warm porcelain, one rich accent), built with native CSS, inline SVG and WAAPI, no new runtime deps.

Dials (taste-skill vocabulary): variance 6, motion 5, density 4. It is a tool you scan on a phone, so layout stays calm and legible. The celebration lives in small, earned moments, not in decoration.

Prototype: `docs/design/prototype.html` (+ `prototype.css`, `prototype.js`, `fonts/`). Query params: `?accent=plum`, `?accent=terracotta`, `?state=done` (freezes the celebration), `?static` (skips entry animation).

---

## 1. Principles

1. **One accent, used with intent.** The accent shows up only where it means something: the primary action, the active pin, the "You get" panel, the progress ring, the lit candle. Everything else is warm neutral.
2. **The offer is the hero of the card.** "You get" is the biggest thing after the brand name. Conditions are chips, how-to is a numbered list, actions sit on one line at the bottom.
3. **Celebrate completion, not arrival.** No sparkles on load. The candle lights, the ring fills and 12 paper strips fan out only when someone marks a quest claimed.
4. **Quiet surfaces, diffuse depth.** White cards on porcelain, tinted shadows from one light source above, no hard borders except where WCAG 1.4.11 needs a control edge.
5. **Plain, specific copy.** Sentence case, no exclamation marks, no emoji, no em dashes. Say what to do: "Show the QR before you pay."
6. **Accessible by construction.** AA text everywhere, 3:1 control edges, 44px minimum targets, visible focus ring, reduced motion turns every flourish into an instant state change.

## 2. Color tokens (light)

Neutrals are one warm-rose grey family. The porcelain background was chosen to stay out of the "cream + brass + espresso" default family the taste-skill flags.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FAF7F5` | Page (porcelain) |
| `--surface` | `#FFFFFF` | Cards, search panel, popups |
| `--sunken` | `#F3EEEB` | Tab track, segmented control, mono tiles, notices |
| `--line` | `#ECE5E2` | Hairline dividers (decorative) |
| `--line-strong` | `#DDD3CF` | Step rings, step connectors (decorative) |
| `--line-control` | `#958A8F` | Input, checkbox, ghost button edges (3:1) |
| `--ink` | `#221B1F` | Primary text (plum-tinted near black, never #000) |
| `--ink-2` | `#5E5459` | Secondary text, labels |
| `--ink-3` | `#71666B` | Meta, captions, fine print, map labels |
| `--accent` | `#A3224F` | Deep raspberry (default) |
| `--accent-hover` | `#8E1C44` | Pressed/hover primary |
| `--accent-ink` | `#8A1C43` | Accent text on tint |
| `--accent-tint` | `#F8E8EE` | "You get" panel, birthday flag, claimed card wash |
| `--accent-tint-2` | `#F2D6E0` | Active card inner ring, confetti strip, empty-state flame |
| `--ok` / `--ok-tint` | `#2E6A4C` / `#E8F1EB` | Verified badge only |
| `--warn` / `--warn-tint` | `#82560F` / `#FBF0DA` | Check with store badge, field errors |
| `--map-land` | `#F1ECE9` | Map base tint |
| `--map-park` | `#E5E8DE` | Parks |
| `--map-water` | `#DEE4E7` | Water |

### Accent options (pick one, it replaces the 5 accent tokens)

| Option | `--accent` | `--accent-hover` | `--accent-ink` | `--accent-tint` | `--accent-tint-2` | Mood |
|---|---|---|---|---|---|---|
| **Deep raspberry** (recommended) | `#A3224F` | `#8E1C44` | `#8A1C43` | `#F8E8EE` | `#F2D6E0` | Most "birthday", lipstick-adjacent, still grown-up |
| Plum | `#6B2D5E` | `#5A2450` | `#5A2450` | `#F2E7F0` | `#E6D2E2` | Evening, moodier, most luxe |
| Terracotta | `#A9442A` | `#933A23` | `#8C3620` | `#F8E9E3` | `#F0D5CA` | Warm, sun-baked, least "pink" |

### Contrast (computed, WCAG 2.x)

| Pair | Ratio | Needs | Pass |
|---|---|---|---|
| ink on bg | 15.82 | 4.5 | AA/AAA |
| ink on surface | 16.87 | 4.5 | AAA |
| ink-2 on bg | 6.82 | 4.5 | AA |
| ink-2 on sunken | 6.32 | 4.5 | AA |
| ink-3 on bg | 5.16 | 4.5 | AA |
| ink-3 on surface | 5.50 | 4.5 | AA |
| ink-3 on sunken | 4.78 | 4.5 | AA |
| ink-3 on map-land (map labels) | 4.70 | 4.5 | AA |
| white on raspberry (buttons, count chip) | 7.24 | 4.5 | AAA |
| white on raspberry hover | 8.75 | 4.5 | AAA |
| raspberry on surface (links) | 7.24 | 4.5 | AAA |
| accent-ink on accent-tint | 7.63 | 4.5 | AAA |
| ink on accent-tint ("You get" value) | 14.28 | 4.5 | AAA |
| white on plum | 9.71 | 4.5 | AAA |
| plum ink on plum tint | 9.69 | 4.5 | AAA |
| white on terracotta | 5.92 | 4.5 | AA |
| terracotta ink on terracotta tint | 6.67 | 4.5 | AA |
| ok on ok-tint (Verified) | 5.55 | 4.5 | AA |
| warn on warn-tint (Check with store) | 5.65 | 4.5 | AA |
| warn on surface (field error) | 6.39 | 4.5 | AA |
| ink-2 on sunken (May be outdated) | 6.32 | 4.5 | AA |
| bg on ink (toast) | 15.82 | 4.5 | AAA |
| line-control on surface (input edge) | 3.33 | 3.0 | 1.4.11 |
| line-control on bg (input edge) | 3.12 | 3.0 | 1.4.11 |
| accent focus ring on bg | 6.79 | 3.0 | 1.4.11 |

Known soft spot: the selected segment in Radius and Tabs is shown by a white thumb on `--sunken` (low contrast on its own). It is backed by a text color change (ink-2 to ink), the accent count chip on tabs, and `aria-selected` / `checked`. If an audit flags it, add `inset 0 0 0 1px var(--line-control)` to the selected thumb.

### Dark (optional, tokens only, not in prototype)

| Token | Hex | Check |
|---|---|---|
| `--bg` | `#171214` | |
| `--surface` | `#211A1D` | |
| `--sunken` | `#2A2226` | |
| `--ink` | `#F3ECEE` | 15.92 on bg |
| `--ink-2` | `#B9AEB2` | 8.61 on bg |
| `--ink-3` | `#9C9196` | 5.61 on surface |
| `--accent` | `#E2849F` | 7.09 on bg; use `#171214` text on it (7.09) |
| `--accent-tint` | `#3A2129` | |
| Map | Invert tiles to a warm charcoal with the same CSS filter recipe, `brightness(.8)` | |

## 3. Typography

Both fonts are on npm via Fontsource (checked with `npm view`, both `5.3.0`):

- **Display:** `@fontsource-variable/bricolage-grotesque` (Bricolage Grotesque, variable weight 200-800, width 75-100, optical size). A sans display with a little ink-trap character, so it feels designed and a bit festive without going serif. Fraunces and Instrument Serif were avoided on purpose: the taste-skill calls them the two LLM-default display serifs.
- **Body/UI:** `@fontsource-variable/plus-jakarta-sans` (variable 200-800). Rounded, open, very legible at 13-16px, slightly warmer than Inter.
- Import only `latin` and `latin-ext` subsets (latin-ext carries the ₹ sign). In the app: `import '@fontsource-variable/bricolage-grotesque/standard.css'` (or `wght.css` plus `opsz` if size matters) and `import '@fontsource-variable/plus-jakarta-sans'`. Remove `@fontsource/fredoka` and `@fontsource/nunito`.
- Fallback stack: `"Avenir Next", system-ui, sans-serif`.

| Role | Font | Size / line | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Page title | Bricolage | clamp(30px, 6vw, 44px) / 1.04 | 600 | -0.035em | `opsz 96`, `text-wrap: balance` |
| Section title | Bricolage | 28px / 1.15 | 600 | -0.03em | |
| Card brand | Bricolage | 21px / 1.2 | 600 | -0.02em | |
| "You get" value | Bricolage | 19px / 1.3 | 500 | -0.015em | |
| Wordmark | Bricolage | 19px | 600 | -0.02em | |
| Body, steps | Jakarta | 15-16px / 1.5 | 400 | 0 | max 62ch |
| Button | Jakarta | 14-15px | 600 | 0.005em | one line, never wraps |
| Label | Jakarta | 13px | 600 | 0.005em | above input, never placeholder-as-label |
| Meta, chips | Jakarta | 13-13.5px | 500 | 0 | `tabular-nums` for km, counts |
| Fine print | Jakarta | 12.5px | 400 | 0 | ink-3 |
| Map labels | Jakarta | 11px caps | 600 | 0.14em | only place caps are used |

## 4. Spacing, radius, shadow, motion

**Spacing (4px base):** 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 64, 72. Page gutter 16 (mobile), 32 (tablet), 40 (desktop). Card padding 20 mobile, 24/28 desktop. Gap between cards 16. Results section starts 32-40 below the search panel.

**Radius rule (documented so it stays consistent):** interactive controls are full pills (`999px`), cards and the map are `24px`, inner blocks (inputs, "You get" panel, notices) are `14px`, mono tiles `16px`, small focus outlines `10px`.

**Shadows (tinted plum-brown, one light source above):**

```
--shadow-1: 0 1px 2px rgb(60 30 40 / .04), 0 2px 8px rgb(60 30 40 / .04);            /* resting card */
--shadow-2: 0 1px 2px rgb(60 30 40 / .04), 0 8px 24px -6px rgb(60 30 40 / .08),
            0 24px 48px -16px rgb(60 30 40 / .08);                                      /* search panel, map, hovered card */
--shadow-3: 0 2px 4px rgb(60 30 40 / .05), 0 18px 40px -10px rgb(60 30 40 / .14);     /* popups, autocomplete, toast */
--shadow-accent: 0 1px 1px rgb(accent / .20), 0 6px 16px -4px rgb(accent / .35);        /* primary button only */
```

**Motion tokens:**

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default for enters, color, shadow |
| `--ease-spring` | `cubic-bezier(0.32, 0.72, 0, 1)` | Tab thumb, pins, button orb, toast |
| `--ease-inout` | `cubic-bezier(0.65, 0, 0.35, 1)` | Looping flicker, skeleton shimmer |
| `--t-fast` | 140ms | Press scale, hover color |
| `--t-base` | 240ms | Field focus, chips, counts |
| `--t-slow` | 420ms | Tab thumb, pin scale, check draw |
| `--t-enter` | 640ms | Card entry, candle glow |
| ring fill | 900ms ease-out | Progress ring |
| confetti | 1300-1570ms, linear timeline with per-keyframe easing | Celebration |

Never `linear` or default `ease` on UI transitions. Only `transform` and `opacity` animate (plus `stroke-dashoffset` on small SVGs).

## 5. Components

**Top bar.** 72px tall, not sticky. Mark tile (40px white rounded square, hairline, shadow-1) + wordmark. Text links "How it works", "Privacy" on desktop (44px targets).

**Logo mark.** Line-art candle on a plate: 1.6 stroke in ink, two diagonal stripes in accent, flame as a dashed outline when nothing is claimed. Once at least one quest is claimed the flame fills with the accent, gets a soft accent glow and a slow 3.2s flicker. This is the brand's "birthday" signal, replacing the emoji cake.

**Search panel.** White card, shadow-2, 24px radius. Fields: City or area (pin icon, combobox), Birthday month (calendar icon, native select with chevron), Radius (segmented pill: 2 / 5 / 10 km), primary "Find my quests" (pill with nested icon orb), quiet "Clear search". Desktop: one row (1.5fr / 1fr / 1fr / actions), labels aligned. Mobile: stacked, primary button full width. Inputs 52px tall, porcelain fill, `--line-control` edge; focus turns the edge accent with a 4px accent halo at 12%.

**Privacy line.** Inside the search panel under a hairline, lock icon in accent, 13.5px ink-2: "We don't store anything on our servers. Your search stays in this browser tab and clears when you close it."

**Autocomplete.** Floating list 8px under the field, 18px radius, shadow-3 + hairline. Options 52px tall: pin icon, matched prefix bold, secondary line with region in ink-3. Active option on `--sunken` with the pin turning accent. Footer "Place search by OpenStreetMap" in 11.5px. Clear (x) button inside the field. ARIA: `role=combobox`, `aria-expanded`, `aria-activedescendant`, `role=listbox/option`. Opens with a 180ms fade + 4px drop (`--ease-out`).

**Results header.** Birthday flag pill ("It's your birthday month", sparkle glyph, accent tint) only when the month matches. Title "Your October quests". Subline with totals. Progress ring on the right: 52px, 3px stroke, track `--line`, fill accent, "3 of 18 / claimed" with tabular figures.

**Tabs.** Segmented track on `--sunken` with a white sliding thumb (shadow-1). Each tab: label + count chip; the selected count chip goes accent with white text. Arrow keys move selection. Mobile: 13.5px labels, never wrap.

**Quest card.**
- Header: mono tile (48px, brand initials in Bricolage), brand name, meta line "address, distance" (one dot separator), status badge at right (desktop) or below (mobile).
- Badges: Verified (check icon, ok tint), Check with store (alert icon, warn tint), May be outdated (clock icon, sunken), Claimed (accent tint).
- "You get" panel: accent tint, 14px radius, small label in accent-ink, value in Bricolage 19px.
- Condition chips (hairline pills, 15px icon): No purchase needed (gift, accent icon), Purchase needed, min ₹1,500 (bag), Join 7+ days before (clock), Valid: birthday only / week / month (calendar), Bring: App QR (qr), Bring: Photo ID (check).
- Steps: CSS counter numbers in 24px hairline circles linked by a 1px connector; 1 to 5 items; plain imperative sentences.
- Footer (hairline above): primary "Get directions" (pill, nested arrow orb), "Verify offer" text link with up-right arrow, and the claim control. Desktop: claim sits at the right, label then 28px round check. Mobile: claim becomes a full-width 52px pill row.
- Fine print: "Last checked 28 Sep 2026 on starbucks.in" in 12.5px ink-3.
- Active (selected from map): inner 1px accent-tint-2 ring + shadow-2. Claimed: top-down accent tint wash, chips and steps at 55% opacity, label switches to "Claimed". No strikethrough of the brand name.

**Map frame.** 24px radius, shadow-2, sticky on desktop (top 24px, full viewport height minus 48px), 300px (mobile) / 380px (tablet) tall. Real Leaflet tiles get the warm tint with a CSS filter on the tile pane, for example `.leaflet-tile-pane { filter: grayscale(1) sepia(.18) saturate(.55) hue-rotate(-12deg) brightness(1.05) contrast(.9); }`. Search radius drawn as a dotted accent circle with a 5% accent fill. Controls: one white pill stack (zoom in, zoom out, recenter), 44px buttons, top right. Attribution pill bottom right.

**Pins.** Brand pin: 40x50 teardrop, white fill, 1.5 accent stroke, brand initials in accent. Active: accent fill, white initials, scale 1.18. Claimed: tint fill, check icon. User location: ink dot with a white ring and a slow 2.8s halo pulse. Popup: white, 16px radius, shadow-3, name + meta + "Get directions" link.

**Empty state.** Centered inside a card: line-art candle in a dotted ring, title "No quests within 2 km yet", one sentence of why, primary "Widen to 5 km" and ghost "See online quests".

**Error states.** Inline under the field with warn icon and specific copy ("We couldn't find that place. Try a nearby area or a bigger city name."). Contextual notice on `--sunken` for map tile failures with a ghost "Try again". No alerts, no "Oops".

**Loading.** Skeleton that matches the card shape (mono tile, two lines, "You get" block, two step lines) with a soft 1.6s shimmer. No spinners.

**Toast.** Dark ink pill bottom center, mini candle whose flame ignites, copy "Tata Starbucks claimed. 4 of 18 done, another candle lit." Auto-dismiss after 3.2s, mirrored in an `aria-live="polite"` region.

## 6. Motion choreography

1. **Results arrive:** header, tabs, each card and the map fade up 14px over 640ms `--ease-out`, staggered 70ms starting at 120ms. Never more than ~8 staggered items; cards after that appear together.
2. **Tab change:** thumb slides 420ms `--ease-spring`; count chip color crossfades 240ms; panel content crossfades 240ms (no slide, to keep reading position).
3. **Pin to card:** clicking a pin scales it to 1.18 with spring easing, the matching card gets the active ring and scrolls into view (`block: nearest`).
4. **Claim (the celebration, about 1.4s total):**
   - 0ms: checkbox fills accent; the check path draws in (stroke-dashoffset, 420ms, 80ms delay); the box does a 0.82 to 1.08 to 1 spring (520ms).
   - 0ms: 12 thin paper strips (5x14px, 1.5px radius) in accent, accent-tint-2 and soft gold `#E7C9A9` fan upward over a 136 degree arc from the checkbox, rise with ease-out, hang, then fall and fade with ease-in, each with its own spin. Deterministic spread, no randomness that could clump.
   - 0ms: progress ring advances (900ms ease-out); the count updates.
   - 0ms: the logo flame ignites (scale 0.2 to 1.2 to 1, 700ms spring) and keeps its slow flicker.
   - 0ms: card washes to the claimed tint (420ms); chips and steps dim; map pin swaps to the claimed check.
   - 0ms: toast rises 24px with spring easing.
5. **Reduced motion:** everything resolves instantly (1ms), no confetti strips are created, flicker and halo loops stop after one iteration. State changes (fill, check, ring value, toast text) still happen so feedback is not lost.

All of this is CSS transitions plus WAAPI (`element.animate`). JS only sets custom properties or `style.setProperty` (CSP-safe), never inline `style=""` in markup.

## 7. Remove from the current UI

- Emoji everywhere: the cake, sparkles, party poppers, pin, laptop, magnifier, lipstick, coffee, padlock, warning sign. Replace with the inline SVG set in the prototype sprite (24px grid, 1.5 stroke, round caps).
- Fredoka and Nunito, the centered bubbly H1 and the floating sparkle decorations.
- Pastel multi-color washes (lilac privacy bar, mint status bar, yellow-to-pink birthday banner, mint/lilac card headers). One accent, neutral everything else.
- The stack of three banners above results (privacy, "Found 8 quests...", "It's your birthday month..."). Privacy moves into the search panel; the count moves to the results header; the birthday message becomes one small pill.
- Strikethrough brand names and the dashed "Done!" sticker on claimed cards.
- Thick 2px plum input borders and the heavy bottom-shadow "3D" button.
- Playful mission copy ("Your warm-drink mission, should you choose it", "Glow-up quest") and the uppercase THE REWARD / HOW TO CLAIM / WHEN label grid. Replace with "You get", chips, numbered steps.
- Em dashes in all copy.
- Multicolor map pins (orange, purple, yellow, pink). One pin style in the accent.

## 8. Porting checklist

- Add `@fontsource-variable/bricolage-grotesque` and `@fontsource-variable/plus-jakarta-sans`; drop Fredoka and Nunito.
- Move tokens from `prototype.css` `:root` into the app stylesheet; keep the accent block swappable.
- Icon sprite: copy the `<symbol>` set into `index.html` (or a TS module that builds the same SVG nodes).
- Card renderer: map offer data to badge kind, "You get" string, chip list, steps array, last-checked line.
- Leaflet: custom `L.divIcon` with the pin markup, tile-pane filter, popup class with the prototype styles.
- Keep tests for focus order, 44px targets, axe, and reduced motion.
