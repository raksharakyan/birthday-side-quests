# Decisions log

Owner: Orchestrator. Format: date · decision · reason · who won (if conflict).

1. **2026-10-02 · Stack: Vite + vanilla TypeScript + Leaflet.** Smallest bundle, minimal deps (supply-chain), no framework HTML-string templating → easier XSS audit. (User approved.)
2. **2026-10-02 · Hosting: GitHub Pages.** No extra accounts. Limitation: no custom HTTP headers → CSP + Referrer-Policy via `<meta>`; `X-Content-Type-Options`, `Permissions-Policy`, `frame-ancestors` cannot be set. A `_headers` file is shipped for anyone deploying to Cloudflare Pages.
3. **2026-10-02 · Offer facts come only from curated `offers.json`** researched from official brand pages. Unconfirmed → `verified:false` → "Check with store".
4. **2026-10-02 · Hybrid live search ("Found online").** Cloudflare Worker proxies a search API (Tavily free tier). Worker accepts only `{month, country}` — never free text — so user location never leaves the browser except to Nominatim/Overpass. Results are labelled unverified, rendered as plain text. Section hidden if `VITE_WORKER_URL` unset.
5. **2026-10-02 · No AI text generation in v1.** Cute quest lines from deterministic category templates. Zero keys, zero hallucination risk.
6. **2026-10-02 · Referrer conflict (Security vs. Nominatim policy).** Global `no-referrer`, but Nominatim/Overpass fetches use `referrerPolicy: 'strict-origin'` (origin only, no path/user data) so OSM can identify the app as its policy requires. Security approved: origin carries no user data.
7. **2026-10-02 · Online tab** for online/app-only birthday deals; city optional there, country selectable manually.
8. **2026-10-02 · Seed data accepted from research (25 offers: 16 verified, 9 "Check with store").** Orchestrator spot-checked Starbucks US T&C, The Body Shop India loyalty page and Krispy Kreme UK rewards page via WebFetch — all matched the draft. Discount-only offers (Westside, Body Shop IN Platinum) kept because the user explicitly wants birthday discounts too. Rejected brands (Chaayos, Dunkin', H&M, Häagen-Dazs, Pret, etc.) listed in docs/OFFER_RESEARCH.md.
