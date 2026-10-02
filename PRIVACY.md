# Privacy

**We don't store anything on our servers. Your search stays in this browser tab and clears when you close it.**

Birthday Side Quests has no server-side database, no accounts, no cookies, no analytics and no tracking pixels. It uses no localStorage or IndexedDB, and never asks for your browser's geolocation.

## Your search in this tab (session storage)
So a refresh doesn't lose your search, the app keeps **one small record in your browser's session storage**. It never leaves your device, and the browser deletes it when you close the tab (or window). It holds only:

- the city you searched, as shown in the box, and its map coordinates and country code;
- your birthday month and search radius;
- which tab is open (Nearby, Online or Found online);
- which quests you ticked as complete;
- whether the **Verified only** switch is on.

Nothing else is saved, and nothing is saved until you search or change one of these. **Clear search** deletes the record straight away. On load the app checks the record strictly and throws it away if anything looks wrong. Session storage is separate for each tab, isn't shared with other sites, and is never sent to us or to anyone else.

## What you type, and where it goes
| Data | Where it goes | Why |
|---|---|---|
| City text | **Nominatim** (nominatim.openstreetmap.org), only when you press search (skipped if you pick a suggestion, or after a refresh, because the coordinates are already in your tab) | To turn it into the city centre's coordinates and a country |
| Partial city text as you type | **Photon** by komoot (photon.komoot.io). Sent only after 3+ characters and a short pause (300 ms), never with your coordinates | To suggest matching cities, towns and villages |
| Coordinates (the search circle you choose: 2, 5, 10 or 20 km) | **Overpass API** (overpass-api.de) | To find nearby branches |
| Map view area | **OpenStreetMap tile servers** (tile.openstreetmap.org) | To draw the map |
| Birthday **month** + **country code** only | **Our Cloudflare Worker** → Tavily search (only if "Found online" is enabled) | To find birthday deals online. Your city and coordinates are never sent |

- Map and search results are cached **in memory** only. After a refresh the app reruns your saved search (Overpass again, no geocoding).
- Quest "done" checkmarks are kept in the session record above, so they survive a refresh but not closing the tab.
- Your location is never put in this app's URL, so it doesn't end up in your history or in shared links.
- We never ask for your full date of birth, name, email or phone number.
- The site sends `Referrer-Policy: no-referrer`. Requests to OpenStreetMap services and Photon send only the site's origin (`https://raksharakyan.github.io`), because their usage policy asks apps to identify themselves. No path and no user data is included.

## Third parties
Like any website, the services above can see your IP address and the request itself, under their own policies:
[OSMF privacy policy](https://osmfoundation.org/wiki/Privacy_Policy) · [Photon by komoot](https://www.komoot.com/privacy) · [Tavily](https://tavily.com/privacy) · [Cloudflare](https://www.cloudflare.com/privacypolicy/) · [GitHub Pages](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

Our Worker has logging turned off and doesn't record request details.

When you click **Get directions** or **Verify offer**, you leave our site for Google Maps or the brand's site. Those links open with `noopener noreferrer`.

## Questions
Open an issue on GitHub. Report security problems as described in [SECURITY.md](SECURITY.md).
