# Security Policy

Birthday Side Quests is a static, client-side web app (Vite + TypeScript + Leaflet) hosted on GitHub Pages, plus an optional Cloudflare Worker that proxies a web-search API for the "Found online" tab. It has no accounts, no backend database and no cookies. The only thing it stores is one validated `sessionStorage` record for the current tab (DECISIONS #18).

## Supported versions

| Version | Supported |
|---|---|
| `main` (what is deployed to GitHub Pages) | ✅ |
| Anything older (tags, forks, old builds) | ❌. Please reproduce on `main` first. |

The Worker in `worker/` is supported at the version on `main`.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: go to the repository's **Security** tab, choose **Advisories**, then **Report a vulnerability**. The direct link is <https://github.com/raksharakyan/birthday-side-quests/security/advisories/new>. Private vulnerability reporting is enabled for this repository.

Please include:
- what you found and where (URL, file and line, or request);
- steps to reproduce, or a proof of concept;
- the impact you expect.

This is a hobby project maintained in spare time. What to expect:
- an acknowledgement within **7 days**;
- an assessment within **14 days**;
- a fix or mitigation for confirmed high or critical issues as soon as practical.

You'll be credited in the advisory unless you ask not to be. Good-faith research is welcome, within these limits:
- Don't run automated scanning against third-party services we call (OpenStreetMap Nominatim, Overpass, the tile servers, Tavily).
- Don't try to exhaust the Worker's search quota.
- Don't access data that isn't yours.

## Architecture at a glance

```
Browser (static app, GitHub Pages)
  ├─ GET  offers.json                     same origin, curated data
  ├─ GET  nominatim.openstreetmap.org     the typed city text   (Referer: origin only)
  ├─ GET  photon.komoot.io/api/           partial typed text, ≥3 chars, debounced (Referer: origin only)
  ├─ POST overpass-api.de                 lat/lng + brand ids   (Referer: origin only)
  ├─ GET  tile.openstreetmap.org          map tiles             (Referer: origin only)
  └─ GET  <worker>/search?month=&country= (Referer: none)
           └─ Cloudflare Worker ── POST api.tavily.com  fixed query "birthday freebies … <Country> <Month>"
```

## Threat model (STRIDE)

| # | Category | Component / asset | Threat | Mitigations | Residual risk |
|---|---|---|---|---|---|
| S1 | **Spoofing** | Worker | Another website calls the Worker from a browser to spend our search quota. | CORS allows only the exact origin `https://raksharakyan.github.io` (`Vary: Origin`). Requests with no `Origin` or a different one get a **403**. Per-IP rate limit is about 20 requests a minute. 24h edge cache per (month, country). | `Origin` can be forged by non-browser clients such as curl. The rate limit and cache bound the cost, and the free Tavily tier needs no card, so the worst case is the "Found online" tab going quiet. |
| S2 | Spoofing | Search results, OSM names | Lookalike or reversed text (bidi override such as `U+202E`, zero-width characters) makes a link look like a trusted brand. | Text from the Worker, Nominatim, Photon and Overpass passes through `cleanDisplayText` (`src/text.ts`), which strips C0/C1 controls, bidi embeddings, overrides, isolates and marks, and invisible formatting characters. The Worker strips them too. `offers.json` entries that contain them are rejected. Live results are badged **"Unverified: check the link"**. | Homoglyph domains (for example Cyrillic "а") are not detected. The real hostname is shown as "Source", and the browser shows the real URL on hover. |
| S3 | Spoofing | GitHub Pages site | Clickjacking (the site framed by an attacker). | `frame-ancestors 'none'` and `X-Frame-Options: DENY` in `public/_headers`, for Cloudflare Pages deployments. | **GitHub Pages cannot send these headers**, and `frame-ancestors` is ignored in `<meta>`. The app has no state-changing or sensitive actions, so impact is low. |
| T1 | **Tampering** | DOM (XSS) | Hostile strings from `offers.json`, Nominatim, Photon, Overpass or the Worker are rendered as HTML. | All rendering goes through `el()` / `textContent` (`src/render/dom.ts`). There is no `innerHTML`, `insertAdjacentHTML`, `eval` or string timers in `src/`, and a unit test enforces this. Elements are built from a tag blocklist (script, style, iframe, object, embed, base, link, meta, template and others) and an attribute allowlist that has no `on*`, `style`, `src`, `srcset`, `srcdoc`, `formaction` or `xlink:href`. `href` is accepted only through `safeHttpsUrl` (https, no credentials). `label` (for `<optgroup>`) is a plain-text attribute. Icons use `svg()` (`createElementNS`), which allows only shape elements (`svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`) and presentation attributes, so no `<script>`, `<a>`, `<use>`, `<foreignObject>`, `<animate>`/`<set>` or `href`; it is only ever called with constants. Autocomplete bolds the typed prefix with an `el('b')` text node. Session-restored text goes only to `textContent` or an input's `value`. Leaflet gets DOM nodes for popups and divIcons, never HTML strings, and the attribution is a constant. A strict CSP with `script-src 'self'` is the second line of defence. | Low. Leaflet itself uses `innerHTML` only for constant strings (zoom buttons, close button, attribution). |
| T2 | Tampering | Overpass query | Injection into Overpass QL. | The query is built only from validated `offers.json` fields: wikidata `^Q\d+$`, and `nameRegex` restricted to letters, digits and a few punctuation characters (no quotes or backslash), then escaped. Coordinates are finite numbers formatted with `toFixed`. User text never reaches Overpass. | None known. |
| T3 | Tampering | `offers.json` | A malicious or careless PR adds a phishing `sourceUrl` or fake offer. | Changes go through PR review. A validator enforces https URLs, field charsets and length caps. A unit test checks that every shipped `sourceUrl` is https and that the file has no invisible or bidi characters. A weekly link check runs, and CONTRIBUTING requires official brand URLs. | Review is human. A plausible-looking official URL could slip through. |
| T4 | Tampering | Supply chain / CI | A compromised dependency or Action alters the deployed bundle. | `package-lock.json` is committed and installed with `npm ci`. Runtime dependencies are minimal: `leaflet` and two `@fontsource-variable` font packages pinned to exact versions (5.3.0, OFL, no install scripts; lockfile integrity matches the registry). Fonts are bundled as hashed same-origin assets. `npm audit --audit-level=high` gates CI. Every Action is pinned to a full commit SHA, and each SHA was verified against its tag. There is no `pull_request_target`. `permissions` are least-privilege per job, and checkout uses `persist-credentials: false`. No `${{ github.event.* }}` is interpolated into `run:`. Lighthouse CI uses `npx`, which is not locked, so it runs in its **own job** with no npm cache write, separate from the job that uploads the Pages artifact. Dependabot covers npm and Actions. Secret scanning and push protection are on. | A malicious release of a locked dependency could still land through a Dependabot PR if a reviewer merges it. Playwright browsers are downloaded at CI time from Microsoft's CDN. |
| R1 | **Repudiation** | Worker / site | No audit trail of who called what. | Intentional: the privacy design is "no logs". Cloudflare observability is disabled, and the Worker has no `console.*`. | Abuse can't be attributed after the fact. Accepted for a stateless, no-account app. |
| I1 | **Information disclosure** | User location | The typed city or the coordinates leak. | City text goes only to Nominatim (on submit) and Photon (autocomplete: partial text after 3+ characters, debounced, only the fixed parameters `q`, `limit=5`, `lang=en`, `layer=city`, with no coordinates or bias parameters, `credentials: 'omit'`; `parsePhoton` strictly validates coordinates and ISO-2 country). Coordinates go only to Overpass, and the tile servers learn which tiles are viewed. Nothing goes in the URL, history, localStorage, IndexedDB or cookies, and there's no `navigator.geolocation`. **Session persistence:** one `sessionStorage` key (`bsq-session`, `src/session.ts`, the only module allowed to touch storage, enforced by a unit test) holds `{v, city, lat, lng, countryCode, month, radius, tab, done, verifiedOnly, types}` (version 3; `types` is exactly `{free, discount, past}` of booleans; exact version 1 and 2 records are migrated with every type on, and `verifiedOnly: false` for version 1). It is same-origin, per tab, and cleared when the tab closes or on **Clear search**. On load it is size-capped and strictly schema-validated (exact key set, version, ranges, boolean `verifiedOnly`, exact-key boolean `types`, ISO-2, radius from the allowed list, offer-id charset, no `<`/`>` or control/bidi characters in the city); anything else is discarded and removed. Restored text is rendered only via `textContent`/input `value`. Coordinates from the record skip Nominatim on reload. Global `Referrer-Policy: no-referrer`, with origin-only `strict-origin` for OSM services. The Worker receives **only month and country**. No analytics, no third-party scripts, fonts or CDNs. All fonts are self-hosted. | The OSM operators see the visitor's IP plus the query or area, under the [OSMF privacy policy](https://osmfoundation.org/wiki/Privacy_Policy). komoot (Photon) sees the IP and whatever the user types after 3 characters, before they submit, so someone who types a street address instead of a city discloses it to Photon (the UI asks for a city). Tavily sees the month and country, but not the IP, because the Worker calls it. Cloudflare sees the IP. The session record is readable by anyone with access to the open tab (same device), and by any script running on the origin, which CSP `script-src 'self'` limits to our own bundle. |
| I2 | Information disclosure | Worker secrets | `TAVILY_API_KEY` leaks through the repo, responses or logs. | Stored only as a Wrangler secret (`env`). `.dev.vars` and `.env*` are git-ignored. Error responses are generic (`{"error":"search unavailable"}`, no upstream body or status). No logging. The repo history was scanned: no secrets found. | None known. |
| D1 | **Denial of service** | Worker quota | Request floods exhaust the Tavily free tier. | Rate limit binding, strict parameter validation (only 12 × ~250 possible queries), 24h edge cache, 10-second upstream timeout. | The Cache API is a **no-op on `*.workers.dev`**, so it needs a custom domain or route for caching. The rate limiter **fails open** if the binding errors. |
| D2 | Denial of service | OSM services, Photon | Abusing the public Nominatim, Photon or Overpass servers, or being blocked by them. | 1 request/second throttle and an in-memory cache for Nominatim. Nominatim geocoding happens only on submit. Photon: 300 ms debounce, minimum 3 characters, aborts superseded requests, in-memory cache, 5 s timeout; failures mean silently no suggestions. A single Overpass query with a 25s timeout and at most 60 results (150 for 10–20 km radius). | A heavy-traffic spike could get the origin rate-limited by OSM. The app degrades to "quests listed, pins unavailable". Photon's public API is fair-use and may throttle; autocomplete then just stops suggesting. Wider radii make heavier Overpass queries (about 9 s at 20 km in Bengaluru). |
| D3 | Denial of service | Client | Huge or hostile JSON or strings. | Length caps on every field: 10 live results, 60 branches (150 for a 10–20 km radius), 5 Photon suggestions, 500 offers. Regexes in `offers.json` are restricted (no `*`, `+` or `{}`) and their backtracking is bounded: `nameRegexBranching` (2 per `?` × alternatives per group) must be ≤ 1024, which rejects stacked-`?` and alternation bombs (shipped maximum is 16). Branch names are capped at 100 characters before matching. The session record is capped at 16 KB before `JSON.parse`. | None known. |
| E1 | **Elevation of privilege** | CI tokens | A PR or issue content gains write access. | Top-level `contents: read`. `pages: write` and `id-token: write` only in the `deploy` job, which runs only on `push` to `main`. The link-check job has `issues: write` only and builds issues from repo data via `execFileSync` (no shell), with Markdown-escaped cells. | None known. |
| E2 | Elevation of privilege | Worker → LLM | Prompt injection. | **Not applicable.** There is no LLM in v1. Search results are treated as untrusted plain text and never executed or interpreted. | If an optional LLM summary is added later, it needs its own review: results become untrusted model input. |

## Security headers and CSP

**GitHub Pages (production).** Pages can't set custom HTTP headers. The build (`vite.config.ts` → `csp.config.ts`) injects a `<meta http-equiv="Content-Security-Policy">`, and `index.html` sets `<meta name="referrer" content="no-referrer">`.

```
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data: https://tile.openstreetmap.org; font-src 'self';
connect-src 'self' https://nominatim.openstreetmap.org https://overpass-api.de https://photon.komoot.io [<worker origin>];
object-src 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests
```

- **No `'unsafe-inline'` or `'unsafe-eval'`.** There are no inline scripts or styles in the built HTML; CI greps for them. Leaflet and the confetti set styles through the CSSOM (`element.style.*` / `style.setProperty`), which `style-src` doesn't restrict. Playwright e2e asserts zero console or CSP errors with the map, markers and confetti running.
- **`img-src data:`** is kept only for Leaflet's built-in 1×1 transparent GIF, which it assigns to `<img>` tiles when aborting tile loads during zoom or pan. A data: image can't run script, and without it every aborted tile logs a CSP violation.
- **`connect-src`** is exactly: same origin (`offers.json`), Nominatim, Overpass, Photon (autocomplete, DECISIONS #16), and the Worker origin when `VITE_WORKER_URL` is set. That URL must be https without credentials, or the build fails.
- **Referrer.** The global policy is `no-referrer`. Nominatim, Photon and Overpass `fetch` calls, and Leaflet tile `<img>`s, use `referrerPolicy: 'strict-origin'`. Those calls send only `https://raksharakyan.github.io`, never a path or query, because OSM usage policies require an identifying Referer (see DECISIONS #6 and #9). Worker calls use `no-referrer`.
- **Links.** Every `target="_blank"` link (in fact any link with a `target`) gets `rel="noopener noreferrer"`. Directions links are built only from finite, clamped numbers, or, for a venue with approximate coordinates (`exact: false`), from its validated `offers.json` name (plain text, at most 80 characters, no `<`/`>`, control, bidi or lone-surrogate characters), fully percent-encoded with `encodeURIComponent` plus `!'()*` into the fixed `https://www.google.com/maps/dir/?api=1&destination=` prefix. Both go through `safeHttpsUrl` and `externalLink`. The user's location is never part of a directions link.

**Cloudflare Pages (alternative).** `public/_headers` sends the same CSP as a real header, adding `frame-ancestors 'none'`. It also sends:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`
- `X-Frame-Options: DENY`
- `Cross-Origin-Opener-Policy: same-origin`

**Worker responses** send `Content-Type: application/json`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, plus exact-origin CORS with `Vary: Origin`. Errors are sent with `Cache-Control: no-store`.

## Known limitations

1. **GitHub Pages headers.** `X-Content-Type-Options`, `Permissions-Policy`, `frame-ancestors`/`X-Frame-Options`, COOP and HSTS preload can't be set on Pages. The site can be framed, though it has no sensitive actions. Use Cloudflare Pages with `_headers` if these matter.
2. **Meta CSP limits.** `<meta>` CSP can't use `frame-ancestors`, `report-uri`/`report-to` or `sandbox`. Violations are not reported anywhere.
3. **Third parties.** OpenStreetMap's Nominatim, Overpass and tile servers see the visitor's IP address, the typed place name or map area, and the site origin. Photon (komoot) sees the IP, partial typed place text (3+ characters, as you type) and the site origin. Cloudflare sees the IP of anyone using "Found online". Tavily sees only the month and country, sent from Cloudflare's IP.
4. **Worker cache on `workers.dev`.** The Cache API does nothing on `*.workers.dev`, so without a custom domain every uncached request reaches Tavily (rate limit still applies). The rate limiter fails open if the binding is misconfigured.
5. **CORS is not authentication.** Non-browser clients can send any `Origin`. The Worker's protection against them is the rate limit and the tiny, fixed query space.
6. **Unverified live results.** "Found online" links are third-party pages chosen by a search engine. They are shown as plain text with an "Unverified" label, but the destination page can still be a scam. Users are told to check links.
7. **Lighthouse CI** runs `@lhci/cli` through `npx`, which is outside the lockfile because of high-severity advisories in its dependency tree. It is isolated in its own CI job and never touches the deployed artifact.
