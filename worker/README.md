# birthday-side-quests-search (Cloudflare Worker)

Search proxy for the **Found online** tab. It accepts only a month and a country code, builds a
fixed query on the server, calls [Tavily](https://tavily.com) and returns at most 10 sanitised
plain-text results.

```
GET /search?month=10&country=IN
→ 200 [{ "title": "...", "url": "https://...", "snippet": "...", "source": "example.com" }]
```

| Status | When |
|---|---|
| 400 | `month` isn't an integer 1–12, `country` isn't `^[A-Z]{2}$`, or extra/duplicate params |
| 403 | `Origin` header missing or not allowed |
| 404 / 405 | any other path / any method other than GET or OPTIONS |
| 429 | over ~20 requests per minute from one IP (`Retry-After: 60`) |
| 502 | the search provider failed |
| 503 | `TAVILY_API_KEY` secret not set |

## Hardening
- **No user text is forwarded.** The query is `birthday freebies birthday month offers <Country name> <Month name>`.
- **CORS.** Only the exact `ALLOWED_ORIGIN` gets through, plus `http://localhost:5173` and `:4173` when `ALLOW_LOCALHOST="true"`. `Vary: Origin` is set, and requests from other origins get a 403.
- **Rate limit.** The Workers Rate Limiting binding `RATE_LIMITER` is keyed by `CF-Connecting-IP`. If the binding is missing, the Worker still runs without it.
- **Caching.** Results are cached at the edge for 24h per (month, country) through `caches.default`. Clients get `Cache-Control: public, max-age=3600`.
  - *Note:* Cloudflare's Cache API does nothing on `*.workers.dev` hostnames. To get the 24h cache (and save search quota), attach the Worker to a custom domain or route.
- **No logging.** `[observability] enabled = false` and the Worker has no `console.log`.
- **Sanitising.** Tags, control characters and bidi characters are stripped. Titles are capped at 120 characters and snippets at 300. URLs must be `https:` with no credentials. Results are de-duplicated by host+path, and a small spam keyword filter runs.

## Deploy
You need a free Cloudflare account and a free Tavily API key. Run these from the repo root:

```sh
npm ci
cd worker
npx wrangler login                      # opens the browser
npx wrangler secret put TAVILY_API_KEY  # paste the key when asked; it is never committed
npx wrangler deploy                     # prints https://birthday-side-quests-search.<you>.workers.dev
```

Then set the repository variable `VITE_WORKER_URL` to that https URL (Settings → Secrets and variables → Actions → Variables) and re-run the deploy workflow. The site build adds that origin to the CSP `connect-src`.

If you use a different site origin, change `ALLOWED_ORIGIN` in `wrangler.toml`. `namespace_id` under `[[ratelimits]]` can be any integer string that is unique in your account.

## Local dev
```sh
cd worker
printf 'TAVILY_API_KEY=tvly-...\nALLOW_LOCALHOST=true\n' > .dev.vars   # git-ignored
npx wrangler dev
# then: VITE_WORKER_URL=http://... is rejected (https only) — test against the deployed worker,
# or call the local worker directly:
curl -H 'Origin: http://localhost:5173' 'http://localhost:8787/search?month=10&country=IN'
```

## Tests
`npm run worker:test` from the repo root runs Vitest on `worker/test`.
