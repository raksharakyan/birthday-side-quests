# Handoffs

Each agent appends: what was finished, what's next, and sign-offs. A feature is done only when **Security ✅** and **QA ✅** are both recorded.

| Feature | Full-Stack | UI/UX | Security | QA |
|---|---|---|---|---|
| Geocoding (Nominatim) | ✅ | | | |
| Nearby branches (Overpass) + map | ✅ | | | |
| Offers data + filtering | ✅ (placeholder data — research merge pending) | | | |
| Quest list + done/confetti | ✅ (event only; confetti = UI) | | | |
| Online tab | ✅ | | | |
| Found online (Worker) | ✅ (not deployed) | | | |
| CI/CD + Pages deploy | ✅ (not yet run on GitHub) | | | |

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
