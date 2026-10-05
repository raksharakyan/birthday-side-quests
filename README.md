# Birthday Side Quests

> Free birthday treats near you, turned into tiny adventures.

**Live:** https://raksharakyan.github.io/birthday-side-quests/

Type in your city and pick your birthday month. You get a map and a list of birthday side quests: cafés, dessert shops, beauty brands, fashion stores and experiences near you that give birthday freebies or discounts, each with exactly what you get and how to claim it. Online-only deals have their own tab, covering every country.

![Desktop screenshot](docs/screenshots/desktop.png)

| Mobile | Claimed |
|---|---|
| <img src="docs/screenshots/mobile.png" width="300" alt="Mobile screenshot"> | <img src="docs/screenshots/claimed.png" width="420" alt="A claimed quest with the celebration"> |

## Features
- **City search for any city in the world.** Suggestions appear as you type (Photon, OpenStreetMap data).
- **Nearby quests.** Branches of 100+ brands with birthday programs, within a radius you choose (2, 5, 10 or 20 km), sorted nearest first on a Leaflet map.
- **Detailed quest cards.** Each card shows:
  - **You get:** the exact reward where the brand publishes it.
  - **Numbered claim steps.**
  - **Chips:** no purchase needed, minimum spend, join N days before, valid dates, and what to bring.
  - **Badges and dates:** Verified, Check with store or May be outdated, plus the date it was last checked.
  - **Type chip:** Free, Discount or Needs past spend.
  - **Get directions:** opens Google Maps with no API key.
  - **Verify offer:** links to the brand's official page.
- **Free treats first.** Every list shows free treats first, then discounts, then offers that need past spend with the brand (a tier, a recent purchase or a paid membership). A **Filter** box beside "Verified only" lets you hide any of the three.
- **Claim and celebrate.** Mark a quest claimed. A progress ring fills and the candle logo lights up.
- **Online tab.** App and e-commerce birthday deals for every country. It switches automatically to your city's country.
- **Survives a refresh.** Your search is kept in this browser tab only and clears when you close it.
- **Found online tab (optional).** Live web results via a Cloudflare Worker, clearly labelled *unverified*.
- **Accessible.** Mobile-first, WCAG AA, keyboard navigable, screen-reader labels, respects `prefers-reduced-motion`.

## Privacy, briefly
We don't store anything on our servers. Your search stays in this browser tab and clears when you close it (one small `sessionStorage` record, removable with **Clear search**). There are no accounts, cookies, analytics, localStorage or IndexedDB, and no geolocation prompt. See [PRIVACY.md](PRIVACY.md).

## Where offers come from
Offer facts come **only** from [`public/offers.json`](public/offers.json). Every entry was researched by reading the brand's official rewards or terms page ([research notes](docs/OFFER_RESEARCH.md)), and each one records its `sourceUrl` and `lastVerified` date. If we couldn't confirm an offer from an official page, it shows **"Check with store"**. Entries older than 6 months show a **"May be outdated"** badge. A weekly GitHub Action checks every `sourceUrl` and opens an issue when a link breaks. AI is never used as a source of offer facts.

## Tech stack

### Frontend (runs in your browser)
| Piece | What it does | Why |
|---|---|---|
| [Vite](https://vite.dev) | Bundles the app into a few small static files | Fast builds, output any free host can serve |
| TypeScript (vanilla, no framework) | All app logic | Tiny bundle, fewer dependencies, easier to audit for XSS |
| [Leaflet](https://leafletjs.com) | The interactive map | Free, no API key, works with OpenStreetMap |
| [Fontsource](https://fontsource.org) (Bricolage Grotesque, Plus Jakarta Sans) | Self-hosted fonts | No third-party font requests, so no tracking |
| Plain CSS with design tokens | The plum "Soft Premium" look | One source of truth in `src/styles/tokens.css`, see [DESIGN.md](DESIGN.md) |

The app has only **three runtime dependencies**: Leaflet and two font packages.

### Free data services (no API keys)
| Service | Used for |
|---|---|
| [Photon](https://photon.komoot.io) by komoot | City suggestions as you type |
| [Nominatim](https://nominatim.org) | Turning a typed city into a location (max 1 request per second) |
| [Overpass API](https://overpass-api.de) | Finding nearby branches of brands with birthday offers |
| OpenStreetMap tiles | The map images |
| Google Maps links | "Get directions" is a plain URL, so it needs no key |

### Offer data
[`public/offers.json`](public/offers.json) is a hand-researched list of 102 offers across 11 countries. It uses no database. Every entry comes from the brand's official page and records:
- `sourceUrl`, the official page it came from;
- `lastVerified`, the date it was last checked;
- a reward type (Free, Discount or Needs past spend);
- step-by-step claim details.

AI is never used as a source of offer facts.

### Hosting, automation and testing
| Piece | Role |
|---|---|
| GitHub Pages | Hosts the live site for free |
| GitHub Actions | On every push: audit, typecheck, unit and e2e tests, Lighthouse, then deploy. A weekly job checks that every offer link still works. |
| Dependabot, secret scanning, push protection | Supply-chain and secret safety. Every Action is pinned to a commit SHA. |
| [Vitest](https://vitest.dev) | About 890 unit tests: data rules, filters, sorting, security checks |
| [Playwright](https://playwright.dev) | About 130 browser tests on desktop and Pixel 7, with all network calls mocked. Any XSS, CSP violation or unexpected request fails the test. |
| axe-core | Accessibility checks, with 0 violations required |
| Lighthouse CI | Performance ≥ 0.9, Accessibility and Best Practices ≥ 0.95 (currently 0.99 / 1.0 / 1.0) |
| Cloudflare Worker + Tavily (optional, not deployed yet) | Live "Found online" search. It only receives month and country. |

### Privacy and security by design
- **Strict Content Security Policy:** the page may only talk to the services listed above.
- **Nothing stored:** no cookies, accounts, analytics, localStorage or geolocation prompt. One small `sessionStorage` record keeps your search across a refresh and clears when the tab closes.
- **No raw HTML:** all page content is built as plain text, so injected scripts can't run.

Details are in [SECURITY.md](SECURITY.md) (STRIDE threat model) and [PRIVACY.md](PRIVACY.md).

## How it was built: a multi-agent team
This project was built with [Claude Code](https://claude.com/claude-code) as a **lead orchestrator** coordinating specialist AI subagents. Each subagent is a separate Claude instance with its own brief and the same tools: files, terminal, web and a real browser.

| Agent | Responsibility |
|---|---|
| **Orchestrator** | Plans the work, writes the briefs, reviews results, spot-checks facts, resolves conflicts, opens PRs, merges, and checks the live site |
| **Full-Stack Developer** | Builds features: search, map, filters, sorting, session restore, the Worker, CI/CD |
| **UI/UX Designer** | Design prototypes and the plum redesign, contrast, accessibility and motion |
| **Offer Researchers** (India and global, in parallel) | Read official brand pages and write offer data with exact claim steps |
| **Security Engineer** | Reviews every PR for XSS, privacy leaks and supply-chain risk, and fixes what it finds |
| **QA Tester** | Writes unit and browser tests, hunts bugs, runs live smoke tests, and re-checks offer classifications |

**Workflow for every feature**
1. The Full-Stack agent builds it, and the UI/UX agent styles it.
2. The Security and QA agents review it in parallel, and any fixes are applied.
3. Once both have signed off, the PR opens and must pass CI.
4. The PR is merged into `main`, which deploys it. The orchestrator then tests the live site.

**Shared memory between agents**
- [`docs/PLAN.md`](docs/PLAN.md): tasks and owners.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): numbered decisions with reasons.
- [`docs/HANDOFFS.md`](docs/HANDOFFS.md): what each agent finished, plus sign-offs.
- [`CLAUDE.md`](CLAUDE.md) and [`DESIGN.md`](DESIGN.md): the rules and the design system for future sessions.

**When agents disagree:** Security wins on safety, UI/UX wins on visuals, and the orchestrator records the decision. That's how bugs like a toast blocking taps on mobile, a regex performance risk, and offers wrongly labelled "Free" were caught before release.

## Local setup
You need Node 22 or later.

```bash
git clone https://github.com/raksharakyan/birthday-side-quests.git
cd birthday-side-quests
npm ci
npm run dev            # http://localhost:5173/birthday-side-quests/
```

| Command | What it does |
|---|---|
| `npm run build` | Typechecks the app, configs and Worker, then builds `dist/` |
| `npm test` | Unit tests (Vitest), including the Worker |
| `npx playwright install chromium && npm run test:e2e` | E2E on desktop and mobile, with all network calls mocked |
| `npm run lhci` | Lighthouse CI (Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95) |
| `npm run audit` | `npm audit --audit-level=high` |

Copy `.env.example` to `.env.local` to set `VITE_BASE` or `VITE_WORKER_URL`.

## Deploy
- **Site.** Pushing to `main` runs [`ci-deploy.yml`](.github/workflows/ci-deploy.yml): audit → typecheck → unit tests → build → Playwright → Lighthouse → deploy to GitHub Pages. In repo settings, Pages must be set to **Source: GitHub Actions**.
- **Found online Worker (optional).** Follow [worker/README.md](worker/README.md): `wrangler login`, then `wrangler secret put TAVILY_API_KEY`, then `wrangler deploy`. Then set the repo **variable** `VITE_WORKER_URL` to the Worker's https URL and re-run the workflow. Until you do, the tab stays hidden.
- **Cloudflare Pages alternative.** [`public/_headers`](public/_headers) adds the full security headers that GitHub Pages can't send.

## Adding a new offer
1. Find the brand's **official** rewards or T&C page. Blogs and coupon sites don't count.
2. Add an entry to [`public/offers.json`](public/offers.json):
   ```json
   {
     "id": "brand-in",
     "brand": "Brand",
     "category": "cafe",
     "offer": "Free birthday drink for app members",
     "howToClaim": "Join the app and add your birthday at least 7 days before",
     "countries": ["IN"],
     "channel": "in-store",
     "claimWindow": "day",
     "sourceUrl": "https://brand.example/rewards",
     "lastVerified": "2026-10-02",
     "verified": true,
     "rewardType": "free",
     "needsPastSpend": false,
     "osm": { "wikidata": "Q123", "nameRegex": "brand" }
   }
   ```
   - `category`: `cafe | dessert | restaurant | beauty | fashion | retail | online`
   - `channel`: `in-store | online | both`
   - `claimWindow`: `day | week | month | varies`
   - `countries`: ISO-2 codes, or `["*"]`
   - `rewardType` (required): `free` for a free item, gift, treat or entry with nothing to buy beyond joining a free programme; `discount` for money or percent off, a cash-value voucher, buy one get one, bonus points, or a free item that needs a purchase.
   - `needsPastSpend` (required): `true` when you only qualify after spending before (a tier reached by spend or points, a purchase in a past window, a paid membership, a yearly spend); `false` when anyone can join for free and get it. When unsure, pick `discount` and `true`. See [docs/OFFER_CLASSIFICATION.md](docs/OFFER_CLASSIFICATION.md).
   - `osm` is optional. Use `wikidata` for the brand's `brand:wikidata` tag; `nameRegex` allows only letters, digits, spaces and `'’&.-|()?^$`.
   - `venues` is optional and is for single-location destinations (theme parks, water parks): 1 to 20 `{ "name", "lat", "lng", "exact"? }`. The offer shows in Nearby only when a venue is within 150 km of the searched city. Use `"exact": false` for approximate coordinates (no map pin, directions by name). Use `venues` instead of `osm` and set `channel` to `in-store`.
3. Run `npm test`. The schema test rejects non-https URLs, unknown categories, a missing `rewardType` or `needsPastSpend`, overlong text and hidden Unicode tricks.
4. Open a PR. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs
[CLAUDE.md](CLAUDE.md) · [DESIGN.md](DESIGN.md) · [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [docs/PLAN.md](docs/PLAN.md) · [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/HANDOFFS.md](docs/HANDOFFS.md)

## Credits
Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Geocoding by Nominatim, branch search by the Overpass API. Please be kind to these free services.

## License
[MIT](LICENSE) © 2026 raksharakyan
