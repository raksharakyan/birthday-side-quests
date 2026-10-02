# Privacy

**We don't store anything. Your location stays in your browser tab.**

Birthday Side Quests has no server-side database, no accounts, no cookies, no analytics and no tracking pixels. It also uses no localStorage, sessionStorage or IndexedDB, and never asks for your browser's geolocation.

## What you type, and where it goes
| Data | Where it goes | Why |
|---|---|---|
| City or area text | **Nominatim** (nominatim.openstreetmap.org), only when you press search | To turn it into coordinates and a country |
| Coordinates (about 5 km search circle) | **Overpass API** (overpass-api.de) | To find nearby branches |
| Map view area | **OpenStreetMap tile servers** (tile.openstreetmap.org) | To draw the map |
| Birthday **month** + **country code** only | **Our Cloudflare Worker** → Tavily search (only if "Found online" is enabled) | To find birthday deals online. Your city and coordinates are never sent |

- Results are cached **in memory** in your tab and disappear when you close or refresh it. Quest "done" checkmarks are cleared on refresh too.
- Your location is never put in this app's URL, so it doesn't end up in your history or in shared links.
- We never ask for your full date of birth, name, email or phone number.
- The site sends `Referrer-Policy: no-referrer`. Requests to OpenStreetMap services send only the site's origin (`https://raksharakyan.github.io`), because their usage policy asks apps to identify themselves. No path and no user data is included.

## Third parties
Like any website, the services above can see your IP address and the request itself, under their own policies:
[OSMF privacy policy](https://osmfoundation.org/wiki/Privacy_Policy) · [Tavily](https://tavily.com/privacy) · [Cloudflare](https://www.cloudflare.com/privacypolicy/) · [GitHub Pages](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

Our Worker has logging turned off and doesn't record request details.

When you click **Get directions** or **Verify offer**, you leave our site for Google Maps or the brand's site. Those links open with `noopener noreferrer`.

## Questions
Open an issue on GitHub. Report security problems as described in [SECURITY.md](SECURITY.md).
