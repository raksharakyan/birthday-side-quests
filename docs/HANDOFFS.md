# Handoffs

Each agent appends: what was finished, what's next, and sign-offs. A feature is done only when **Security ✅** and **QA ✅** are both recorded.

| Feature | Full-Stack | UI/UX | Security | QA |
|---|---|---|---|---|
| Geocoding (Nominatim) | ✅ | ✅ | ✅ | |
| Nearby branches (Overpass) + map | ✅ | ✅ | ✅ | |
| Offers data + filtering | ✅ (placeholder data — research merge pending) | ✅ | ✅ | |
| Quest list + done/confetti | ✅ (event only; confetti = UI) | ✅ | ✅ | |
| Online tab | ✅ | ✅ | ✅ | |
| Found online (Worker) | ✅ (not deployed) | ✅ | ✅ (code; re-check CORS origin + secret after deploy) | |
| CI/CD + Pages deploy | ✅ (not yet run on GitHub) | ✅ (n/a — no UI) | ✅ | |

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
