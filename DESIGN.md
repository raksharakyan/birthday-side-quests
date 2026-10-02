# Design system: Soft Premium (plum)

This describes the live design system as shipped. Tokens live in [`src/styles/tokens.css`](src/styles/tokens.css), which is the source of truth: if this doc and the CSS disagree, the CSS wins, so fix the doc. The original prototype, the accent options we explored and its screenshots are in [`docs/design/`](docs/design/), kept for history. The decisions behind the design are DECISIONS #21 in [`docs/DECISIONS.md`](docs/DECISIONS.md).

**Design read:** a privacy-first birthday-treat finder for young women planning their birthday month. It should feel calm and premium (Glossier, Apple), on a warm porcelain background with one rich plum accent. Celebration happens through motion and the candle, not through emoji or extra colours.

## Principles
1. **One accent, used with intent.** Plum marks primary actions, the selected state and celebration. Everything else is warm neutrals.
2. **No emoji, anywhere.** Icons are hand-built inline SVG (24px grid, 1.5px stroke, round caps) in [`src/render/icons.ts`](src/render/icons.ts). A unit test bans emoji in `src/` and `index.html`.
3. **Plain, specific, warm copy.** Write "You get", "Mark claimed", "Get directions". No "mission" wording, no exclamation-mark spam, **no em dashes** (a test enforces this; use commas, colons, periods or parentheses).
4. **The offer is the hero.** Cards lead with what you get and exactly how to claim it.
5. **Motion is feedback.** Only `transform`, `opacity` and small `stroke-dashoffset` animate. Never `linear` or the default `ease`. Everything respects `prefers-reduced-motion`.
6. **Accessible by default.** WCAG AA text contrast, 3:1 for control edges and focus, tap targets of 44px or more, a visible focus ring, and correct ARIA patterns (combobox, tablist, radio group, switch).

## Colour tokens
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--bg` | `#FAF7F5` | Porcelain page | |
| `--surface` | `#FFFFFF` | Cards, search panel, popups | |
| `--sunken` | `#F3EEEB` | Tab track, segmented control, tiles, notices | |
| `--line` | `#ECE5E2` | Decorative hairline | |
| `--line-strong` | `#DDD3CF` | Step rings and connectors | |
| `--line-control` | `#958A8F` | Input and checkbox edges | 3.33:1 on surface |
| `--ink` | `#221B1F` | Primary text | 15.8:1 on bg |
| `--ink-2` | `#5E5459` | Secondary text | 6.8:1 on bg |
| `--ink-3` | `#71666B` | Meta, fine print | ≥4.6:1 on every surface |
| `--accent` | `#6B2D5E` | Plum: primary buttons, selected state, pins | white on it 9.71:1 |
| `--accent-hover` | `#5A2450` | Hover | white on it 11.65:1 |
| `--accent-active` | `#4A1D42` | Pressed | white on it 13.59:1 |
| `--accent-ink` | `#5A2450` | Accent text on tint | 9.69:1 on tint |
| `--accent-tint` | `#F2E7F0` | "You get" panel, birthday pill, claimed wash | |
| `--accent-tint-2` | `#E6D2E2` | Active card ring, paper strips | |
| `--ok` / `--ok-tint` | `#2E6A4C` / `#E8F1EB` | Verified badge | 5.55:1 |
| type chips | tint / sunken / surface | Free (`--accent-ink` on tint), Discount (`--ink` on sunken), Needs past spend (`--ink-2` on surface) | 9.69 / 14.7 / 7.27:1 |
| `--warn` / `--warn-tint` | `#82560F` / `#FBF0DA` | Check with store badge, field errors | 5.65:1 |
| `--gold-paper` | `#E7C9A9` | Confetti strips only | decorative |

To change the accent, swap the accent block in `tokens.css`. Nothing else needs to change, but recompute the contrast ratios.

## Typography
Both fonts are self-hosted through Fontsource and pinned to exactly `5.3.0`. Only the latin and latin-ext subsets are loaded (latin-ext carries ₹), with `font-display: swap`. See [`src/styles/fonts.css`](src/styles/fonts.css).
- **Display:** Bricolage Grotesque Variable, used for titles, brand names, the "You get" value and the wordmark.
- **Body and UI:** Plus Jakarta Sans Variable, used for everything else.
- **Don't use:** Inter, Roboto, Arial, Fraunces or Instrument Serif. Never load fonts from a third-party server at runtime.

| Role | Font | Size / line | Weight |
|---|---|---|---|
| Page title | Bricolage | clamp(30px, 6vw, 44px) / 1.04, tracking -0.035em | 600 |
| Card brand | Bricolage | 21px / 1.2 | 600 |
| "You get" value | Bricolage | 19px / 1.3 | 500 |
| Body, steps | Jakarta | 15 to 16px / 1.5, max 62ch | 400 |
| Button | Jakarta | 14 to 15px, never wraps | 600 |
| Label | Jakarta | 13px, always above the field | 600 |
| Meta, chips | Jakarta | 13 to 13.5px, `tabular-nums` for km and counts | 500 |
| Fine print | Jakarta | 12.5px, ink-3 | 400 |

## Shape, depth and motion
- **Radius:**
  - Pills (`999px`) for interactive controls.
  - `24px` for cards and the map.
  - `14px` for inner blocks (inputs, "You get", notices).
  - `10px` for small items.
- **Shadows:** tinted plum-brown and diffuse.
  - `--shadow-1`: resting card.
  - `--shadow-2`: search panel, map, hovered card.
  - `--shadow-3`: popups, autocomplete, toast.
  - `--shadow-accent`: primary button only.
- **Easing:**
  - `--ease-out` (enters, colour).
  - `--ease-spring` (tab thumb, pins, toast).
  - `--ease-inout` (loops, shimmer).
- **Durations:**
  - `--t-fast` 140ms
  - `--t-base` 240ms
  - `--t-slow` 420ms
  - `--t-enter` 640ms
  - ring fill 900ms
- **Focus:** a 2px gap in the page colour plus a 2px plum ring (`--focus`).

## Components
- **Top bar:** a candle logo tile plus the wordmark.
  - **Logo:** a line-art candle with a dashed flame while nothing is claimed. After the first claim the flame lights in plum with a soft glow and a slow flicker. This replaces the emoji cake as the birthday signal.
- **Search panel:**
  - Fields: "Your city" (a combobox with Photon city suggestions, typed prefix in bold), "Birthday month" (a native select), and "Search radius" (a radio group of 2, 5, 10 and 20 km styled as a segmented pill, whose selected state has a 1px ink-3 edge for 3:1+).
  - Actions: the primary "Find my quests" pill with an icon orb, and a quiet "Clear search".
  - A privacy line with a lock icon sits under a hairline.
- **Results header:**
  - A "It's your birthday month" pill (only in the birthday month).
  - "Your October quests" and a summary line.
  - A progress ring showing "N of M claimed".
- **"Verified only" switch:** a `<button role="switch" aria-checked>` right-aligned above the tabs (DECISIONS #25).
  - Pill, 44px tall, label "Verified only" next to a 34 by 20px track with a 14px thumb.
  - Off: white pill with a 1px `--line-control` edge (3.33:1), `--ink-2` text, `--sunken` track, `--ink-3` thumb.
  - On: plum pill (`--accent`, hover `--accent-hover`), white text (9.71:1), white track, plum thumb slid right with `--ease-spring`. No accent shadow (that stays on the primary button).
  - Focus: the standard `--focus` ring. Space and Enter toggle it (native button). Changes are announced in the status live region ("Showing verified quests only, 18 of 34").
  - When it hides every quest in a list: empty state "No verified quests here yet" with a "Show all quests" action. Found online shows a note instead, because live results are never verified.
- **Filter box (DECISIONS #27):** a "Filter" pill right of the "Verified only" switch, in the same row (it wraps on narrow screens with no horizontal scroll at 360px).
  - Button: same resting look as the switch when off (white pill, 1px `--line-control` edge, `--ink-2` text, 44px tall) with the filter icon. Hover or open: `--ink` text and `--ink-3` edge. When types are hidden, a plum count chip (white on `--accent`, 9.71:1) shows how many; screen readers hear "Filter, 2 types hidden".
  - Disclosure pattern: `aria-expanded` and `aria-controls`. Escape closes and returns focus to the button; a click outside or tabbing out closes it.
  - Box: `--surface`, 16px radius, `--shadow-3` plus a `--line` hairline, right-aligned under the button, `min(300px, 100vw - 32px)` wide, fades in over `--t-fast` (none with reduced motion).
  - Inside: a fieldset with legend "Show" and three real checkboxes (Free, Discount, Needs past spend), all checked by default, rows at least 46px tall with a `--sunken` hover; native checkboxes with `accent-color: var(--accent)`. A fine-print line explains "Needs past spend", and a "Reset" link turns every type back on.
  - Changes re-render both lists, counts, header, ring and pins, and are announced ("Showing free quests only, 12 of 31"). If nothing matches, the empty state reads "No quests match your filters" with "Show all quests", which resets the checkboxes and Verified only.
- **Tabs:** Nearby, Online and Found online, as a segmented track with a white sliding thumb and count chips (the selected chip turns plum). It's an ARIA tablist with arrow-key support.
- **Quest card:**
  - Header: brand initials tile, brand name, branch (or venue, e.g. "Wonderla Bengaluru") and distance ("about 47 km away" for approximate venues), a type chip, then a status badge (Verified / Check with store / May be outdated / Claimed).
  - Type chip (DECISIONS #27), first in the badge row, same badge shape: **Free** (`--accent-tint` with `--accent-ink`, 9.69:1, gift icon), **Discount** (`--sunken` with `--ink`, 14.7:1, tag icon), **Needs past spend** (`--surface` with a 1px `--line-control` edge and `--ink-2`, 7.27:1, receipt icon). Words always carry the meaning; screen readers hear "Quest type: Free".
  - Order in every list: Free, then Discount, then Needs past spend. In Nearby this applies inside both groups (near branches first, by distance within a type; the "Also in <Country>" group by brand). No per-type subheadings.
  - "You get" tint panel (shown only when `rewardItem` is known).
  - Condition chips: No purchase needed, Purchase needed (min X), Join N+ days before, Valid: X, Bring: X.
  - Numbered steps joined by a connector line.
  - Footer: the "Get directions" pill, a "Verify offer" link, and a round "Mark claimed" check (a full-width row on mobile).
  - Fine print: "Last checked <date> on <domain>".
  - Unknown fields are hidden, never shown as placeholder text.
- **Map:**
  - 24px-radius frame, sticky on desktop.
  - The OSM tile pane is warm-tinted with a CSS filter.
  - A dotted plum radius circle.
  - A white pill stack for zoom in, zoom out and recenter.
  - Pins: white with plum initials; filled plum when active; tint with a check when claimed. Your location is an ink dot with a halo.
  - When tiles fail, a "Map couldn't load / Try again" notice appears.
- **States:**
  - A skeleton shaped like the card (no spinners).
  - An empty state with the candle art and actions ("Widen to N km", "See online quests").
  - Specific inline errors, with no alerts and no "Oops".
- **Toast:** a dark ink pill at the bottom centre with a mini candle. It reads "X claimed. N of M done." and lasts 3.2s, with `pointer-events: none` and `width: max-content`. It's mirrored to a polite live region.

## Celebration (claiming a quest)
Each claim triggers all of these at once:
1. The check draws in with a spring.
2. 12 thin paper strips (plum, tint and gold) fan upward from the checkbox via WAAPI.
3. The progress ring fills.
4. The logo candle lights.
5. The card washes to the claimed tint and its map pin swaps to a check.
6. The toast rises.

With reduced motion on, only the end states appear and no strips are created.

## Implementation rules (CSP-safe)
- Never put `<style>`, `<script>` or `style=""` in markup. JS may only use `style.setProperty` with numeric values or tokens, plus `element.animate()`.
- Build all DOM with `el()` and `svg()` from [`src/render/dom.ts`](src/render/dom.ts). Never use `innerHTML`.
- Mobile-first, with two columns from 1100px. There must be no horizontal scroll at 360, 375, 390, 768, 1024 or 1440px (an e2e test checks this).
- Lighthouse must stay at Performance ≥ 0.9 and Accessibility / Best Practices ≥ 0.95. Current scores are 0.99 / 1.0 / 1.0.

## Changing the design
1. Edit `tokens.css` first and avoid hard-coded colours in components.
2. Recompute contrast for any new colour pair and record it in the table above.
3. Update this file and add a DECISIONS entry.
4. Refresh the screenshots in `docs/screenshots/`.
5. Run `npm run build && npm test && npm run test:e2e && npm run lhci`.
