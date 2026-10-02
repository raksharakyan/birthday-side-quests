# 🎂 Birthday Side Quests ✨

> Free birthday treats near you, turned into tiny adventures.

**Live:** https://raksharakyan.github.io/birthday-side-quests/

Type in your city and pick your birthday month. You get a pastel map and a list of birthday side quests: cafés, dessert shops, beauty brands and stores near you that give birthday freebies or discounts. Online-only deals have their own tab.

![Desktop screenshot](docs/screenshots/desktop.png)

| Mobile | Online tab |
|---|---|
| <img src="docs/screenshots/mobile.png" width="300" alt="Mobile screenshot"> | <img src="docs/screenshots/online-tab.png" width="420" alt="Online tab screenshot"> |

## Features
- **Nearby quests.** Finds branches of brands with birthday programs within about 5 km of your city (using OpenStreetMap / Overpass). Shows heart and gift pins on a Leaflet map.
- **Quest cards.** Each card shows:
  - the offer and how to claim it, plus the claim window (day, week or month);
  - a ✅ Verified or ⚠️ Check with store badge, and the date it was last verified;
  - **Get directions**, which opens Google Maps with no API key;
  - **Verify offer**, which links to the brand's official page;
  - a "done" checkbox with confetti. The checkbox is kept in memory only.
- **Online tab.** App and e-commerce birthday deals for your country. No city needed.
- **Found online tab (optional).** Live web results for "birthday freebies + month + country" through a Cloudflare Worker. Clearly labelled *unverified*.
- **Birthday-month awareness.** "It's your birthday month, and your quests are live!" or "Your quest window opens in 3 months 🎀".
- **Accessible.** Mobile-first, WCAG AA contrast, keyboard navigable, screen-reader labels, respects `prefers-reduced-motion`.

## Privacy, briefly
We don't store anything on our servers. Your search stays in this browser tab and clears when you close it (one small `sessionStorage` record, removable with **Clear search**). There are no accounts, cookies, analytics, localStorage or IndexedDB, and no geolocation prompt. See [PRIVACY.md](PRIVACY.md).

## Where offers come from
Offer facts come **only** from [`public/offers.json`](public/offers.json). Every entry was researched by reading the brand's official rewards or terms page ([research notes](docs/OFFER_RESEARCH.md)), and each one records its `sourceUrl` and `lastVerified` date. If we couldn't confirm an offer from an official page, it shows **"Check with store"**. Entries older than 6 months show a **"May be outdated"** badge. A weekly GitHub Action checks every `sourceUrl` and opens an issue when a link breaks. AI is never used as a source of offer facts.

## Tech
Vite + vanilla TypeScript, Leaflet + OpenStreetMap tiles, Nominatim (geocoding), Overpass API (branches), and an optional Cloudflare Worker + Tavily for "Found online". Fonts are self-hosted with Fontsource. There are only three runtime dependencies.

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
     "osm": { "wikidata": "Q123", "nameRegex": "brand" }
   }
   ```
   - `category`: `cafe | dessert | restaurant | beauty | fashion | retail | online`
   - `channel`: `in-store | online | both`
   - `claimWindow`: `day | week | month | varies`
   - `countries`: ISO-2 codes, or `["*"]`
   - `osm` is optional. Use `wikidata` for the brand's `brand:wikidata` tag; `nameRegex` allows only letters, digits, spaces and `'’&.-|()?^$`.
3. Run `npm test`. The schema test rejects non-https URLs, unknown categories, overlong text and hidden Unicode tricks.
4. Open a PR. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs
[SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [docs/PLAN.md](docs/PLAN.md) · [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/HANDOFFS.md](docs/HANDOFFS.md)

## Credits
Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Geocoding by Nominatim, branch search by the Overpass API. Please be kind to these free services.

## License
[MIT](LICENSE) © 2026 raksharakyan
