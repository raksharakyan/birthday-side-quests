# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## What this is
**Birthday Side Quests** is a free, privacy-first static web app. You type a city and pick your birthday month. It shows nearby stores with birthday freebies or discounts on a Leaflet map, online birthday deals by country, and optional live web results.

- Live: https://raksharakyan.github.io/birthday-side-quests/
- Repo: `raksharakyan/birthday-side-quests` (public, MIT)

## Commands
```bash
npm ci
npm run dev            # http://localhost:5173/birthday-side-quests/
npm run build          # typecheck (app + configs + worker) then vite build -> dist/
npm test               # Vitest unit tests (includes worker/)
npm run test:e2e       # Playwright, desktop Chromium + Pixel 7, all network mocked
npm run lhci           # Lighthouse CI (perf >= 0.9, a11y >= 0.95, best practices >= 0.95)
npm run audit          # npm audit --audit-level=high
npm run preview        # serve dist/ on :4173 for manual checks against real services
```
Before you call a change done, run `build`, `test` and `test:e2e`. For UI work, also run `lhci`. CI (`.github/workflows/ci-deploy.yml`) runs all of these and deploys to GitHub Pages on push to `main`.

## Architecture (Vite + vanilla TypeScript, no framework)
- `src/main.ts`: app wiring and in-memory state.
- `src/geocode.ts`: Nominatim (submit only, `featureType=city`, 1 req/s throttle, in-memory cache).
- `src/autocomplete.ts`: Photon city suggestions (`layer=city`, debounced, min 3 chars).
- `src/overpass.ts`: one combined Overpass query. It narrows to food amenities and shops first (DECISIONS #15), then retries once on 429 or 504.
- `src/offers.ts`: loads and strictly validates `public/offers.json`, filters by country and channel, resolves fixed venues (`nearestVenue`, `nearbyOffers`, `VENUE_MAX_M`), applies the "Verified only" filter, and handles month logic.
- `src/session.ts`: the **only** module allowed to touch storage. It keeps one `sessionStorage` record, `bsq-session` (version 2, includes `verifiedOnly`; version 1 records are migrated), which is strictly validated.
- `src/countries.ts`: all ISO countries via `Intl.DisplayNames`.
- `src/liveSearch.ts`: the optional "Found online" tab via the Cloudflare Worker (hidden unless `VITE_WORKER_URL` is set).
- `src/text.ts`: cleans external text (bidi and control characters).
- `src/urls.ts`: `directionsUrl`, `directionsUrlByName` (approximate venues) and `safeHttpsUrl`.
- `src/render/`: `dom.ts` (the `el()` and `svg()` allow-listed builders), `quests.ts` (cards), `map.ts` (Leaflet), `combobox.ts`, `confetti.ts` (celebration), `icons.ts` (SVG set).
- `src/styles/`: `tokens.css` (design tokens), `fonts.css`, `base.css`, `components.css`.
- `csp.config.ts`: the single source for the CSP. A Vite plugin injects it as a meta tag and writes `dist/_headers`.
- `worker/`: Cloudflare Worker search proxy (Tavily). It accepts only `{month, country}`. Not deployed yet; the user creates the accounts.
- `scripts/check-links.mjs` plus `.github/workflows/link-check.yml`: a weekly check of every offer `sourceUrl`.

## Non-negotiable rules
**Privacy**
- No accounts, analytics, cookies, localStorage or IndexedDB.
- The only persistence allowed is the single session record in `src/session.ts`, cleared when the tab closes or on Clear search.
- Never put the user's location in the app URL, and never log it.
- Never call `navigator.geolocation`.
- Location text may go only to Nominatim and Photon. Coordinates may go only to Overpass. Only month and country may go to the Worker.
- The privacy line in the UI must stay true. If behaviour changes, update `PRIVACY.md` and `SECURITY.md`.

**Security**
- Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or Leaflet HTML strings with data. Build DOM with `el()` and `svg()`.
- External links use `rel="noopener noreferrer"`, and URLs go through `safeHttpsUrl`.
- CSP: no inline scripts or styles and no `style=""` in markup; `style.setProperty` and WAAPI are fine.
- A new network origin needs a `csp.config.ts` change, a DECISIONS entry and a security review.
- Keep runtime dependencies minimal (currently `leaflet` plus two Fontsource packages, pinned exactly). Pin GitHub Actions to full commit SHAs.
- Never commit secrets. Worker keys go in `wrangler secret`; repo keys go in GitHub Secrets.

**Offer data** (`public/offers.json`)
- Facts come **only** from the brand's official https page (its own domain, help centre or T&C). Blogs, coupon sites and AI are never sources.
- If you can't confirm an offer, set `verified: false`, which the UI shows as "Check with store".
- Leave optional claim fields out when they're unknown. Never use placeholder text like "Not stated".
- Write `offer`, `rewardItem` and `steps` as paraphrases; don't copy marketing text.
- `osm.nameRegex` uses a restricted charset and a ReDoS branching cap (`validateOsm`).
- **Single-location destinations** (theme parks, water parks, one-off attractions) get `venues` instead of `osm`, with `channel: "in-store"` (DECISIONS #24). Coordinates come from OpenStreetMap (Nominatim lookup by the orchestrator) or the brand's official address; never guess. If the place isn't in OSM, use approximate coordinates with `"exact": false` (distance check only: no pin, directions by name, "about N km"). Nearby lists a venue offer only when a venue is within `VENUE_MAX_M` (150 km) of the searched city. Chains keep `osm` hints.
- The schema and the rules for contributors are in `README.md` and `CONTRIBUTING.md`. Research notes are in `docs/OFFER_RESEARCH.md` and `research/`.

**Copy and design**
- No em dashes and no emoji anywhere user-visible. Tests enforce both.
- Follow [`DESIGN.md`](DESIGN.md) (Soft Premium, plum accent). Tokens live in `src/styles/tokens.css`.
- WCAG AA, keyboard support and `prefers-reduced-motion` are required.

## Respecting free services
- **Nominatim:** at most 1 request per second, and no autocomplete. That's why suggestions come from Photon.
- **OpenStreetMap services:** attribution must stay visible. Requests send `referrerPolicy: 'strict-origin'` so they carry only the site origin (DECISIONS #6 and #9).
- **Overpass:** the public server is often overloaded (504). The app degrades gracefully, still showing quests without pins.

## Team workflow (multi-agent)
This project was built by an orchestrator coordinating Full-Stack, UI/UX, Security and QA agents.
- `docs/PLAN.md` holds tasks and owners.
- `docs/DECISIONS.md` holds numbered decisions with reasons. Append a new entry; never rewrite old ones.
- `docs/HANDOFFS.md` holds what each agent finished, plus sign-offs.
- A feature is done only when Security ✅ and QA ✅ are recorded in HANDOFFS.
- When agents disagree, Security wins on safety and UI/UX wins on visuals, and the orchestrator records the decision.
- Work happens on a feature branch, goes through a PR to `main` with CI green, and merging deploys.

## Gotchas
- Vite `base` is `/birthday-side-quests/` (`VITE_BASE`). Lighthouse builds with `/` into `dist-lhci/`, and e2e builds into `dist-e2e/`.
- `assetsInlineLimit: 0` and `modulePreload.polyfill: false` are required for the CSP.
- E2E tests fail on any unexpected external request, dialog, CSP violation, geolocation call or console error (see `tests/e2e/harness.ts`). Mock new hosts in `tests/e2e/fixtures.ts`.
- `@lhci/cli` runs through `npx` in its own CI job, not as a devDependency, because of audit advisories in its dependency tree.
- The Worker's 24h Cache API does nothing on `*.workers.dev`; it needs a custom domain.
