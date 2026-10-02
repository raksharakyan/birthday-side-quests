# Handoffs

Each agent appends: what was finished, what's next, and sign-offs. A feature is done only when **Security ✅** and **QA ✅** are both recorded.

| Feature | Full-Stack | UI/UX | Security | QA |
|---|---|---|---|---|
| Geocoding (Nominatim) | ✅ | ✅ | ✅ | ✅ (QA-01/02 fixed) |
| Nearby branches (Overpass) + map | ✅ | ✅ | ✅ | ✅ (QA-01 fixed) |
| Offers data + filtering | ✅ (placeholder data — research merge pending) | ✅ | ✅ | ✅ |
| Quest list + done/confetti | ✅ (event only; confetti = UI) | ✅ | ✅ | ✅ |
| Online tab | ✅ | ✅ | ✅ | ✅ (QA-03 fixed) |
| Found online (Worker) | ✅ (not deployed) | ✅ | ✅ (code; re-check CORS origin + secret after deploy) | ✅ (code + mocked e2e; live smoke after deploy) |
| CI/CD + Pages deploy | ✅ (not yet run on GitHub) | ✅ (n/a — no UI) | ✅ | ✅ (all CI steps green locally; confirm first GitHub run) |

---

## Full-Stack → UI/UX (2026-10-02)

**Status:** builds, all tests green locally.
- `npm run build` passes.
- Vitest: 104 tests passed (23 of them are Worker tests).
- Playwright: 3 smoke tests × 2 projects (desktop Chromium, Pixel 7), all external network mocked, axe has 0 violations, and there are 0 console or CSP errors.
- Lighthouse on `dist-lhci`: Performance 1.0, Accessibility 1.0, Best Practices 1.0.
- `npm audit --audit-level=high` finds 0 vulnerabilities.

### File map
| Path | What |
|---|---|
| `index.html` | Static semantic shell: header, form, status, map, tabs/panels, footer. CSP meta is injected at build time only, so dev has no CSP. |
| `src/main.ts` | Wiring and in-memory state. Tabs follow the WAI-ARIA pattern (arrow keys, Home and End). Leaflet is lazy-loaded on the first search. |
| `src/geocode.ts` | Nominatim calls with a 1 req/s queue, a Map cache and typed errors. Exports `parseNominatim` and `debounce`. |
| `src/overpass.ts` | `buildOverpassQuery`, `parseOverpass`, `fetchBranches` and `nearestByOffer`. |
| `src/offers.ts` | `validateOffer(sFile)`, `filterOffers`, `monthInfo` and `isStale`. |
| `src/liveSearch.ts` | Worker client and `validateLiveResults`. |
| `src/urls.ts` | `safeHttpsUrl` and `directionsUrl`. |
| `src/templates.ts` | Quest lines, 5 per category, chosen by FNV hash. |
| `src/render/dom.ts` | `el()`, `externalLink()` and `svg()`. Attributes are allow-listed; `on*`, `style` and unsafe `href` are blocked. |
| `src/render/icons.ts` | Placeholder `heartIcon()` and `centerIcon()` SVGs. **Restyle or replace these.** |
| `src/render/map.ts` | Leaflet, OSM tiles, divIcon markers and DOM popups. |
| `src/render/quests.ts` | Quest cards, found-online cards and empty states. |
| `src/styles/{tokens,base,components}.css` | Minimal functional CSS. **These are yours to restyle.** |
| `csp.config.ts` | The single source for the CSP, used for both the meta tag and `dist/_headers`. |
| `worker/` | Cloudflare Worker, `wrangler.toml`, tests and README. |
| `public/offers.json` | **Placeholder data:** 3 entries, all `verified:false`. The orchestrator merges `research/offers.draft.json`. |

### Hooks and class names to style
- **Layout:** `.site-header`, `.site-title`, `.site-tagline`, `.app` (main), `.site-footer`, `.skip-link` and `.visually-hidden`.
- **Form:**
  - Containers: `.search-form`, `.field` (with `--city`, `--month`, `--country`), `.field__label`, `.field__input`.
  - Buttons: `.btn`, `.btn--primary`, `.btn--directions`, `.btn--source`. The submit button gets `aria-disabled="true"` while busy.
- **Messages:**
  - `.privacy-note` holds the required copy. Keep it visible.
  - `#status.status` has `[data-kind="info|loading|error|success"]`. `body.is-loading` is set while loading.
  - `#month-info.month-info` has `[data-birthday-month="true|false"]`.
- **Map:**
  - Containers: `#map.map`, `.map__placeholder` (shown before the first search), `.map-marker-host` (the Leaflet divIcon wrapper).
  - Markers: `.map-marker`, `.map-marker--branch[data-category=cafe|dessert|…]`, `.map-marker--center`. The SVG classes are `.marker-heart` and `.marker-center`.
  - Popups: `.map-popup`, `__brand`, `__name`, `__offer`, `__directions`.
- **Tabs:** `.tabs[role=tablist]`, `.tab[aria-selected]`, `.tab-panel`. Panel ids are `#panel-nearby`, `#panel-online`, `#panel-found`. `#tab-found` is `hidden` when `VITE_WORKER_URL` is empty. `.disclaimer` sits in the found panel.
- **Lists:** `.quest-list` and `.live-list` (both `ul`), `.empty-state`.
- **Quest card:**
  - The card is `li.quest-card[data-offer-id][data-category]`, with `.is-done` added when checked. Inside it, `.quest-card__inner` is an `article`.
  - Parts: `__header`, `__brand` (h3), `__line` (the cute line), `__details` (dl), `__offer`, `__claim`, `__window`, `__meta` (with `<time>`), `__branch`, `__actions`, `__done`, `__done-input`.
- **Badges:** `.badges`, `.badge--verified`, `.badge--check`, `.badge--stale`, `.badge--unverified`.
- **Live card:** `li.live-card`, `__inner`, `__title`, `__snippet`, `__source`.

### Event for confetti
`quest-done` is a `CustomEvent<{offerId, brand}>`. It bubbles and is dispatched from the checkbox **only when it gets checked**.

To use it, listen with `document.addEventListener('quest-done', e => …)`. Respect `prefers-reduced-motion`. The CSP is `script-src 'self'` and `style-src 'self'`, so build any confetti with DOM, canvas or CSSOM (`el.style.x = …` is fine). **Inline `style=""` attributes in markup and `innerHTML` are not allowed.**

### Notes, constraints and known gaps
- **Rules to keep.** Only use `el()` and `textContent`. Never `innerHTML`. Never touch storage. Never use geolocation. Never put location in the URL.
- **Fonts.**
  - Fonts are imported in `main.ts` (Fredoka 600, Nunito 400 and 700) and emitted as files (`assetsInlineLimit: 0`).
  - To add weights, import more `@fontsource/*/<weight>.css` files.
- **OSM tiles referrer.** Tiles also use `referrerPolicy: 'strict-origin'` (a Leaflet tileLayer option), because the OSM tile policy asks for an identifying Referer. This extends DECISIONS #6. **Security, please confirm.**
- **Lighthouse CI dependency.**
  - `@lhci/cli` is **not** a devDependency because it pulls in 11 high-severity advisories (`tmp`, `inquirer`, …) that would fail `npm audit --audit-level=high`.
  - `npm run lhci` runs `npx --yes @lhci/cli@0.15.1` instead, against a `VITE_BASE=/` build in `dist-lhci/`. LHCI's static server serves from the root.
- **E2E build.** E2E builds into `dist-e2e/` with a fake `VITE_WORKER_URL`, so it never overwrites the deploy `dist/`.
- **Worker origin rule.** The Worker returns 403 when the `Origin` header is missing, which is stricter than the spec. `curl` needs `-H Origin:`.
- **Worker cache.** The Cache API is a no-op on `*.workers.dev`, so a custom domain or route is needed for the 24h cache. This is documented in `worker/README.md`.
- **Worker not deployed.** The user steps in PLAN step 6 are still to do.
- **Link check.** `scripts/check-links.mjs --dry-run` works locally. The placeholder `https://www.nykaa.com/` fails from Node fetch (network reset, probably bot-blocking). Watch for this after the research merge.
- **npm install scripts.** With npm 11, the install scripts for esbuild and workerd need `npm install-scripts approve`. The build doesn't need them; Vite 8 uses rolldown. CI uses Node 22 / npm 10, so this doesn't apply there.
- **Online tab country list.** Built from the countries present in `offers.json`, plus the geocoded country. Names come from `Intl.DisplayNames`.
- **Not done (QA scope).** Wider XSS and e2e coverage, an offline e2e test, and an e2e test for the 429 path.

---

## UI/UX → Security (2026-10-02)

**Status:** all green locally.
- `npm run build` passes (typecheck incl. worker).
- Vitest: 104/104 passed.
- Playwright: 6/6 (desktop Chromium + Pixel 7); axe 0 violations, 0 console/CSP errors.
- Lighthouse (`npm run lhci`, 3 runs): Performance 0.99–1.0, Accessibility 1.0, Best Practices 1.0, SEO 1.0. LCP 1.5 s, CLS 0.001.
- Screenshots: `docs/screenshots/desktop.png` (1280×800, results + one quest done + map popup), `docs/screenshots/mobile.png` (375×812 @2x, top 2000 CSS px of the full page), `docs/screenshots/online-tab.png` (1280×800, Online tab). Taken against `vite preview` of the e2e build with Nominatim/Overpass/Worker mocked (same data shape as `tests/e2e/fixtures.ts`); only the screenshot run let a handful of real OSM tiles load so the map looks realistic. The screenshot script lives in the session scratch dir, not the repo.

### What changed
| File | Change |
|---|---|
| `src/styles/tokens.css` | New "pastel party" palette: cream / blush / lavender / mint / butter / peach fills + "ink" text shades. Radii, shadows, map height tokens. |
| `src/styles/base.css` | Pastel gradient-blob page background (pure CSS), playful centred header (wiggling 🎂, twinkling ✨, decorative ✦✧♡), pill skip link, mobile-first grid → ≥900 px two columns (search spans both; list left, **sticky map** right), footer. Reduced-motion rule now also forces `animation-iteration-count: 1`. |
| `src/styles/components.css` | Search card, inputs (custom select chevron via gradients — no image), pill buttons with "pressable" shadow, privacy note, status pills per `data-kind`, birthday-month banner, segmented-pill tabs, category-tinted quest cards, custom checkbox, completed style + "🎉 Done!" stamp, badges, live cards, empty/loading/error states, map/Leaflet skin (tile tint, readable attribution, zoom buttons, popups, pins), confetti keyframes. |
| `index.html` | Decorative emoji wrapped in `aria-hidden` spans (title, button ✨, tab icons, privacy 🔒, disclaimer 🧭, footer 💖). Map placeholder + empty states are now `div.empty-state > span.empty-state__art + p.empty-state__text`. New `#celebrate-live` (`aria-live="polite"`, visually hidden — **not** `role=status`, so `getByRole('status')` stays unique). `theme-color` updated. No inline styles/scripts added. |
| `src/render/icons.ts` | New pin markers built with `svg()`: heart pin (cafe/dessert/restaurant), gift pin (beauty/fashion/retail/online), star for the searched place (`centerIcon` kept as alias). Colours from CSS classes (`.pin__body/.pin__face/.pin__glyph`, `.star__*`) keyed off `data-category` — no inline styles. `CATEGORY_EMOJI` map. |
| `src/render/map.ts` | Uses the new icons/sizes/anchors; popup gets `className: 'bsq-popup'`, a category emoji (aria-hidden), and directions link `aria-label="Get directions to {brand}, {branch} (opens in a new tab)"`. |
| `src/render/quests.ts` | Card header: aria-hidden category emoji bubble + heading/badges wrapper + aria-hidden "🎉 Done!" stamp. Badge emoji moved into aria-hidden `.badge__icon` (spoken text is now just "Verified" / "Check with store" / "May be outdated" / "Unverified — check the link"). Directions label → "Get directions to Starbucks, Starbucks MG Road (opens in a new tab)"; source links also say "(opens in a new tab)". `renderEmpty(container, msg, kind = 'empty' \| 'loading' \| 'error')` renders an illustration + text. Done label gets `.quest-card__done-label`. |
| `src/render/confetti.ts` (new) | Listens for `quest-done`: announces "Yay! {brand} quest complete." in `#celebrate-live` (via `textContent`), adds `.just-done` pop to the card, and — unless `prefers-reduced-motion: reduce` — spawns 30 `aria-hidden` DOM pieces with per-piece **CSS custom properties set through `style.setProperty`** (CSSOM, allowed by `style-src 'self'`). Layer is `pointer-events: none` and removed after 1.6 s. No dependencies. |
| `src/main.ts` | Font imports narrowed to `latin` + `latin-ext` subsets of Fredoka 600 / Nunito 400+700 (dropped cyrillic/vietnamese/hebrew files from the build); calls `initCelebrations()`; passes `'loading'`/`'error'` kinds to `renderEmpty`. No logic/state changes. |
| `tests/e2e/fixtures.ts`, `tests/e2e/smoke.spec.ts` | **Not a markup change** — the e2e suite was already red after the researched `offers.json` merge (hard-coded "2 Nearby cards", Chaayos fixture no longer exists). Now: Overpass fixture uses brands in the shipped data (Starbucks MG Road, Third Wave Coffee, Theobroma, The Body Shop → 4 pins), expected Nearby count is derived from `public/offers.json` (`expectedNearbyCount('IN')`), directions assertion picks the first card that has a directions link, plus two new assertions: directions `aria-label` format and `.is-done` on the checked card. QA please review. |

Not touched: `public/offers.json`, `worker/`, CI workflows, `csp.config.ts`, `vite.config.ts`, `src/render/dom.ts`, `src/urls.ts`.

### Contrast (WCAG 2.x, computed with the relative-luminance formula)
Normal text needs 4.5:1; large text and UI component boundaries need 3:1. Every pair passes.

| Foreground | Background | Ratio |
|---|---|---|
| Body text `--ink` `#3b2440` | page `--cream` `#fff9f2` | 13.28:1 |
| Body text `--ink` `#3b2440` | card white `#ffffff` | 13.89:1 |
| Muted text `--ink-muted` `#6a5470` | `--cream` `#fff9f2` | 6.45:1 |
| Muted text `--ink-muted` `#6a5470` | `--blush-soft` `#fff0f5` | 6.11:1 |
| Title `--ink-berry-deep` `#8f1f50` | `--cream` `#fff9f2` | 8.10:1 |
| White text | `--ink-berry` `#b02a63` (primary button, selected tab, directions) | 6.25:1 |
| White text (hover) | `--ink-berry-deep` `#8f1f50` | 8.47:1 |
| Links `--ink-berry` `#b02a63` | `--cream` `#fff9f2` | 5.98:1 |
| Quest line `--ink-berry-deep` `#8f1f50` | `--blush-soft` `#fff0f5` | 7.68:1 |
| Birthday banner `--ink-berry-deep` | `--butter` `#fff1bf` → `--blush` `#ffd9e6` gradient | 7.50:1 → 6.58:1 |
| Privacy note / loading `--ink-lavender` `#5a3ea6` | `--lavender-soft` `#f5f0ff` | 7.03:1 |
| Verify/Open button `--ink-lavender` | white | 7.85:1 |
| Badge Verified `--ink-mint` `#1d6647` | `--mint` `#d5f5e7` | 5.93:1 |
| Badge Check/Unverified `--ink-butter` `#6e4c00` | `--butter` `#fff1bf` | 6.89:1 |
| Badge May be outdated `--ink-lavender` | `--lavender` `#e9e0ff` | 6.20:1 |
| Status success `--ink-mint` | `--mint-soft` `#eefbf4` | 6.49:1 |
| Status/empty error `--ink-error` `#a3213a` | `--blush-soft` `#fff0f5` | 6.71:1 |
| Disclaimer `--ink-butter` | `--butter-soft` `#fff8dc` | 7.31:1 |
| Done toggle `--ink-mint` | `--mint` | 5.93:1 |
| Card brand `--ink` | cafe header `--peach` `#ffe1cc` | 11.17:1 |
| Map attribution link `--ink-lavender` | white (94%) | 7.85:1 |
| UI: focus ring `#7b4fe0` | `--cream` / white | 4.98:1 / 5.20:1 |
| UI: input/select/checkbox border `#ad6b8e` | `--cream` / white | 3.81:1 / 3.98:1 |
| UI: checked checkbox `--ink-mint` | white | 6.90:1 |
| UI: pin outline `--ink-berry` / `--ink-butter` | OSM land `#f2efe9` | 5.45:1 / 6.79:1 |

Pastel fills (`--blush`, `--lavender`, `--mint`, `--butter`, `--peach`) are never used as text colours. Decorative card borders (`--color-border-soft`) are not relied on to identify controls.

### Accessibility notes
- Landmarks unchanged (header/main/footer, labelled sections). Heading order is h1 → h2 (visually hidden) → h3 cards. The skip link targets `#main`.
- Accessible names are unchanged: "Find my quests", tabs "Nearby" / "Online" / "Found online", "Quest complete!". All decorative emoji are `aria-hidden` or CSS `content: 'x' / ''` (empty alt).
- Tabs: the existing WAI-ARIA pattern (arrow keys, Home and End) is kept and restyled as a segmented pill. On screens under 480 px the tabs get tighter padding, so all three fit at 375 px.
- Focus: a 3px `#7b4fe0` ring everywhere, including Leaflet markers (`.map-marker-host:focus-visible`), the zoom buttons and the custom checkbox.
- Targets: buttons, inputs and the done row are at least 44–48 px tall.
- No horizontal scroll at 375 px or 1280 px (`scrollWidth === innerWidth`, checked in the screenshot run).
- Reduced motion: no confetti (the layer isn't created, and the CSS hides it too), and every animation is cut to a single frame. The done state is still clear without motion (mint card, ✓ checkbox, "Done!" stamp, strikethrough brand).

### Requests and questions for Security
1. **CSSOM in confetti.** `src/render/confetti.ts` calls `element.style.setProperty('--x' …)` and similar on DOM nodes it creates itself. All the values are numbers or constants, never user data. My understanding is that CSP `style-src 'self'` doesn't block CSSOM; please confirm. No `style=""` markup exists anywhere.
2. **Live-region text.** The `#celebrate-live` text includes `offer.brand` and is set via `textContent` (from offers.json, not user input).
3. **CSS alt-text syntax.** CSS uses the `content: '🎉' / ''` alt-text syntax in a few `::before` rules. These are static strings in the stylesheet, so there is no CSP impact.
4. **Leaflet `className` option.** Leaflet popups now get the `className: 'bsq-popup'` option. The content is still DOM nodes from `el()`.
5. **No changes needed from Security in `dom.ts`.** The new attributes (`aria-hidden`, `data-kind`, `data-category`) already pass the existing allow-list.

---

## Security review (2026-10-02)

**Scope.** I reviewed the whole tree:
- the app: `src/`, `index.html`, `csp.config.ts`, `vite.config.ts`, `public/`;
- the Worker: `worker/`;
- tooling and supply chain: `scripts/`, `.github/`, `package.json` and the lockfile;
- the built `dist/`;
- git history, for secrets.

**Status:** green.
- `npm run build` passes, including the typecheck for app, node and worker.
- `npm test` gives 186/186. Before this review it was 104, plus 82 new security tests.
- `npm run test:e2e` gives 6/6 on desktop Chromium and Pixel 7, with 0 console or CSP errors (map, markers and confetti running under the built CSP).
- `npm audit --audit-level=high` finds 0 vulnerabilities.

No Critical or High findings.

### Findings
| ID | Severity | File:line (before fix) | Description | Fix | Status |
|---|---|---|---|---|---|
| SEC-01 | Medium | `.github/workflows/ci-deploy.yml:70` | Lighthouse CI runs `npx --yes @lhci/cli@0.15.1`, which is unlocked and pulls ~300 transitive packages that are not in the lockfile. It ran **in the same job, before** `upload-pages-artifact`, so a compromised transitive package could rewrite `dist/` and ship to production. The same job also wrote the shared npm cache. | Lighthouse moved to its own `lighthouse` job (`contents: read`, no `cache: npm`). `deploy` now `needs: [test, lighthouse]`, so Lighthouse still gates the deploy but never touches the artifact. Explicit job-level `permissions` were added to `test`. | Fixed |
| SEC-02 | Low | `src/liveSearch.ts:25`, `src/geocode.ts:55`, `src/overpass.ts:64`, `src/offers.ts:34` | Text from outside the app had only C0/C1 controls stripped (Nominatim and Overpass only `\u0000-\u001f\u007f`). Bidi overrides, isolates, marks and zero-width characters passed through. Rendering is `textContent`, so this was not XSS. It allowed visual spoofing, for example a "Source" that reads as a different domain, or a reordered offer line. `offers.json` didn't reject them either. | New `src/text.ts` (`cleanDisplayText`, `hasUnsafeText`) is used by the Worker-result validator, the Nominatim label and Overpass names. `validateOffer` now rejects these characters. ZWJ/ZWNJ are kept for Indic scripts and emoji. | Fixed |
| SEC-03 | Low | `worker/src/index.ts:102` | The Worker's sanitiser regex was written with **literal invisible characters** in the source, so it couldn't be reviewed. It also missed U+061C, U+2060–2064, U+206A–206F and U+FFF9–FFFB. | Replaced with an `UNSAFE_TEXT_RE` written in `\u{…}` escapes, kept in sync with `src/text.ts`. New tests cover each code point. | Fixed |
| SEC-04 | Low | `src/render/dom.ts:42,57` | `el()` only blocked `script`, `style` and `iframe`. `object`, `embed`, `base` (which can re-point relative URLs), `link`, `meta` and `frame` were allowed. `rel="noopener noreferrer"` was forced only for `target="_blank"`, but a named target such as `target="x"` also opens a new browsing context with an opener. | Tag blocklist extended. `rel` is now forced whenever any `target` is set. | Fixed |
| SEC-05 | Low | `.github/workflows/link-check.yml:10`, `scripts/check-links.mjs:72` | `issues: write` was granted at workflow level. Issue table cells interpolated `url`, `id` and `detail` unescaped, so a `|`, backtick, `@mention`, `<tag>` or newline in repo data could break the table or ping users. The data is repo-controlled and passed through `execFileSync` (no shell), so there was no command injection. | `permissions: {}` at the top, with `contents: read` and `issues: write` on the job only. Cells are escaped (`| \` < > [ ]` become entities, `@` is defused, newlines removed, 300-character cap). | Fixed |
| SEC-06 | Info | `csp.config.ts` (`img-src … data:`) | I checked whether `data:` is needed. Leaflet 1.9.4 assigns a 1×1 `data:image/gif` to tile `<img>`s when it aborts loads during zoom or pan. | Kept and justified in `SECURITY.md`. A unit test pins the exact `img-src`. data: images can't run script. | Accepted |
| SEC-07 | Info | `worker/src/index.ts` (rate limiter) | The rate limiter **fails open** if the binding throws. The Cache API is a no-op on `*.workers.dev`. | Documented in `SECURITY.md` known limitations and `worker/README.md`. | Accepted |
| SEC-08 | Info | GitHub Pages | Pages can't send `frame-ancestors`, `X-Frame-Options`, `nosniff` or `Permissions-Policy`, and a meta CSP has no reporting. | `public/_headers` covers Cloudflare Pages. Documented. | Accepted (DECISIONS #2) |

### Verified OK (no change needed)
- **XSS sinks.** `src/` has no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`, `srcdoc`, `eval`, `new Function` or string timers. A new source-scan test enforces this.
- **Leaflet.** Popups get DOM nodes, `divIcon.html` is an `HTMLElement`, the attribution is a constant, marker `title`/`alt` are set as attributes, and there is no `bindTooltip`. Leaflet's own `innerHTML` uses are constants (zoom and close buttons, attribution).
- **`dom.ts` allowlist.** It has no `on*`, `style`, `src`, `srcset`, `formaction` or `xlink:href`, and `href` is accepted only through `safeHttpsUrl`. `svg()` is static-only and allows no `href`.
- **CSP in `dist/index.html`** is exactly `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; font-src 'self'; connect-src 'self' https://nominatim.openstreetmap.org https://overpass-api.de; object-src 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests`. It has no `unsafe-*`, and `VITE_WORKER_URL` must be https with no credentials.
- **UI/UX questions.**
  - Q1: CSSOM `style.setProperty` is not governed by `style-src`. Confirmed, and e2e shows 0 violations with the confetti.
  - Q2: `textContent` with an `offers.json` brand is fine.
  - Q3: CSS `content: '…' / ''` is static, so there is no CSP impact.
  - Q4: Leaflet `className` is a constant, so it's fine.
  - Q5: agreed, no `dom.ts` change was needed for your attributes. I tightened `dom.ts` for other reasons (SEC-04).
- **Origins in `dist/`** (`grep -ohE https?://… dist`):
  - Runtime: `tile.openstreetmap.org`, `nominatim.openstreetmap.org`, `overpass-api.de`.
  - Link-only: `www.openstreetmap.org`, `nominatim.org`, `leafletjs.com`, `www.google.com` (directions), and the brand `sourceUrl` hosts in `offers.json`.
  - Namespace string: `www.w3.org`.
  - **There are no third-party runtime scripts, fonts or CDNs.**
- **Links.** Every `_blank` link has `rel="noopener noreferrer"`. `directionsUrl` rejects non-finite input and clamps the rest. `sourceUrl` is https-only; the validator checks it, and a new per-entry unit test covers every shipped URL.
- **Privacy.**
  - No storage, cookies, geolocation or history writes, and no location in the URL. The e2e test and the source-scan test both check this.
  - The only `console` call is `console.warn` for dropped `offers.json` entries, which is repo data, not user input.
- **Worker.**
  - Parameters are validated strictly: no extra or duplicate params, month `^(?:[1-9]|1[0-2])$`, country `^[A-Z]{2}$`. No user text reaches Tavily.
  - CORS uses the exact origin with `Vary: Origin`. Preflight returns 204 for the allowed origin and 403 for any other. A missing `Origin` also gets 403.
  - Rate-limit binding, `observability.enabled=false`, no `console.*`. The key comes only from `env`.
  - Output: tags stripped, controls and bidi stripped, https only, length caps. Errors are generic, and a new test checks that no upstream body leaks.
  - Response headers: `nosniff`, `no-referrer`, `CSP default-src 'none'`.
  - Prompt injection is not applicable (no LLM).
- **Supply chain.**
  - `package-lock.json` is committed.
  - 3 runtime dependencies: `leaflet` and the two `@fontsource` font packages.
  - `npm audit` is clean.
  - All 6 Action SHAs were checked with `gh api repos/…/git/ref/tags/…`, and all are lightweight tags pointing at the pinned commits:
    - `checkout` v7.0.1
    - `setup-node` v7.0.0
    - `upload-artifact` v7.0.1
    - `upload-pages-artifact` v5.0.0
    - `configure-pages` v6.0.0
    - `deploy-pages` v5.0.1
  - No `pull_request_target`, and no `${{ github.event.* }}` in `run:`.
  - `persist-credentials: false` on every checkout. `dependabot.yml` is valid.
- **Secrets.**
  - `git log --all -p` shows no `tvly-`, `sk-`, `gh?_`, `github_pat_`, `AKIA`, `AIza`, `xox?-` or PEM matches. The only key-like strings are names and placeholders.
  - `.gitignore` covers `.dev.vars*` and `.env*` (except `.env.example`).
- **Repo settings** (`gh api …`):
  - secret scanning: enabled
  - push protection: enabled
  - Dependabot security updates: enabled
  - vulnerability alerts: enabled (204)
  - **private vulnerability reporting: enabled by Security** (`{"enabled":true}`)

### Decisions
- DECISIONS #9: the OSM tile `referrerPolicy: 'strict-origin'` extension is approved.
- DECISIONS #10: Lighthouse CI is isolated in its own job.
- DECISIONS #11: `img-src data:` is kept for Leaflet.
- DECISIONS #12: external text is hygiene-filtered for bidi and invisible characters, with ZWJ/ZWNJ allowed.

### Files changed by Security
- **New:**
  - `src/text.ts`
  - `tests/unit/security.test.ts` (78 tests; 12 of them fail against the pre-review code)
  - `SECURITY.md`
- **Edited:**
  - App: `src/liveSearch.ts`, `src/geocode.ts`, `src/overpass.ts`, `src/offers.ts`, `src/render/dom.ts`
  - Worker: `worker/src/index.ts`, `worker/test/worker.test.ts` (4 new tests)
  - `tests/unit/geocode.test.ts`: label control characters now become a space ("A B"), so words aren't glued together.
  - CI: `.github/workflows/ci-deploy.yml`, `.github/workflows/link-check.yml`, `scripts/check-links.mjs`
- **Not done:** I didn't commit or push; that's the orchestrator's job.

### For the orchestrator, user and QA
- **After the Worker is deployed:**
  - Confirm `ALLOWED_ORIGIN` matches the real Pages origin.
  - Confirm `TAVILY_API_KEY` is set with `wrangler secret`; it is never in `[vars]`.
  - Consider a custom domain so the 24h cache works.
  - `curl -H 'Origin: https://evil.example'` should return 403.
- **After the first Pages deploy:** load the live URL and check that the console shows no CSP violations, including while zooming the map (the tile-abort `data:` GIF).
- **For QA:** `tests/unit/security.test.ts` already has XSS-sink and bidi cases. An e2e test with a bidi-laden Worker fixture would be a nice extra.

---

## QA report (2026-10-02)

**Status: green. QA ✅ on every feature** (see the table at the top). Nothing was committed or pushed.

### Results (all run locally, in this order)
| Command | Result |
|---|---|
| `npm run build` (typecheck for app, node/e2e and worker, then vite build) | ✅ pass |
| `npm test` (Vitest: `tests/unit` + `worker/test`) | ✅ **381/381** in 10 files (186 before QA, 195 new) |
| `npm run test:e2e` (Playwright, desktop Chromium + Pixel 7) | ✅ **33 passed, 1 skipped** (34 = 17 tests × 2 projects; the keyboard-only test is desktop-only by design). Also ran `qa.spec.ts --repeat-each=3`: 81/81, no flakes. |
| `npm run lhci` (3 runs, `dist-lhci`) | ✅ Performance **1.00**, Accessibility **1.00**, Best Practices **1.00**, SEO **1.00** in all 3 runs (thresholds 0.90 / 0.95 / 0.95) |
| `npm audit --audit-level=high` | ✅ 0 vulnerabilities |

No new dependencies were added. `@axe-core/playwright` was already a devDependency. CI already runs everything that was added: `npm test` picks up `tests/unit/**` and `worker/test/**`, `npm run test:e2e` picks up every `tests/e2e/*.spec.ts`, and `lint:typecheck` covers `tests/e2e` (via `tsconfig.node.json`) and `worker/test`.

### Test inventory
| File | Tests | New / changed by QA | What it covers |
|---|---|---|---|
| `tests/unit/geocode.test.ts` | 16 | — | existing |
| `tests/unit/geocode.qa.test.ts` | 50 | **new** | Nominatim parsing edge cases: empty array, missing, null or 3-letter `country_code`, non-numeric, `''`, `null`, `NaN` or `Infinity` coordinates, out-of-range values, a 1 MB label (capped and fast), HTML labels kept as text. Label fallback. Throttle tested with fake timers: two rapid calls give exactly 1 request until 1000 ms have passed; three calls are spaced ≥1 s apart; a cached repeat (different case and whitespace) makes no fetch and doesn't wait; a failed task doesn't break the queue. Debounce at 600 ms. Error mapping: 429 → RateLimited (not cached), `navigator.onLine=false` → Offline with no fetch, fetch `TypeError` → Offline, 4xx/5xx → Upstream, invalid JSON → Upstream, NotFound not cached, invalid queries make no fetch. The query is sent only in `q=` with `credentials: 'omit'`. |
| `tests/unit/qa-pure.test.ts` | 125 | **new** | `filterOffers`: `"*"` matches every country, `both` appears in both tabs, non-canonical codes (`in`, `IND`, `' IN'`, `*`…) are treated as no country, order is kept and input isn't mutated, empty cases. `monthInfo` across the year boundary (Dec birthday seen in Jan = 11 months; Jan seen in Dec = next month; 31 Dec 23:59:59 vs 1 Jan), all 144 (birth, current) pairs, invalid input. `isStale`: exactly 6 months vs +1 ms, crossing the year, future dates, invalid dates. `directionsUrl`: 6 dp rounding, `-0` → `0`, clamping (including `±1e9` and `MAX_VALUE`), rejects NaN, ±Infinity, string, null and undefined, strict output shape. `safeHttpsUrl`: 33 rejections (`javascript:` with leading whitespace, embedded tab or newline, or mixed case; `data:`, `vbscript:`, `file:`, `blob:`, `ws(s):`, `http:`; credentials incl. `user@`, `:pass@`, `a@evil`; protocol-relative `//`, ` //`, backslash forms, `about:`, `mailto:`, `tel:`), normalisation cases, and an invariant check (always https with no credentials). `displayHost`. `cleanDisplayText`. Hardening of `validateLiveResults` (junk-only titles, nested junk, `__proto__`). `workerBaseUrl` and `liveSearch` with no Worker configured. Overpass coordinate edge cases. Templates: FNV-1a reference values, `{brand}` exactly once per template, hash-selected line independent of call order, unknown category falls back to `retail`, brand inserted literally. |
| `tests/unit/offers.test.ts` | 30 | — | existing |
| `tests/unit/overpass.test.ts` | 9 | — | existing |
| `tests/unit/render.test.ts` | 9 | — | existing |
| `tests/unit/security.test.ts` | 78 | — | existing (Security) |
| `tests/unit/urls.test.ts` | 17 | — | existing |
| `worker/test/worker.test.ts` | 27 | — | existing |
| `worker/test/worker.qa.test.ts` | 20 | **new** | OPTIONS preflight from 4 disallowed origins (incl. `…github.io.evil.example`, `null`, `http:`) → 403 with no ACAO/ACAM and no upstream call. POST, PUT, DELETE and PATCH → 405 with `Allow: GET, OPTIONS` and no upstream call, and a 405 from a foreign origin gets no CORS. 6 non-`/search` paths → 404 JSON with `nosniff`. Missing key → 503 with a generic body and no upstream call. Upstream network error, timeout, 401, 429 or non-JSON 200 → generic 502 that never echoes the key, stack, quota or status. Rate limit: 3rd call → 429 with `Retry-After: 60`, keyed by `CF-Connecting-IP`, no upstream call. An extra `city=` param → 400 before any upstream call. |
| `tests/e2e/smoke.spec.ts` | 3 × 2 | — | existing; reviewed per the UI/UX request and OK |
| `tests/e2e/harness.ts` | — | **new** | Auto fixture used by every QA e2e test. It fails the test on any unexpected external request (page-level mock list plus a context-level catch-all), any JS dialog, any `securitypolicyviolation` (captured by an init script), any `navigator.geolocation.getCurrentPosition/watchPosition` call (wrapped by an init script), any uncaught page error, and any console error. The only console exception is the browser's own "Failed to load resource" line, which a test must opt into explicitly for the 429, 504 or aborted response it mocks on purpose. Helpers: `axeViolations` (waits for CSS transitions to settle first), `expectNothingPersisted`, `expectLocationOnlyToNominatim`. **I checked that the harness actually fails** for an unknown host, an unmocked page, `alert()`, a geolocation call and an inline `<script>` (throwaway spec, deleted). |
| `tests/e2e/qa.spec.ts` | 14 × 2 | **new** | See below. |

**E2E scenarios in `qa.spec.ts`.** Every scenario runs on desktop Chromium and Pixel 7, except the keyboard test (desktop only).
- **Happy path:**
  - map + center star + 4 branch pins
  - Nearby count derived from `offers.json`
  - Tata Starbucks directions `href` is **exactly** `https://www.google.com/maps/dir/?api=1&destination=12.975,77.6`, with `target=_blank` and `rel` ⊇ {noopener, noreferrer}
  - every directions link matches the strict format
  - every Verify link is https, `_blank`, `noopener noreferrer`
  - the popup directions link is identical
  - checking a quest gives `.is-done`, `body > .confetti` with pieces, and the live-region text; the confetti is then removed
  - after `reload()` and a new search, no card is done or checked
  - axe on the initial page and on the results
- **Reduced motion** (`reducedMotion: 'reduce'`): done state and announcement work, and **no** `.confetti` element appears.
- **Errors:**
  - place not found (with axe on the error state)
  - Nominatim 429 → "a bit busy", and the button is re-enabled
  - `context.setOffline(true)` → offline message, and **zero** external requests
  - Nominatim `route.abort('internetdisconnected')` → offline message
  - Overpass 504 → all quests listed, 0 branch pins, center star present, no directions buttons
  - geocode to `fr` (no offers) → status and the Nearby empty state both point to the **Online tab**, Overpass is **never** called, and the Online tab preselects FR with a friendly empty state (axe run here)
- **Online tab without a city:**
  - The worldwide view is checked, then IN (Nykaa present, no directions), then US. Counts are derived from `offers.json`. axe runs here.
  - Picking a month and opening Found online makes the only external request `https://bsq-worker.e2e.example/search?month=10&country=US`. axe runs here too.
- **XSS, Found online:** the Worker fixture includes `<img src=x onerror=…>`, `<script>`, `<svg onload>`, an `<iframe src=javascript:>` snippet, `javascript:` and `data:` URLs, and U+202E/U+202C in the title and source.
  - Only 3 cards render (javascript: and data: are dropped).
  - The text shows literally, and the bidi characters are stripped ("Free cake moc.live").
  - The page has 0 `img[src=x]`, 0 img/svg/iframe/script in the list, 0 `on*` attributes anywhere, and an unchanged `<script>` count. No dialog opens.
- **XSS, location input:** I typed `"><img src=x onerror=alert(1)>`, `<svg onload=alert(1)>` and a `javascript:…<script>` polyglot.
  - The mocked Nominatim echoes `q` into `display_name` and adds RLO + `<img…>`. The Overpass `name` is `<svg onload=alert(8)> Starbucks`.
  - All of these render as text in the status, "Nearest: …", the directions `aria-label` and the map popup.
  - No injected elements, no `on*` attributes, no dialogs.
- **CSP:**
  - The served HTML has the CSP `<meta>` before any `<script>`.
  - It has no `unsafe-inline`, `unsafe-eval`, `unsafe-hashes`, `strict-dynamic` or `*`.
  - `script-src`, `style-src`, `object-src` and `base-uri` are exact, and so is `connect-src` (self, Nominatim, Overpass, Worker).
  - There is no inline script, `<style>`, `style=""` or `on*=`.
  - The live DOM meta equals the served one.
  - The harness records zero `securitypolicyviolation` events in every test.
- **Privacy** (happy path, Online tab and every harness test):
  - URL unchanged, with no query or hash.
  - `localStorage`, `sessionStorage`, `document.cookie`, `context.cookies()`, `indexedDB.databases()` and `caches.keys()` are all empty.
  - The location string (raw, URL-encoded and `+`-encoded) appears **only** in Nominatim requests.
  - Overpass is a POST whose `around:` clauses contain only radius,lat,lng.
  - The Worker gets only `?month=&country=` (with exact key order and patterns) and no body.
  - Tiles are `/{z}/{x}/{y}.png` with no query.
  - Any `Referer` on an external request is origin-only, and no request carries a `Cookie`.
- **Geolocation:** zero calls, asserted in every test.
- **Keyboard only:**
  - Tab ×2 reaches the city input; type the city; Tab to the month; type-ahead "Oct" → October; Tab to the submit button; Enter.
  - Tab to the tablist. ArrowRight goes to Online and then Found (panels switch), wraps back to Nearby, and End, ArrowLeft and Home also work.
  - Tab into the panel to the first quest checkbox. Space checks it (`.is-done`), and Space again unchecks it.
- **375 px:** no horizontal overflow (`scrollWidth − clientWidth ≤ 0` for both `documentElement` and `body`) on the initial page, the results, the Online tab and the Found online tab.

**axe:** I ran it on the initial page, the results, the error state, the empty state, the Online tab and Found online. **0 violations total** (all impacts), on both projects.

### Bugs found
| ID | Severity | Owner | Repro | Status |
|---|---|---|---|---|
| QA-01 | Low | Full-Stack | `parseNominatim([{lat:'', lon:'2', address:{country_code:'in'}}])` (also `null`, `' '`, `true`, `['1']`) returned a place at lat **0**, because `Number('') === 0` ("Null Island"). The same happened in `parseOverpass` with `lat: null` (or `''`, `true`), which created a pin at 0,0 with a directions link there. | **Fixed** (`src/geocode.ts` `toCoord()`: number or non-blank string only; `src/overpass.ts`: Overpass coordinates must be JSON numbers). 11 new unit tests fail on the old code and pass now. |
| QA-02 | Low | Full-Stack | Nominatim hit with an empty or missing `display_name` and `name` gave `label: ''`, so the status read "…shops on the map near ." | **Fixed** (`geocode()` falls back to the normalised query the user typed; it stays in the tab). Covered by a unit test. |
| QA-03 | Low (UX copy) | UI/UX | Open the Online tab with "Worldwide offers only" selected. The shipped data has no `"*"` offers, so the empty state said *"No online birthday quests for this country yet — try 'Worldwide offers only'"*, pointing the user at the option they already had selected. | **Fixed** (`src/main.ts` `renderOnline()`: with no country it now says "No worldwide online quests yet — pick your country above to see deals you can claim online 💻"; the per-country copy is unchanged). Covered by e2e. **UI/UX: please review the wording.** |
| QA-04 | Info | Orchestrator / research | `public/offers.json` has **no** `countries: ["*"]` entries, so "Worldwide offers only" is always empty. That is consistent with the research (all offers are country-specific), but the Online tab's default view is therefore always an empty state. | Open (data decision). Consider defaulting the country select to the geocoded country or the browser locale region (no network involved). |
| QA-05 | Info | Full-Stack | `geocode()` maps only `TypeError` to Offline. Any other rejection (e.g. an `AbortError` if a timeout is added later) would surface as the generic "Something went wrong". This can't happen today because geocode has no abort signal. | Open (no action needed now). |
| QA-06 | Info | — | `directionsUrl` rounds with `toFixed(6)`, so binary-float ties go down (`151.2092955` → `151.209295`). That's an 11 cm difference. | Accepted, not a bug. |

**Notes:**
- **Test artifact, not a product bug.** axe on Pixel 7 once flagged `color-contrast` on `#tab-online`/`#tab-found`. It sampled colours during the 150 ms tab `transition`. The harness now waits for running CSS animations before axe; steady-state contrast passes, matching the UI/UX table.
- **Keyboard submit.** Enter on a focused `<select>` doesn't submit a form in browsers, which is standard. The keyboard test therefore tabs to "Find my quests" and presses Enter. Enter in the city input also submits.

### Files changed by QA
- **New:**
  - `tests/unit/geocode.qa.test.ts`
  - `tests/unit/qa-pure.test.ts`
  - `worker/test/worker.qa.test.ts`
  - `tests/e2e/harness.ts`
  - `tests/e2e/qa.spec.ts`
- **Edited (small fixes):**
  - `src/geocode.ts` (QA-01, QA-02)
  - `src/overpass.ts` (QA-01)
  - `src/main.ts` (QA-03)
- **No security controls were touched:** CSP, `dom.ts`, the sanitisers, the Worker and CI are unchanged.

### Still to do after deploy
These are outside QA's local scope:
- Smoke-test the live Pages URL: console free of CSP errors while zooming the map.
- Real Worker: `curl -H 'Origin: https://evil.example'` → 403.
- First GitHub Actions run green, including the separate `lighthouse` job.

---

## Full-Stack: autocomplete + radius

Branch `feat/autocomplete-more-offers`. Nothing committed. See DECISIONS #16 and #17.

### What changed
- **Location autocomplete (Photon).**
  - `src/autocomplete.ts` holds the data side:
    - `parsePhoton` is a strict parser. Coordinates must be finite and in range (GeoJSON `[lng,lat]`), the country must be ISO-2 (uppercased), and every string goes through `cleanDisplayText`. It caps at 5 and dedupes labels.
    - `buildPhotonUrl` sends `q`, `limit=5`, `lang=en` and `layer=city|district|locality`, with no coordinates.
    - `createSuggester` debounces for 300 ms, needs at least 3 characters and accepts at most 120. It aborts the previous request on each keystroke, keeps an in-memory cache of up to 100 entries and times out after 5 s. Errors mean no suggestions.
  - `src/render/combobox.ts` is the UI, a WAI-ARIA 1.2 combobox with a listbox:
    - The listbox is built with `el()` only.
    - ArrowUp and ArrowDown wrap. Enter selects the active option; with none active, the form submits normally. Escape, Tab, blur and an outside pointerdown all close the list.
    - A `mousedown` preventDefault avoids the blur race.
    - `#suggest-live` gives polite announcements, deduplicated.
    - The footer reads "Suggestions by Photon · © OpenStreetMap".
  - `src/main.ts`:
    - A picked suggestion goes straight to `runSearch(place)` and **skips Nominatim**.
    - If no month is set yet, it asks for the month and keeps the picked place until the input text changes.
    - Free text plus Enter or "Find my quests" uses the Nominatim path as before.
  - CSS lives in `components.css` (`.combo`, `.ac-*`):
    - absolute popup, so there is no layout shift; z-index 1100 keeps it above Leaflet;
    - options at least 48 px tall, with an active option in lavender fill, a focus-coloured ring and ink text;
    - the pop animation is turned off under reduced motion.
- **Search radius.**
  - `#radius` select: 2, 5 (default), 10 or 20 km.
  - `overpass.ts` adds `clampRadius`, `maxBranchesFor` (60 up to 5 km, 150 above) and `MAX_BRANCHES_WIDE`. The parse cap follows `out center N`, and `fetchBranches(..., fetchImpl, radiusM)` passes the radius through.
  - Changing the radius re-runs the lookup for the current place.
  - The map draws a dashed radius circle (`.map-radius`) and fits to it, then to the pins.
- **Nearby ordering.** `renderNearbyList` puts quests with a branch first, sorted by distance, each with "x km away" (`.quest-card__distance`). The rest go under `h3.quest-group__heading` "More quests in <Country> (no branch found within N km)". Nothing is hidden.
- **Security and privacy.**
  - `csp.config.ts` adds `https://photon.komoot.io` to connect-src only, and `public/_headers` is updated to match. A unit test asserts that the `_headers` CSP equals `buildCsp()` and that Photon appears only in connect-src.
  - PRIVACY.md (table row, komoot privacy link), SECURITY.md (diagram, STRIDE S2/T1/I1/D2/D3, CSP, limitations) and the footer attribution are updated.

### Tests
- **Unit:** new `tests/unit/autocomplete.test.ts` covers:
  - the parser: valid, malformed, XSS, bidi, range, country code, caps, dedupe;
  - the URL;
  - the suggester with fake timers: debounce, min length, abort and stale drop, cache, cancel, 500/bad JSON/network errors, timeout.
  - `overpass.test.ts` adds radius, cap and request-body tests.
- **E2E:** new `tests/e2e/autocomplete.spec.ts`. The fixtures mock `photon.komoot.io`. The harness privacy check now allows typed text only to Nominatim or Photon, and Photon may get only `q/limit/lang/layer` over GET. Tests:
  - suggestions with axe on the open listbox;
  - ArrowDown+Enter picks with no Nominatim call;
  - click or tap, with tap targets of at least 44 px;
  - picking before the month is set;
  - Escape, Tab and outside click, then free text plus Enter uses Nominatim;
  - XSS through Photon;
  - Photon 500 falls back to Nominatim;
  - radius `around:10000` / `around:20000` plus distance sorting and grouping, with axe.
  - The keyboard test in `qa.spec.ts` now tabs month → radius → submit. The CSP e2e regex includes Photon.

### Results
- `npm run build`: OK.
- `npm test`: 406 passed.
- `npm run test:e2e`: 46 passed, 4 skipped (desktop-only keyboard tests on mobile). The autocomplete spec was also run with `--repeat-each 3` and was green.
- `npm run lhci`: performance, a11y, best practices and SEO all 1.00 on all 3 runs.
- `npm audit --audit-level=high`: 0 vulnerabilities.

### Manual check against the real services (`npm run preview`, built-in browser)
- **Typing "Koraman":** one Photon request (`…?q=Koraman&limit=5&lang=en&layer=city&layer=district&layer=locality`, 0.5 s), no CSP errors. It returned 5 options, including "Koramangala · Bangalore South, Karnataka, India", and the live region announced "5 suggestions available".
- **Pick with 10 km radius:** ArrowDown×4 + Enter picked Koramangala. There was no Nominatim request. Overpass took 4.6 s. Result: 8 quests and 121 shop pins within 10 km. Cards were sorted from Tanishq at 170 m to The Body Shop at 4.2 km.
- **Switch to 20 km:** 9.1 s, 146 pins.
- **Console:** empty.
- **375 px:** no horizontal overflow, the popup is full width, and options are 57–74 px tall.

### For Security / QA
- New origin `photon.komoot.io` (connect-src only). Please review `src/autocomplete.ts`, `src/render/combobox.ts` and the `I1`/`D2` rows.
- **The branch cap is not distance-sorted.** At 20 km in central Bengaluru the 150 cap is nearly reached (146 pins), and Overpass output order is by OSM id. Far-off branches can therefore displace nearer ones, so "nearest" is nearest among those returned.
- Photon results ignore `lang=en` for some local names (for example Japanese POIs). That is cosmetic.
- `aria-controls="city-suggestions"` is in the static HTML. The listbox is created by JS at startup, and axe was clean.

---

## Full-Stack: city-only, all countries, session persistence, claim details (2026-10-02)

Branch `feat/autocomplete-more-offers`. Nothing committed. See DECISIONS #18, #19 and #20. I didn't touch `research/`, `public/offers.json` or `docs/design/`.

### What changed
- **City-only input (#19).**
  - The label is now "Your city", with placeholder "e.g. Bengaluru".
  - Photon is called with `layer=city` only, and `parsePhoton` also drops any feature whose `type` isn't `city`.
  - Nominatim free text gets `featureType=city`.
  - Live probe results:
    - `layer=city` gives good results for Beng, Manch, Pune and Kyo.
    - `osm_tag=place:*` loses Manchester, UK, so it's not used.
    - NYC's Brooklyn is `place=suburb`, so autocomplete shows the US towns called Brooklyn instead. Enter on "Brooklyn" still resolves to Brooklyn, NY through Nominatim.
- **All countries (#20).**
  - New `src/countries.ts` lists all 249 ISO 3166-1 alpha-2 codes, named with `Intl.DisplayNames`.
  - The Online select puts countries with online quests first, in an optgroup with a count, e.g. "India (28)". Every other country follows. Worldwide `"*"` offers are still included for any selection.
  - `onlineCounts()` is in `src/offers.ts`.
  - `el()` now allows the plain-text `label` attribute, for `<optgroup>`.
- **Auto-sync.**
  - Picking or searching a city sets the Online country and immediately re-renders Online. Found online also refreshes when that tab is open.
  - The Online tab shows a count pill (`#online-count`). Its accessible name is "Online 28 quests".
- **Session persistence (#18).**
  - New `src/session.ts` is the only module that touches storage, and a unit test enforces this.
  - It uses one `sessionStorage` key, `bsq-session`, holding `{v, city, lat, lng, countryCode, month, radius, tab, done}`. The record is validated strictly on load and on save.
  - A record is only written once the user does something (search, month, radius, tab, country or done).
  - A reload restores the inputs, tab and done state, then re-runs Overpass from the stored coordinates without calling Nominatim or Photon.
  - The **Clear search** button wipes the record and resets the page. `MapView.reset()` was added for this.
  - Done-state API in `render/quests.ts`: `doneIds`, `setDoneIds`, `onDoneChange`.
- **Claim details.**
  - New optional `Offer` fields: `rewardItem`, `steps`, `purchaseRequired`, `minSpend`, `signupLeadDays`, `validFor`, `bring`.
  - They are validated strictly. A present but invalid field rejects the whole entry.
  - Cards show "You get: …", an `<ol>` of steps inside the "How to claim" `dd` (instead of `howToClaim`), and a chip list (`ul.claim-chips`, labelled "Before you go to <brand>").
  - Old entries render as before.
  - All 102 entries in the current `offers.json` validate.
- **No em dashes.**
  - Removed from `src/` (strings, templates and comments), `index.html`, README, SECURITY, DECISIONS, PLAN, OFFER_RESEARCH, `_headers`, `csp.config.ts`, `check-links.mjs` and the Worker header comment.
  - Copy changes include "Unverified: check the link" and "Varies (check the terms)".
  - Older HANDOFFS entries are left as historical.
- **Docs.**
  - PRIVACY has a new "Your search in this tab" section.
  - The new UI privacy note is in index.html, PRIVACY and README.
  - SECURITY: intro and I1 row.
  - CONTRIBUTING: the storage rule, plus documentation for the new offer fields.
  - DECISIONS #18 to #20.
- **CSS.** Minimal and token-only: `.session-row`, `.btn--small`, `.tab__count`, `.quest-card__reward`, `.quest-card__steps`, `.claim-chips`.

### Tests
- **New unit tests:**
  - `session.test.ts`: schema rejections, including HTML, bidi, extra keys and `__proto__`, plus blocked storage.
  - `countries.test.ts`.
  - `claim-details.test.ts`: validation, chips, rendering and XSS in every new field.
  - `copy.test.ts`: em dash and spaced en dash in `src/` and `index.html`. It also has **"PENDING DATA CLEANUP (orchestrator): public/offers.json…"**, which currently **passes**, because offers.json is already clean.
- **Updated unit tests:**
  - autocomplete: city layer, and the city-type filter.
  - geocode: `featureType`.
  - security: `sessionStorage` is allowed only in `src/session.ts`; localStorage, IndexedDB and cookies are still banned everywhere.
  - render: copy.
- **E2E:**
  - New `session.spec.ts` covers the label, picking Pune, auto-sync and count, `page.reload()` restore with no geocoder calls, Clear search, `featureType=city` plus Found online sync, the all-countries list (Japan), tampered storage being rejected, and claim details from real data.
  - The harness has a new contract helper, `expectOnlySessionRecord`. The happy path now checks that a refresh restores and that Clear search wipes.
  - The no-offers test moved from Paris to Kyoto, because FR now has an offer.
  - The Photon fixtures are city-only now (Pune and Benguela replace Koramangala and Bengkulu).

### Results
- `npm run build`: OK.
- `npm test`: 554 passed.
- `npm run test:e2e`: 58 passed, 4 skipped (desktop-only keyboard tests). The reload tests were green with `--repeat-each 3`.
- `npm run lhci`: assertions pass. Performance was 0.99 and a11y, best practices and SEO were all 1.00.
- `npm audit --audit-level=high`: 0 vulnerabilities.

### Manual check against the real services (`npm run preview`, built-in browser)
- **Pick:** typing "Pune" gave 5 city suggestions. I picked Pune, Maharashtra. Online switched to IN and showed "28 quests". The search found 31 quests and 19 pins within 5 km. I ticked adidas-in.
- **Reload:** the city, month, IN and the done tick were all restored. There were 0 Nominatim or Photon requests and 1 Overpass request, and the console was clean.
- **Clear search:** emptied sessionStorage.
- **Free text:** typing "Kyoto" + Enter sent a Nominatim request with `featureType=city`, set the Online country to JP and showed the no-quests status.

### For Security / QA / UI-UX
- **Security:** please review `src/session.ts`, the `label` attribute added to the `el()` allowlist, and the I1 row.
- **UI/UX:**
  - The Online `<select>` now has 250 options, so axe takes about 8 s on it.
  - The new pieces are styled minimally and need the planned restyle: count pill, Clear search button, claim chips and steps list.

---

## UI/UX: soft premium port (2026-10-02)

Branch `feat/autocomplete-more-offers`, not committed by me (a "WIP: port soft premium redesign" snapshot commit already exists; everything after it is in the working tree). Ports the approved prototype in `docs/design/` with the **plum** accent. See DECISIONS #21.

### What changed
| Area | Change |
|---|---|
| Fonts | `@fontsource-variable/bricolage-grotesque@5.3.0` + `@fontsource-variable/plus-jakarta-sans@5.3.0` (exact pins, lockfile updated); Fredoka and Nunito removed. `src/styles/fonts.css` declares only latin + latin-ext faces (Bricolage "opsz" build, Jakarta "wght" build), `font-display: swap`, self-hosted, `assetsInlineLimit` still 0. Shipped woff2: 77 + 31 KB (Bricolage), 27 + 22 KB (Jakarta); a page with Latin text only downloads the two latin files. No preload (not needed for perf). |
| Tokens / CSS | `tokens.css`, `base.css`, `components.css` rewritten from `prototype.css`: porcelain neutrals, plum accent block, radius rule, tinted shadows, motion tokens. Map tile tint via the DESIGN.md filter recipe on `.leaflet-tile-pane`; Leaflet zoom + new recenter control styled as one white pill (44px buttons); popups restyled (`.bsq-popup`). |
| Icons | `src/render/icons.ts`: the prototype's SVG set (pin, calendar, radius, search, arrow, check, lock, alert, clock, bag, gift, qr, sparkle, plus, minus, locate, close, chevron, globe, refresh, id) plus candle logo, toast candle, empty-state art, pin teardrop, claim tick, and `initials()`. All via `svg()` / `createElementNS`, `aria-hidden`, no innerHTML. |
| Emoji / copy | Every emoji removed (index.html, templates, status lines, badges, empty states, toast, tabs, combobox, map popup). Quest templates rewritten as plain "where to claim" lines used as the card meta when there's no nearby branch. `monthInfo` labels: "It's your birthday month" / "Your birthday month starts next month" / "...in N months". No em dashes, no exclamation marks. New unit test fails on any emoji in `src/` or `index.html`. |
| Header | Line-art candle logo (`#site-mark`); flame is a dashed outline until the first claim, then fills plum with glow + 3.2 s flicker (`body.is-lit`), with a 700 ms ignite on each claim. "How it works" / "Privacy" in-page links (desktop) to new footer sections. h1 is still "Birthday Side Quests". |
| Search panel | City (pin icon, combobox), Birthday month (calendar + chevron), **Search radius as a radio group** (`fieldset`/`legend`, 4 radios 2/5/10/20 km styled as a segmented pill, arrow keys work natively, same re-run behaviour), Find my quests (orb), Clear search, privacy line with lock. `#status` (the single `role=status`) sits under the form: errors in warn colour with an alert icon, loading with a pulsing dot, success **visually hidden** (spoken; the results header shows the summary). Invalid city sets `aria-invalid` + `aria-describedby="status"` and a warn edge. Changing month or radius cancels pending suggestions. |
| Autocomplete | Floating 18px-radius list, 52px options, pin icon (accent when active), typed prefix in bold (`<b>` text node), region line in ink-3, 180 ms fade/drop. Footer text unchanged. |
| Results header | Birthday-month pill (`#month-info`, accent tint + sparkle in the birthday month, neutral + calendar otherwise), h2 "Your October quests", summary "37 quests in total. 18 within 5 km of Bengaluru." (or why pins are missing), progress ring "N of M claimed" (`#progress`, plain text, ring is `aria-hidden`; M = unique offers listed in Nearby + Online). |
| Tabs | Segmented track with a sliding white thumb (`--tab-index`/`--tab-count` set with `style.setProperty`), count chips on all three tabs (`#nearby-count`, `#online-count`, `#found-count`; accessible names like "Nearby 31 quests", "Found online 2 results"). WAI-ARIA tablist + arrows/Home/End unchanged. |
| Quest card | Mono initials tile, brand h3, meta (branch name · "1.2 km away", or a plain where-to-claim line), badges (Verified / Check with store / May be outdated), "You get" tint panel (rewardItem as headline, full offer text under it), condition chips with icons, numbered steps with connector line, footer (Get directions pill with orb, Verify offer link, round claim checkbox), fine print "Last checked 2 Oct 2026 on starbucks.in". Claim checkbox: `aria-label="Mark claimed: <brand>"`; visible text switches "Mark claimed" → "Claimed". Checking one card syncs every card of that offer (Nearby + Online) and the map pins. Mobile: full-width 52px claim row. |
| Celebration | `render/confetti.ts`: check draw (CSS) + 0.82→1.08→1 spring (WAAPI), 12 deterministic paper strips (`.confetti__piece`) fanned over 136° via WAAPI, ring fill (900 ms), candle ignite, card wash, dark toast "X claimed. N of M done." (aria-hidden; the same text goes to `#celebrate-live`). Reduced motion: no strips, no movement, states and toast text still appear. |
| Map | White teardrop pins with plum initials, active pin filled + scaled 1.18, claimed pin tint + check, searched place = ink dot with halo, dotted plum radius circle, recenter control, "Map couldn't load" notice with Try again when no tile loads. Clicking a pin marks the matching card active (and scrolls it into view on desktop). |
| States | Empty (candle-in-ring art + title + actions, e.g. "See online quests"), error (warn icon), loading skeletons matching the card, "No shops within 2 km yet" notice with "Widen to 5 km". Online tab country select (globe + chevron, optgroups kept), Found online cards with globe tile and "Unverified: check the link" badge. |
| Layout | Mobile first: search → results head → map → tabs → cards; ≥1100px two columns with a sticky map. No horizontal scroll at 375/390px. |

### Tests changed (equivalent or more coverage)
- `getByLabel('Quest complete!')` → `getByLabel('Mark claimed')`; celebration test now also checks 12 strips, the toast text, `body.is-lit` and `#progress-count`; reduced-motion test checks end states (toast, ring, candle) and no strips.
- Radius: `getByLabel('Search radius').selectOption(...)` → `getByRole('radio', { name: '10 km' }).check()`; keyboard flow now Tabs over the two header links and checks ArrowRight/ArrowLeft inside the radio group.
- XSS tests: `svg` → `svg:not(.icon)` in `#found-list` / `#city-suggestions` (our own aria-hidden icons are allowed; the autocomplete test also asserts every icon is aria-hidden with no `onload`). Option text no longer starts with 📍. Branch name check no longer has the "Nearest: " prefix.
- `smoke.spec.ts` waits for finite animations before axe (cards fade in now).
- Overpass 504 test asserts the header explains missing pins.
- Unit: claim-details (structure of "You get", no emoji, icons aria-hidden), render (initials, date format, `icon()`, claim label, card sync), copy (no emoji), monthInfo labels.

### Results
- `npm run build`: OK. `npm test`: 561 passed. `npm run test:e2e`: 58 passed, 4 skipped (desktop-only keyboard tests on mobile). axe: 0 violations in every axe step.
- `npm run lhci` (3 runs): Performance 0.99, Accessibility 1.0, Best Practices 1.0, SEO 1.0; LCP 2.0 s, CLS ≤ 0.01, TBT 0 ms.
- `npm audit --audit-level=high`: 0 vulnerabilities.

### Screenshots (real app, `vite preview` of the e2e build; Nominatim/Overpass/Worker mocked like `tests/e2e/fixtures.ts` with a few extra Bengaluru branches; real OSM tiles allowed for realism)
- `docs/screenshots/desktop.png` (1440×900): results, 2 claimed, Starbucks pin active with popup. Compare `docs/design/proto-accent-plum.png`.
- `docs/screenshots/claimed.png` (1440×900): celebration frozen mid-flight (strips, toast, ring). Compare `docs/design/proto-done.png`.
- `docs/screenshots/online-tab.png` (1440×900): Online tab with the country select.
- `docs/screenshots/mobile.png` (390 wide @2x, top 3200 CSS px). Compare `docs/design/proto-mobile.png`.
Known differences from the prototype: label "Your city" (DECISIONS #19), four radius options, real OSM tiles instead of the hand-drawn map art, cards show branch names instead of street addresses (Overpass gives no address).

### Manual check against the real services (`npm run preview`, built-in browser)
Typed "Beng" → 5 Photon suggestions with bold prefix; picked Bengaluru (October). First Overpass call returned 504 twice (upstream overload) → status and header said pins didn't load, quests still listed. Reload restored city, month, radius, tab and claimed quest from sessionStorage and re-ran Overpass from coordinates: 31 quests, 60 pins, 18 within 5 km. Claim → 12 strips, toast "Third Wave Coffee claimed. 2 of 37 done.", candle lit, 9 Third Wave pins switched to the check. Pin click opened the popup and highlighted the Tata Starbucks card. Console: only the browser's own "Failed to load resource: 504" lines from Overpass; no app errors, no CSP violations.

### Contrast (WCAG 2.x, relative-luminance formula)
| Foreground | Background | Ratio | Use |
|---|---|---|---|
| `--ink` #221B1F | `--bg` #FAF7F5 / white | 15.82 / 16.87 | body text |
| `--ink-2` #5E5459 | bg / white / `--sunken` #F3EEEB / `--accent-tint` #F2E7F0 | 6.82 / 7.27 / 6.32 / 6.05 | labels, secondary, "You get" detail |
| `--ink-3` #71666B | bg / white / sunken / accent-tint | 5.16 / 5.50 / 4.78 / 4.58 | meta, fine print, claimed steps/chips |
| white | `--accent` #6B2D5E / hover #5A2450 / active #4A1D42 | 9.71 / 11.65 / 13.59 | buttons, count chips, active pin |
| `--accent` | white / bg / sunken / accent-tint | 9.71 / 9.11 / 8.44 / 8.08 | links, pin initials, icons |
| `--accent-ink` #5A2450 | accent-tint / accent-tint-2 #E6D2E2 | 9.69 / 8.14 | "You get" label, birthday pill, "Claimed" |
| `--ok` #2E6A4C | `--ok-tint` #E8F1EB | 5.55 | Verified |
| `--warn` #82560F | `--warn-tint` #FBF0DA / white / bg | 5.65 / 6.39 / 5.99 | Check with store, Unverified, field errors |
| bg #FAF7F5 | `--ink` | 15.82 | toast |
| UI: `--line-control` #958A8F | white / bg | 3.33 / 3.12 | input, checkbox, ghost button edges |
| UI: selected thumb edge `--ink-3` | track `--sunken` / thumb white | 4.78 / 5.50 | radius + tabs selected state (DESIGN.md open point; `--line-control` would be only 2.89 on the track) |
| UI: focus ring `--accent` | bg / white | 9.11 / 9.71 | all focusable elements (2px gap + 2px ring) |
| UI: pin stroke `--accent` | map land #F1ECE9 | 8.29 | pins |
Claimed cards dim chips and steps by switching to `--ink-3` (not opacity), so they stay AA.

### For Security
- No new origins; CSP unchanged. No `style=""` in markup, no innerHTML. Dynamic styling only via `style.setProperty` (`--tab-index`, `--tab-count`, `--progress`, `--enter-delay`) and WAAPI keyframes (strips, toast, checkbox spring).
- New DOM built only with `el()` / `svg()`. The combobox bolds the typed prefix with an `el('b')` text node. Leaflet gets DOM nodes for icons/popups and a new `L.Control` built with `el()`.
- `el()`/`svg()` allow-lists unchanged.
- Fonts are referenced from `node_modules` by relative path in `fonts.css` and emitted as hashed same-origin assets (`font-src 'self'`).

### For QA
- The radius is now a radio group (`input[name=radius]`, ids `radius-2000` … `radius-20000`); tests use `getByRole('radio', { name: 'N km' })`.
- `#status` success text is visually hidden but still in the accessibility tree (tests unchanged).
- Watch: the tile-failure notice (`.map-notice`) has no e2e test yet (tiles are always mocked as success); it was checked manually by forcing tile 503s.

---

## Security review: PR #3 (2026-10-02)
Scope: `git diff origin/main...HEAD` (autocomplete + radius, city/countries/session/claim details, soft premium port) plus working tree. Reviewed `src/**`, `csp.config.ts`, `public/_headers`, `public/offers.json`, `package.json`/lockfile, built `dist/index.html`, PRIVACY.md and SECURITY.md. `.github/` and `vite.config.ts` are unchanged since main.

### Findings
| ID | Severity | File:line | Issue | Fix | Status |
|---|---|---|---|---|---|
| PR3-1 | Low | `src/offers.ts:55-79,90` | The `nameRegex` charset blocks `*`, `+`, `{}` but not stacked `?` or alternation groups, e.g. `a?a?…a?aaa…` (≤100 chars) backtracks exponentially in `RegExp.test` on every Overpass branch name. SECURITY.md D3 claimed ReDoS was avoided. Needs a malicious `offers.json` PR to pass review; all 87 shipped patterns are linear (max bound 16). | New `nameRegexBranching()` bound (2 per `?` × alternatives per group, top level included); `validateOsm` rejects anything over 1024. | Fixed + tested |
| PR3-2 | Low (defence in depth) | `src/render/dom.ts:85-101` | `svg()` checked attributes but accepted any tag name, so `svg('script' / 'a' / 'use' / 'foreignObject' / 'animate' / 'set')` would build. Only constant callers today, so not exploitable. | Tag allowlist: `svg g path circle ellipse rect line polyline polygon`. | Fixed + tested |
| PR3-3 | Info | `src/autocomplete.ts` | Photon receives partial typed text before submit; a user typing a street address discloses it to komoot. Documented in PRIVACY.md (partial text) and now in SECURITY.md I1 residual risk. | Docs only. | Accepted |
| PR3-4 | Info | SECURITY.md T1/T4/I1/D3 | Rows did not mention `svg()`, the `label` attribute, exact-pinned `@fontsource-variable` packages, fixed Photon params, or the regex bound. | Rows updated. | Fixed |

### Verified OK (no change needed)
- **Photon:** `connect-src` only (no img/script/font); params fixed to `q`, `limit=5`, `lang=en`, `layer=city`; no coordinates/bias; `credentials: 'omit'`, `strict-origin` referrer, CORS-safelisted `Accept` only; `parsePhoton` validates finite in-range coords, ISO-2 country, `type === 'city'`, cleans and caps every label part.
- **Session storage:** only `src/session.ts` touches storage (grep + new unit scan over `src/**`); no localStorage/IndexedDB/cookies/URL/history writes. Load is size-capped (16 KB) before `JSON.parse`, exact key set (so `__proto__`/extra keys fail), version, ranges, ISO-2, radius from the list, tab enum, unique offer ids, no `<>`/control/bidi in the city; invalid records are removed. Restored values go to `input.value`, `textContent`, numeric Overpass params and an ISO-2 select; no injection path.
- **Claim-detail fields** (`rewardItem`, `steps`, `minSpend`, `validFor`, `bring`, `signupLeadDays`, `purchaseRequired`): strict types, list/length caps, control/bidi rejection; rendered only as text via `el()`. `offers.json`: 102 offers, all `sourceUrl` https without credentials, no `<`, `>`, `javascript:` or invisible characters.
- **`el()` `label` attribute:** set with `setAttribute` as an inert string; safe.
- **Combobox prefix bolding:** `el('b', {}, [text])` + text node; no HTML.
- **CSP/build:** `dist/index.html` has one external module script, one stylesheet link, no inline `<script>`/`<style>`/`style=`/`on*=`; meta CSP matches `csp.config.ts` (Photon in connect-src only); `_headers` regenerated identically plus `frame-ancestors`. Dynamic styling is `style.setProperty` with numeric values and WAAPI (CSSOM, allowed under `style-src 'self'`). Leaflet `L.Control`, divIcons and popups are DOM nodes from `el()`/`svg()`; radius ring uses SVG attributes + class.
- **Fonts:** four hashed same-origin `.woff2` assets; no external URLs in built CSS.
- **Overpass:** still built only from validated wikidata ids, escaped regexes and `toFixed` coordinates; radius clamped (100 m to 20 km) and UI/session limited to 2/5/10/20 km; branch cap clamped to ≤150.
- **Supply chain:** `@fontsource-variable/bricolage-grotesque` and `plus-jakarta-sans` pinned to exactly 5.3.0, lockfile integrity equals the registry `dist.integrity`, no install scripts; `npm ci --dry-run` OK; `npm audit --audit-level=high`: 0 vulnerabilities.
- **PRIVACY.md** matches behaviour (session record fields, Clear search, Photon after 3 chars/300 ms, Nominatim skipped after a pick or refresh, nothing in the URL).

### Tests
- New `tests/unit/security-pr3.test.ts` (54 tests): `svg()` tag/attr rejection, `label` inertness, ReDoS bound (hostile patterns rejected, shipped file validates with no drops), claim-detail strictness, Photon URL params and parser rejection, hostile session records (markup, `__proto__`, extra keys, bad tab/radius/country/ids, oversize), and a storage/cookie/URL-state scan of `src/**`.
- `npm run build` (typecheck + vite): OK. `npm test`: 17 files, 624 passed. `npm audit --audit-level=high`: 0. `npm run test:e2e`: 58 passed, 4 skipped (pre-existing skips).

### Sign-off
No high or medium issues. The two low findings are fixed and covered by tests. **Security approves PR #3 for merge and deploy.** Not committed (orchestrator owns git).

---

## QA: PR #3 (2026-10-02)

Branch `feat/autocomplete-more-offers`, working tree including Security's PR3-1/PR3-2 fixes. Nothing committed. QA only touched `tests/e2e/qa-pr3.spec.ts` (new) and `tests/unit/qa-offers-data.test.ts` (new). No `src/` edits.

### Results
| Command | Result |
|---|---|
| `npm run build` | ✅ pass |
| `npm test` | ✅ **625/625** in 17 files (10 new from QA) |
| `npm run test:e2e` (run 4 times in a row after the last change: 2 full runs here, earlier runs before a timing fix) | ✅ **74 passed, 8 skipped** in both final runs (82 = 41 tests × 2 projects). The 2 known-bug tests use `test.fail()` and count as passed. The journey test was also run `--repeat-each=6 --workers=4`: 12/12. |
| `npm run lhci` (3 runs) | ✅ Performance **0.99**, Accessibility **1.00**, Best Practices **1.00**, SEO **1.00** in all 3 runs. **LCP 1.8 to 2.0 s**, FCP 1.7 s, CLS ≤ 0.01, TBT 0 ms |
| `npm audit --audit-level=high` | ✅ 0 vulnerabilities |

One flake was found and fixed in QA's own test: in an early version of the journey, a full-page axe scan under 4 parallel workers outlasted the 3.2 s toast. The toast now gets its own scoped axe scan straight after the claim. It was not a product issue.

### New tests
| File | Tests | Covers |
|---|---|---|
| `tests/e2e/qa-pr3.spec.ts` | 10 (× 2 projects; 4 are single-project by design) | **Journey (desktop + Pixel 7):** month, then type "Beng" and pick a Photon suggestion (no Nominatim). Nearby is sorted nearest first with "x m/km away" and the "More quests in India (no branch found within 5 km)" group. Switching to 20 km sends `around:20000` for the same coordinates and `out center 150`, with no geocoding; the list re-sorts (the mocked Starbucks moves about 14 km away and drops to last), and the header reads "N quests in total. 4 within 20 km of Bengaluru.". Claiming 2 quests checks the ring text `2 of 37`, the `--progress` ratio, `body.is-lit`, the "Claimed" label, the toast text (aria-hidden) and live region, and the claimed pins (2) versus unclaimed (2). Online: country auto-set to IN, the count chip and accessible name match offers.json, and the "both" offer is claimed there too. The session record is exact. Refresh restores city, month, 20 km, the Online tab, country, done ids, ring, candle and claimed pins; Overpass re-runs at 20 km with 0 Nominatim/Photon calls and no replayed toast. Clear search empties sessionStorage, resets inputs, radius, ring, candle, pins, circle, counts and month pill, and puts focus on the city. axe runs with the listbox open (existing), the toast (scoped), the claimed state, Online with the 250-option select, the restored state and after Clear. **Claim details:** Chili's (US) shows You get = rewardItem, the offer text as detail, steps `<ol>` = 3 items with no free-text howToClaim, chips = 1 ("Valid: …", `purchaseRequired: null` gives no chip), and aria-hidden icons. A legacy entry with no fields shows the offer as the headline and `howToClaim` as `<p>`. Every US card is checked against offers.json (steps count, chip count, headline). **Map tiles 503** shows the `.map-notice` (`role=note`, copy), quests and pins are unaffected, axe passes, and "Try again" hides it once tiles load. **Overpass 504 then 200** gives exactly 2 identical queries ≥ 1.9 s apart, with pins and distances shown. **Overpass 429 ×2** gives up after one retry with quests still listed. **Reduced motion:** no strips, no ignite, no WAAPI on the toast or checkbox, and every end state (toast, live region, ring, candle, claimed pin) is present; axe passes. **Keyboard only (desktop):** autocomplete ArrowDown+Enter, month prompt and focus, type-ahead "Oct", radius arrows 5→20, Enter submits the picked place, then Shift+Tab back to the radius and ArrowLeft re-runs at 10 km. Tablist arrows work. Space claims, with a visible focus ring on the claim row. Enter on Clear search. **No horizontal scroll** at 360/375/390/768/1024/1440 at start, with autocomplete open, with results + claimed + toast, and on Online; the toast stays inside the viewport. **Mobile toast** (2 `test.fail` tests, see QA-PR3-01/02). |
| `tests/unit/qa-offers-data.test.ts` | 10 | 102 entries and the app validator keeps all of them. Ids are unique and kebab-case. No duplicate brand+country. Every `sourceUrl` is https with no credentials, port or fragment. Countries are valid ISO-2 (from `src/countries.ts`), non-empty and unique. The id suffix matches the country. No em dash, spaced en dash or emoji in any string. `lastVerified` is a real date and not in the future. **Domain plausibility (warnings only):** the host must contain a brand token (≥4 chars) or be on a reviewed allowlist (`andindia.com`, `itchotels.com`, `dsw.com`, `ihop.com`); third-party platforms and news/blog subdomains are flagged. |

### Data warnings (not failures)
- `hidesign-in` → `hidesigncustomercare.zohodesk.in`: a Zoho Desk helpdesk, not the brand's domain. Prefer a page on `hidesign.com`.
- `myntra-insider-in` → `blog.myntra.com`: a blog post, not the Insider T&C.
- `sephora-us-ca` → `newsroom.sephora.com`: a press release, not the Beauty Insider terms.
- Manual note: `titan-encircle-in` ("Tanishq / Titan (Encircle)") points to `www.titaneyeplus.com`, a sister brand's page. It passes the token check ("titan"), but the Encircle/Tanishq page would be the better source.

### Bugs
| ID | Severity | Owner | Repro | Expected | Actual | Exact fix | Status |
|---|---|---|---|---|---|---|---|
| QA-PR3-01 | Medium (mobile UX) | UI/UX | Pixel 7 (412×839) or 375 px. Search Bengaluru. Scroll so a card's claim row sits in the bottom ~100 px. Tap it, then tap the same row again within 3 s to undo a mis-tap. | The second tap toggles the claim. | The toast (`position:fixed; bottom:24px; z-index:3001`, no `pointer-events` rule) sits over the row; `elementFromPoint` hits `.toast` at 3 of 5 sample points, so the tap is swallowed for 3.2 s. | `src/styles/components.css` `.toast { …; pointer-events: none; }`. The toast is aria-hidden and has no controls. | Open. Test: `qa-pr3.spec.ts` "mobile: the claim toast does not block…" (`test.fail`; remove that line after the fix) |
| QA-PR3-02 | Low (visual) | UI/UX | Same setup. Claim "The Body Shop". Seen live on 375 px London too ("Starbucks claimed. 3 of 11 done." on 3 lines). | One-line pill, about 300 px wide. | The toast is 206 px wide and 77 px tall (3 lines). `left: 50%` on a fixed shrink-to-fit box limits its width to 50vw before `translate(-50%)`. | Same rule: add `width: max-content;` (the existing `max-width: calc(100vw - 32px)` still caps it). Verified in a throwaway run: 302×56 px. | Open. Test: "toast is one line on phones" (`test.fail`) |
| QA-PR3-03 | Medium (content UX) | Orchestrator (data) / Full-Stack | Search London (March) or Mumbai (October). Read the cards. | Claim details add information. | **31** entries have `rewardItem: "Not published by the brand, varies by member"`, shown as the large "You get" headline (e.g. adidas, Wagamama, Target). **39** entries have `validFor: "Not stated"`, shown as a "Valid: Not stated" chip. Both are placeholders that read as broken. | Preferred (data): drop `rewardItem` and `validFor` where unknown; the card then falls back to the offer text and shows no chip. Alternative (code, `src/render/quests.ts`): in `claimChips` skip `validFor` matching `/^not stated$/i`, and in `questCard` treat a `rewardItem` starting with "Not published" as absent. | Open |
| QA-PR3-04 | Info | Full-Stack | On the Online tab, click Clear search. | Maybe back to Nearby. | Inputs, ring and map reset, but the Online tab stays selected (now "Pick your country"). After a refresh it would be Nearby. | Optional: `selectTab(tabs[0])` inside `clearSearch()` (restoring=true already suppresses the write). | Open (product call) |
| QA-PR3-05 | Info | Full-Stack | Live, central London at 5 km returned exactly **60** pins (the cap), with Costa alone 13. | n/a | The nearest-first order is only "nearest among the 60 returned" (Overpass order is by OSM id), as Full-Stack noted for 20 km. | Optional: sort by distance before capping in `parseOverpass`, or ask for more than the cap and trim client-side. | Open |
| QA-PR3-06 | Info (upstream) | none | Live Mumbai at 5 km and 2 km: 4 of 5 Overpass calls failed with 504 `Dispatcher_Client::request_read_and_idx::timeout … server is probably too busy` (reproduced with curl, about 9 s each). London's first try returned 504 and the retry returned 200. | n/a | Handled gracefully: quests listed, header explains, retry works. | None in-app (DECISIONS #15 rejected mirrors). Monitor after deploy. | Accepted |

### Live smoke test (real Photon, Overpass, OSM tiles; `npm run preview`, built-in browser)
- **Mumbai, October:**
  - "Mumb" sent 1 Photon request (1.4 s) and returned 5 city options. Mumbai was 2nd, after "Mumbué" (Photon ranking).
  - ArrowDown×2 + Enter picked Mumbai with no Nominatim call. Online auto-set to IN ("Online 28 quests"), with 31 Nearby cards.
  - Overpass returned 504 on both tries at 5 km, then again at 2 km. The fallback copy was correct ("Shop pins for Mumbai didn't load, so distances are missing").
  - Claimed adidas and AND: 12 strips, toast "AND claimed. 2 of 37 done.", ring "2 of 37", candle lit.
  - **Refresh** restored city, month, 2 km and both claims, with 0 Nominatim/Photon calls. That Overpass call succeeded: Starbucks 810 m and La Pino'z 1.6 km, 2 pins, the rest grouped.
- **London, March:**
  - "Lond" put London, England first. The month pill read "Your birthday month starts in 5 months", the title "Your March quests", and Online synced to GB ("Online 2").
  - Overpass returned 504 and then 200 on the retry (10 s): 60 pins, 8 near cards sorted from Costa 70 m to Space NK 3.9 km, header "11 quests in total. 8 within 5 km of London."
  - Claimed Costa and Greggs: ring "2 of 11", 16 claimed pins (13 Costa + 3 Greggs).
  - **Refresh** restored everything, with only 1 Overpass call (200).
  - At 375 px: no horizontal scroll. The toast wraps to 3 lines (QA-PR3-02).
- **Clear search** emptied sessionStorage, reset the ring and candle, and removed all markers.
- **Console:** only the browser's own "Failed to load resource: 504" lines from Overpass. No app errors and no CSP violations.

### Sign-off
| Feature | QA |
|---|---|
| Photon city autocomplete (combobox, keyboard, a11y, privacy) | ✅ |
| Radius radio group 2/5/10/20 (re-run, arrows, query) | ✅ |
| Nearby-first sorting with distance + grouping | ✅ (cap caveat QA-PR3-05) |
| All 249 countries in Online + auto-sync + count chip | ✅ |
| sessionStorage restore + Clear search | ✅ (QA-PR3-04 info) |
| 102 offers, claim details rendering | ✅ rendering / ⚠️ content placeholders (QA-PR3-03) |
| Data integrity (ids, https, countries, dashes, emoji) | ✅ (3 domain warnings) |
| Soft premium redesign: celebration, ring, candle, pins, reduced motion | ✅ |
| Toast on mobile | ❌ QA-PR3-01/02 (one-line CSS fix, not blocking data or privacy) |
| Map tile failure notice | ✅ |
| Overpass retry once on 504/429 | ✅ |
| Accessibility (axe 0 in every state, keyboard flow) | ✅ |
| No horizontal scroll 360 to 1440 | ✅ |
| Performance (Lighthouse) | ✅ 0.99 / 1.00 / 1.00, LCP ≤ 2.0 s |

**Recommendation:** OK to merge once QA-PR3-01/02 are fixed; that is a two-property CSS change in `.toast`, after which the two `test.fail()` lines come out. QA-PR3-03 is strongly recommended before deploy, because about a third of the cards show placeholder text.

## Orchestrator: PR #3 close-out (2026-10-02)
I applied QA-PR3-01, -02, -03 and -04 (DECISIONS #22) and removed the two `test.fail` markers.

| Check | Result |
|---|---|
| `npm run build` | OK |
| `npm test` | 625 passed |
| `npm run test:e2e` | 74 passed, 8 skipped (skips are by design) |

- **Sign-offs:** Security ✅ (Security review: PR #3) and QA ✅ (all blocking items fixed). PR #3 is cleared to merge.
- **Docs:** added `CLAUDE.md` and the root `DESIGN.md`, and updated the README.

## Full-Stack: venues for single-location offers + "Verified only" (2026-10-02, branch `fix/venues-verified-filter`)
User bug: searching Kolkata showed Imagicaa (one park near Mumbai) in Nearby. User request: a "Verified only" filter. DECISIONS #24 and #25.

**Venues (#24)**
- `Offer.venues` (1 to 20 `{name ≤80, lat, lng, exact? = true}`), strictly validated in `validateOffer` (bad name/coords/`exact` type rejects the whole offer).
- `src/offers.ts`: `VENUE_MAX_M = 150_000`, `nearestVenue(offer, lat, lng)`, `nearbyOffers({offers, country, lat, lng})` (drops venue offers with no venue within 150 km; returns the kept venue hits).
- `src/urls.ts`: `directionsUrlByName(name)` (1 to 120 clean chars, throws otherwise; `'()!*` percent-encoded as well).
- Nearby: venue hits are merged into a render-time branch map (never into `state.branches`), sort with the shop branches by distance, show "Wonderla Bengaluru · 26 km away" (or "about N km away" for `exact: false`). Venue offers are not sent to Overpass. Venue pins only when exact and inside the search circle (see #24 for why). Rest heading: "Also in <Country>: find your nearest branch". Header "N within X km" counts listed offers within the circle.
- `public/offers.json`: `wonderla-in` (5 parks), `imagicaa-in`, `water-kingdom-in`, `wetnjoy-lonavala-in` (`exact: false`) got venues, lost `osm`, channel `both` → `in-store`.
- Other single-location destination offers in the file: **none found**. Scanned all 102 for parks, resorts, zoos, museums, aquariums and attractions. `club-itc-in` (ITC hotels) and `timezone-in` (arcade chain) are multi-site chains and keep `osm`.

**Verified only (#25)**
- `<button role="switch" id="verified-only">` above the tabs (`index.html`, `.switch` in `components.css`, documented in DESIGN.md). Filters Nearby and Online, counts, header summary and ring, and pins; Found online shows `#found-verified-note`. Empty state "No verified quests here yet" + "Show all quests". Announced via `#status`.
- `src/session.ts` version 2 with `verifiedOnly`; exact version 1 records migrate to `verifiedOnly: false`. Clear search resets it. SECURITY.md I1 updated.

**Tests**
- Unit: new `tests/unit/venues.test.ts` (venue validation incl. 19 rejects, `nearestVenue`, `nearbyOffers` for Kolkata/Bengaluru/Mumbai on the shipped data, 150 km boundary, `applyVerifiedFilter`, `directionsUrlByName` encoding/XSS/length, approximate distance text). `session.test.ts` / `security-pr3.test.ts` moved to v2 (+ migration, `verifiedOnly` tampering).
- E2E: new `tests/e2e/venues-verified.spec.ts` (Kolkata no parks; Bengaluru Wonderla name/km/href/no pin; Mumbai Wet'nJoy "about" + by-name href + no pin, Water Kingdom pin at 20 km; Verified only counts/cards/pins/announcement/Space/reload/Clear/axe; all-unverified empty state; v1 migration). Existing specs updated: `expectedNearbyCount` now takes the searched point, session records are v2, the Wonderla card joins the "with a branch" group in Bengaluru, Overpass 504 keeps the venue's directions, new rest heading.

| Check | Result |
|---|---|
| `npm run build` | OK |
| `npm test` | 686 passed |
| `npm run test:e2e` | 86 passed, 8 skipped (by design) |
| `npm run lhci` | 0.99 / 1.00 / 1.00 (perf / a11y / best practices) |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Manual, `npm run preview` + real services (built-in browser) | Kolkata: 27 Nearby quests, no park (Overpass was 504 at the time, quests still listed). Bengaluru: 28 quests, 60 pins, Wonderla Bengaluru 26 km last in the near group with directions to 12.8346,77.4; Verified only → 15 Nearby / 11 Online, 29 pins, "Showing verified quests only, 18 of 34", plum switch. |

Needs: Security review (new `venues` input, `directionsUrlByName`, session v2) and QA sign-off. Not committed.

## Security review: PR #4 (2026-10-02, branch `fix/venues-verified-filter`)
Scope: `git diff origin/main...HEAD`. `venues` field and validation, `nearestVenue`/`nearbyOffers`, `directionsUrlByName`, session v2 and v1 migration, the "Verified only" switch, map pin changes, `offers.json` venue data, privacy model and docs.

| # | Severity | Area | Finding | Resolution |
|---|---|---|---|---|
| 1 | Low | `src/offers.ts` `validateVenues` / `src/render/quests.ts` | Venue names were validated with `cleanText` only, which allows `<`, `>` and lone surrogates. `directionsUrlByName` rejects those (`RangeError`, or `URIError` from `encodeURIComponent`), so such a name on an `exact: false` venue would have made `questCard` throw and break the Nearby list (data-driven render DoS; not XSS, the name never reaches HTML). | Fixed. `validateVenues` now rejects any name `directionsUrlByName` would reject, and `branchDirectionsUrl` falls back to the coordinate link if the by-name build ever throws. |
| 2 | Info | `SECURITY.md` | "Directions links are built only from finite, clamped numbers" was no longer true. | Fixed. Now documents by-name links (validated name, full percent-encoding, fixed https Google Maps prefix, `safeHttpsUrl` + `externalLink`, no user location). |
| 3 | Info | `PRIVACY.md` | The session record list did not mention the new `verifiedOnly` flag. | Fixed. Added "whether the Verified only switch is on". |

Checked and OK (no change needed):
- `directionsUrlByName`: `encodeURIComponent` plus `!'()*` means no `&`, `#`, `?`, `/` or `:` survives into the URL, so the name cannot add parameters, a fragment or change scheme/host; output is always `https://www.google.com/...` and still goes through `externalLink` → `safeHttpsUrl` with `target=_blank rel="noopener noreferrer"`. A name like `javascript:alert(1)` is just an encoded destination value. Length capped (80 in data, 120 in the builder).
- Venue coordinates: finite, `|lat| ≤ 90`, `|lng| ≤ 180`, `exact` strictly boolean, 1 to 20 venues. All 8 shipped venues lie in India and match the named places; Wet'nJoy is correctly `exact: false`. Venue offers are `in-store` with no `osm`, and are not sent to Overpass (no new data leaves the browser).
- `nearestVenue` guards invalid points; `nearbyOffers` never mutates `state.branches`.
- Session v2: exact key sets for v2 and v1 (a v1 tag with v2 keys, a v2 tag with v1 keys, extra keys, future versions all rejected), `verifiedOnly` must be a boolean, `__proto__`/`constructor` keys fail the exact-key check, `isPlainObject` checks the prototype, 16 KB cap before `JSON.parse`. Migrated records are re-saved as v2.
- "Verified only" switch: static markup, `<button type="button" role="switch" aria-checked>` with a visible label and `aria-describedby`; state set with `setAttribute`, no `innerHTML`, no inline style. Map: only a `fit` option was added; pins still use DOM-built divIcons and popups, and approximate venues never get a pin.
- Privacy model unchanged: no new storage key, origin, CSP entry or URL state. `verifiedOnly` lives in the existing `bsq-session` record. No `innerHTML`/`eval` added (existing source scan passes).

Tests: new `tests/unit/security-pr4.test.ts` (26 tests: venue name and coordinate rejects, by-name URL stays inside the `destination` value for hostile inputs, fallback, rel/target, session v2 tampering and prototype keys, shipped venue sanity, switch markup). The 3 name-reject tests fail without fix #1.

| Check | Result |
|---|---|
| `npm run build` | OK |
| `npm test` | 734 passed (20 files) |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run test:e2e` | 102 passed, 10 skipped (by design) |

**Security ✅** for PR #4 with the fixes above (uncommitted on the branch: `src/offers.ts`, `src/render/quests.ts`, `SECURITY.md`, `PRIVACY.md`, `tests/unit/security-pr4.test.ts`).

## QA: PR #4 (2026-10-02, branch `fix/venues-verified-filter`)

Working tree including Security's PR #4 fixes (last `src/` change 20:46; every run below came after it). Nothing committed. QA only added `tests/e2e/qa-pr4.spec.ts` and `tests/unit/qa-pr4.test.ts`. No `src/` edits.

### Results
| Command | Result |
|---|---|
| `npm run build` | ✅ pass (typechecks both new test files) |
| `npm test` | ✅ **734/734** in 20 files (22 new from QA) |
| `npm run test:e2e` (2 full runs in a row) | ✅ **102 passed, 10 skipped** in both runs (112 = 56 tests × 2 projects; skips are desktop-only/mobile-only by design). New spec alone: 16 passed, 2 skipped. |
| `npm run lhci` (3 runs) | ✅ Performance **0.99**, Accessibility **1.00**, Best Practices **1.00**, SEO **1.00** in all 3. LCP 1.8 to 2.0 s, CLS ≤ 0.01, TBT 0 ms |
| `npm audit --audit-level=high` | ✅ 0 vulnerabilities |

### New tests
| File | Tests | Covers |
|---|---|---|
| `tests/unit/qa-pr4.test.ts` | 22 | Exactly 4 venue offers, all `in-store`, IN only, no `osm`; Wonderla has 5 venues; only Wet'nJoy is `exact: false`; every venue inside India's bounding box. Venue offers never reach Online (IN, US, GB, worldwide). **City matrix against an independent haversine oracle** (Pune, Chennai, Delhi, Hyderabad, Kochi, Mysuru, Bhubaneswar, Nashik, Thane, Kolkata, Jaipur): kept venue offers, chosen nearest venue and distance all match, chains unaffected. Pune: Imagicaa 67 km, **Water Kingdom 136 km (inside 150 km, so present)**, Wet'nJoy "about 48 km away", no Wonderla. Wonderla picks Chennai/Hyderabad/Kochi/Bhubaneswar parks per city and Wonderla Bengaluru for Mysuru (102 km). Non-IN country at the same point lists no parks. Directions: exact = coordinates, Wet'nJoy = by name. All parks are verified so Verified only keeps them; IN has both verified and unverified offers in each tab; the filter neither mutates nor reorders. |
| `tests/e2e/qa-pr4.spec.ts` | 9 (× 2 projects; 2 are desktop-only) | **Pune picked from Photon** (no Nominatim): the 3 park cards are the near group in nearest-first order (Wet'nJoy, Imagicaa, Water Kingdom) with exact names, "about 48 km away" / "67 km away" / "136 km away", correct hrefs and `rel`; no Wonderla; no pins (all outside 5 km); header "0 within 5 km of Pune."; no park names in the Overpass query; Verified only keeps the parks; axe. **Chennai:** Wonderla Chennai with its coordinates; no other parks. **Hyderabad at 20 km:** Wonderla Hyderabad (~19 km) gets a pin, header "1 within 20 km", pin survives Verified only. **Delhi:** no parks in Nearby or Online, ring total matches. **Claimed x Verified only:** claim Starbucks (unverified) and The Body Shop (verified) → "2 of N"; switch on → Starbucks card and pin gone, ring "1 of V", `--progress` = 1/V, candle lit, Body Shop pin claimed; unclaim Body Shop → "0 of V", no crash; session keeps `done: ["starbucks-in"]`; reload with filter on keeps it; switch off → Starbucks card checked, `is-done`, claimed pin, "1 of N", candle lit; axe. **Switch before a search:** Online IN filtered; the search status reads "Found N verified quests and 1 shop on the map"; ring "0 of V". **Mobile widths 360/375/390** (off and on): no horizontal scroll, switch 44 px tall, one line, inside the viewport, above the tabs without overlap; axe at 390 with it on. **Keyboard:** Shift+Tab from the tablist lands on the switch, focus ring visible, Enter toggles and keeps focus, Tab returns to the tablist, accessible description "Hides quests marked Check with store.". **Reduced motion:** thumb transition ≤ 1 ms, no running animation on the switch, thumb at its end transform, axe. |

### Bugs
| ID | Severity | Owner | Repro | Expected | Actual | Exact fix | Status |
|---|---|---|---|---|---|---|---|
| QA-PR4-01 | Low (copy) | Full-Stack | Search Hyderabad at 20 km where Overpass returns no shops (or any city where the only pin is a park, e.g. the Mumbai 20 km e2e mock with Water Kingdom). | The status doesn't call a theme park a shop. | "Found N quests and 1 shop on the map within 20 km of Hyderabad." The 1 pin is Wonderla Hyderabad: `renderPins()` counts venue pins too. | `src/main.ts` `runSearch`, success branch: change `${pinCount} shop${pinCount === 1 ? '' : 's'} on the map` to `${pinCount} place${pinCount === 1 ? '' : 's'} on the map`, then update `tests/e2e/qa-pr3.spec.ts:343` (`'4 places on the map within 5 km'`) and `tests/e2e/qa-pr4.spec.ts` "Verified only before any search" (`... and 1 place on the map`). | Open (non-blocking) |
| QA-PR4-02 | Info | Product | Claim only an unverified quest, then turn Verified only on. | n/a | Ring "0 of V" and the candle goes out, because the ring counts listed quests only. The claim is kept and comes back when the switch is turned off (tested). Consistent with the ring meaning "of the quests shown". | None needed. Optional: keep the candle lit when `doneIds().length > 0` (`updateHeader`: `setCandleLit(doneIds().length > 0)`). | Product call |
| QA-PR4-03 | Info | none | Verified only on. | n/a | Verified but stale offers ("May be outdated" badge) still show. This matches the switch hint ("Hides quests marked Check with store") and DECISIONS #25. | None. | Accepted |

### Live smoke test (built `dist/`, real Nominatim, Overpass, OSM tiles, built-in browser)
Served with `vite preview` on **port 4174** instead of 4173, so a concurrent Playwright run (`reuseExistingServer`) couldn't attach to a non-e2e build. Same build and base path.
- **Kolkata, October:** 27 Nearby quests, 17 shops on the map, Online 24, ring "0 of 33". **No Imagicaa** (or any park) anywhere on the page. The user's report is fixed.
- **Pune:** 30 Nearby quests, 19 shops. Park cards: Wet'nJoy Water Park Lonavala "about 48 km away" (by-name link `destination=Wet%27nJoy%20Water%20Park%20Lonavala`), **Imagicaa, Khopoli "66 km away"** (`destination=18.7668,73.2805`), Water Kingdom, Gorai, Mumbai "136 km away". No park pins. Header "36 quests in total. 9 within 5 km of Pune."
- **Verified only on:** Nearby 17, Online 11, ring "0 of 20", header "20 quests in total. 5 within 5 km of Pune.", 11 pins, 0 "Check with store" badges, all 3 parks kept, announced "Showing verified quests only, 20 of 36". Session record v2 with `verifiedOnly: true`.
- **Refresh:** switch still on, city Pune, Nearby 17, ring "0 of 20", 11 pins, status "Found 17 verified quests and 11 shops on the map within 5 km of Pune."
- **Clear search:** switch off, city empty, 0 pins, sessionStorage empty.
- **Console:** no errors, no CSP violations.

### Sign-off
| Feature | QA |
|---|---|
| Venues: parks only within 150 km (Kolkata/Delhi none; Pune 3; Chennai, Hyderabad, Bengaluru Wonderla) | ✅ |
| Venue name, distance, directions (exact by coordinates, Wet'nJoy "about" + by name, no pin) | ✅ |
| Parks removed from Online | ✅ |
| Verified only: lists, counts, header, ring, pins, announcement, session v2, Clear search, empty state | ✅ |
| Claimed state x Verified only | ✅ (QA-PR4-02 info) |
| Mobile 360/375/390, 44 px target, keyboard, reduced motion, axe | ✅ |
| Status copy for park-only pins | ⚠️ QA-PR4-01 (Low, non-blocking) |
| Performance (Lighthouse) | ✅ 0.99 / 1.00 / 1.00 |

**QA ✅** for PR #4. QA-PR4-01 is a one-word copy fix that can land with or after the merge.

## Full-Stack: free treats first, quest types and Filter box (DECISIONS #27), branch `feat/sort-free-first`

**User requests:** "first the freebies should be listed and then discount items, and items where we get discount if we have made any spend in the past shall come up last", then "don't touch Verified only, make a filter box beside it where we can have check box for free, discount & past spend".

### What changed
- **Data:** all 102 offers in `public/offers.json` gained required `rewardType` (`free` | `discount`) and `needsPastSpend` (boolean), classified only from each entry's own fields and the research notes. Counts: **28 free (tier 0), 40 discount (tier 1), 34 needs past spend (tier 2)**. Full table with the deciding field per offer, plus 27 judgement calls: `docs/OFFER_CLASSIFICATION.md`.
- **Schema:** `src/types.ts` (`RewardType`, both fields required); `validateOffer` rejects missing or invalid values. README "Adding a new offer" and CONTRIBUTING updated.
- **Order:** `questTier`, `questType`, `compareQuests`, `sortQuests` in `src/offers.ts` (tier, then distance, then brand A to Z, then id). Used by `renderQuestList` (Online) and inside both Nearby groups in `renderNearbyList` (near group first, "Also in <Country>" second, unchanged).
- **Type chip:** first badge on every card (Free / Discount / Needs past spend), `typeBadge` in `src/render/quests.ts`, new `tag`, `receipt` and `filter` icons. No per-type subheadings (reason in DECISIONS #27).
- **Filter box:** "Filter" disclosure button right of the untouched "Verified only" switch; fieldset "Show" with three checkboxes (all on), hint line, Reset. Escape closes and refocuses the button; outside click or tabbing out closes it. Hidden-type count chip on the button. One pure pipeline `applyQuestFilters` for lists, tab counts, header, ring and pins; `typeFilterMessage` for the live region. Empty state "No quests match your filters" with "Show all quests" (resets checkboxes and Verified only); Verified only alone keeps its own copy.
- **Session:** `bsq-session` v3 adds `types: {free, discount, past}` (exact keys, booleans); v2 and v1 records migrate with every type on. Clear search resets the filters. SECURITY.md, PRIVACY.md, CLAUDE.md, DESIGN.md updated.

### Results
| Check | Result |
|---|---|
| `npm run build` | ✅ |
| `npm test` | ✅ 808 passed (21 files; new `tests/unit/quest-order.test.ts`, extended validator, session and security tests) |
| `npm run test:e2e` | ✅ 114 passed, 12 skipped (new `tests/e2e/quest-types.spec.ts`; order-dependent expectations updated in `autocomplete`, `qa-pr3`, `qa-pr4`; session v3 everywhere) |
| `npm run lhci` | ✅ 0.99 / 1.00 / 1.00 / 1.00 in all 3 runs |
| `npm audit --audit-level=high` | ✅ 0 vulnerabilities |
| Manual, `npm run preview` with real services (Bengaluru, October) | ✅ Nearby 28 quests, near group and rest group both in tier order, 60 places; unchecking Free gives Nearby 26, ring "0 of 32", announcement "Showing discount and past-spend quests, 32 of 34"; reload restores the filter (session v3); Clear search resets it and empties storage; box fits at 360px with no horizontal scroll. Only console errors were public Overpass 504s, retried successfully. |

### For review
- **Security:** new persisted field `types` (strict exact-key boolean validation, prototype-pollution case tested); new DOM built with `el()`/`svg()` only; no new origin, CSP unchanged. Security ✅ pending.
- **QA:** please re-run the judgement calls in `docs/OFFER_CLASSIFICATION.md`, especially `starbucks-us`/`starbucks-ca` (`needsPastSpend: true` because the entry says "make 1 Star-earning purchase first") and `costa-gb` (`false`, no past-transaction rule stated for GB). QA ✅ pending.
