# Birthday Side Quests: Build Plan

## Context
The user wants a free, privacy-first web app. They enter a city and a birthday month and get "birthday side quests": nearby stores with birthday freebies shown on a pastel map, online-only birthday deals, and a live "Found online" section from web search. `/Users/raksharakyan/BirthdayPicks` is empty, and Node is not installed. GitHub CLI is logged in as `raksharakyan` (ssh).

The user's decisions:
- **Stack:** Vite + vanilla TypeScript + Leaflet. Install Node LTS with Homebrew (approved).
- **Hosting:** GitHub Pages, repo `raksharakyan/birthday-side-quests` (public, MIT).
- **Offer sources (hybrid):**
  - Curated `offers.json`, shown with a ✅ Verified badge. These are the only "facts".
  - A live **"Found online"** section. A Cloudflare Worker calls a search API using only *month + country*. Results are shown as plain-text title, snippet and link, labelled "Unverified, check the link".
- **Online tab:** a separate tab for online/app-only birthday deals. City is optional there; country can be picked manually.
- **AI rewriting:** none in v1. Cute quest lines come from category templates. The Worker can later add an optional LLM summary behind a flag. AI is never a source of facts.

## Architecture
```
src/
  main.ts            app bootstrap, state (in-memory only)
  geocode.ts         Nominatim: debounce 600ms, 1 req/s queue, Map cache, parse → {lat,lng,country_code,label}
  overpass.ts        one combined query: nodes/ways with brand:wikidata|brand|name~regex for in-country offers, radius 5km
  offers.ts          load offers.json, filter by country/channel, month logic (claim window, "active now")
  liveSearch.ts      call Worker (if VITE_WORKER_URL set) with {month,country}; validate+sanitize response
  urls.ts            directionsUrl(lat,lng), safeHttpsUrl()
  render/dom.ts      el() helper: textContent only, never innerHTML with data
  render/map.ts      Leaflet, OSM tiles + attribution, inline-SVG heart/gift divIcons
  render/quests.ts   cards, done checkbox (in-memory Set), confetti (reduced-motion aware)
  templates.ts       cute per-category quest lines, deterministic by brand hash
  styles/            pastel tokens, self-hosted fonts via @fontsource (Fredoka display, Nunito body)
public/offers.json   versioned seed (schemaVersion, ≥15 brands)
worker/              Cloudflare Worker (search proxy) + wrangler.toml + tests
tests/unit, tests/e2e (Playwright, all network mocked), lighthouserc.json
.github/workflows/   ci-deploy.yml (build, test, audit, lhci, deploy Pages), link-check.yml (weekly sourceUrl check), dependabot.yml
docs/ PLAN.md DECISIONS.md HANDOFFS.md · README SECURITY PRIVACY CONTRIBUTING LICENSE
```

**`offers.json` entry fields:**
- Required by the spec: `id`, `brand`, `category`, `offer`, `howToClaim`, `countries[]` (ISO-2 codes or `"*"`), `sourceUrl` (https), `lastVerified`.
- Extra fields: `verified` (when false, the UI shows "Check with store"), `channel` (`in-store` | `online` | `both`), `claimWindow` (`day` | `week` | `month`), and `osm: {wikidata?, nameRegex?}`.

**Seed brands.** Research each on its official page during the build with WebFetch. Anything I can't confirm stays `verified:false`.
- India: Tata Starbucks, Chaayos, Third Wave Coffee, Barbeque Nation, Baskin Robbins IN, Shoppers Stop First Citizen, Nykaa.
- Global: Starbucks, Sephora, Ulta, The Body Shop, Bath & Body Works, Krispy Kreme, Dunkin', Denny's, IHOP, Panera, Costa, H&M, Häagen-Dazs.

**Key decisions (to record in `DECISIONS.md`):**
- **Referrer conflict.** Nominatim needs an identifying Referer, but the site sets a global `Referrer-Policy: no-referrer`. Fix: set `referrerPolicy:'strict-origin'` on the Nominatim and Overpass fetches only. That sends just the site origin, with no user data. Security agrees.
- **GitHub Pages limits.** CSP and referrer policy go in meta tags. Pages can't set `X-Content-Type-Options`, `Permissions-Policy` or `frame-ancestors`. I'll document that as a known limitation, with the `_headers` file for Cloudflare Pages provided as an alternative.
- **Worker.**
  - Accepts only `{month 1-12, country ISO-2}`, so no free text from users is ever forwarded.
  - CORS is locked to `https://raksharakyan.github.io`.
  - Results are cached for 24h per (month, country) in the Cache API, which keeps usage inside the search quota.
  - Rate limited per IP. No logging (`observability` off, no `console.log` of requests).
  - Output: https URLs only, text stripped of tags, length-capped, at most 10 results.
- **Search API.** Tavily free tier by default (no card needed); I'll confirm at build time. The key is stored with `wrangler secret`.
- **Live section is gated.** If `VITE_WORKER_URL` is unset, the "Found online" section is hidden. The app still fully works.

## Execution (orchestrator + 4 subagents)
0. **Orchestrator:**
   - `brew install node`, `git init`.
   - Write `docs/PLAN.md` (this plan with owners), `DECISIONS.md`, `HANDOFFS.md`.
   - Create the repo with `gh repo create raksharakyan/birthday-side-quests --public`.
   - Turn on secret scanning and push protection through the gh API.
1a. **Offer research (a research subagent, run in parallel with 1b):**
   - **Find the page.** For each brand, use WebSearch to locate its *official* rewards, loyalty or T&C page. The page must be on the brand's own domain or its official app domain.
   - **Read it.** Use WebFetch to read that page and pull out only what it states: the offer, how to claim it (app signup, membership, ID, purchase minimum) and the claim window.
   - **Rules:**
     - Third-party blogs and deal sites are never used as a source.
     - If the official page is vague, blocked, or only reachable through the app, the entry gets `verified:false` and shows "Check with store".
     - Every entry records `sourceUrl` and `lastVerified: 2026-10-02`.
   - **Output.** `docs/OFFER_RESEARCH.md` with one row per brand: brand, URL, a short paraphrase of what the page says, and the verdict. I check it against the URLs (spot-check with WebFetch) before it goes into `offers.json`, and you can review the table too.
   - **Ongoing upkeep:**
     - A weekly link-check Action flags dead links.
     - Entries older than 6 months show a "may be outdated" badge.
     - CONTRIBUTING.md asks for an official URL with every new offer.
     - The live "Found online" section surfaces new deals for people to check themselves.
1b. **Full-Stack agent:**
   - Scaffold Vite TS.
   - Write the geocode, overpass, offers, liveSearch and urls modules, the Worker, and both workflows.
   - Merge the researched data into `offers.json` with a schema validator test.
2. **UI/UX agent** (after step 1):
   - Pastel design tokens, layout, tabs (Nearby / Online / Found online), cards, SVG markers, confetti.
   - Keyboard and screen-reader labels, AA contrast, prefers-reduced-motion.
   - Privacy note in the UI.
3. **Security agent:**
   - Review the full diff: CSP meta, XSS, link `rel` attributes, https validation of `sourceUrl`, Worker hardening, pinned action SHAs, least-privilege `permissions`.
   - Write `SECURITY.md` (STRIDE threat model).
   - Fix anything found, then sign off in `HANDOFFS.md`.
4. **QA agent:**
   - Vitest units, Playwright e2e on desktop and mobile (with mocked Nominatim, Overpass and Worker), XSS payload tests, storage/cookie checks, axe, Lighthouse CI.
   - Report failures to the responsible agent, then sign off.
5. **Orchestrator:**
   - Resolve conflicts, take screenshots (Playwright), write the README, `PRIVACY.md` and `CONTRIBUTING.md`.
   - Commit and push to `main`, then confirm the Actions run and the live Pages URL.
6. **User steps (I'll pause and guide):**
   - Create a Cloudflare account and a Tavily key.
   - Run `npx wrangler login`, then `wrangler secret put TAVILY_API_KEY`, then `wrangler deploy`.
   - Then I set the repo variable `VITE_WORKER_URL` and redeploy. I can't create accounts or enter keys for you.
7. **Final report:** what was built, test results, security findings and fixes, known limitations.

## Verification
- `npm run test` (Vitest), `npm run test:e2e` (Playwright, desktop + 375px), `npm audit --audit-level=high`, `npx lhci autorun`. Targets: Performance ≥90, Accessibility ≥95, Best Practices ≥95.
- Manual check in the browser pane on `vite preview`:
  - Enter "Bengaluru" with month October. The map shows pins, cards render, and the directions link has the right format.
  - The done checkbox shows confetti.
  - DevTools shows empty localStorage and no cookies, and the URL has no location in it.
- After deploy: load the live Pages URL, check that the CSP gives no console violations, and check that the Actions run is green.
