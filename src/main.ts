// Only the weights/subsets we use (Fredoka 600 display, Nunito 400/700 body); other scripts fall back to system fonts.
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-ext-400.css';
import '@fontsource/nunito/latin-ext-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { GeocodeError, geocode } from './geocode';
import { isLiveSearchEnabled, liveSearch } from './liveSearch';
import { filterOffers, loadOffers, monthInfo } from './offers';
import type { Suggestion } from './autocomplete';
import { DEFAULT_RADIUS_M, RADIUS_OPTIONS_M, distanceM, fetchBranches, nearestByOffer } from './overpass';
import { createCombobox } from './render/combobox';
import { initCelebrations } from './render/confetti';
import { el } from './render/dom';
import type { MapView } from './render/map';
import { renderEmpty, renderLiveList, renderNearbyList, renderQuestList } from './render/quests';
import type { Branch, LiveResult, Offer, Place } from './types';

/*
 * App state is in memory only. Never write to localStorage/sessionStorage/cookies/IndexedDB,
 * never put the user's location in the URL, and never use the browser geolocation API.
 */
interface State {
  offers: Offer[];
  place: Place | null;
  month: number | null;
  onlineCountry: string | null;
  branches: Map<string, Branch>;
  /** Radius used for the last finished branch lookup (null while loading / before any lookup). */
  searchedRadiusM: number | null;
}

const state: State = { offers: [], place: null, month: null, onlineCountry: null, branches: new Map(), searchedRadiusM: null };
/** Place picked from the autocomplete list, valid while the input still shows its label. */
let picked: { text: string; place: Place } | null = null;
const liveCache = new Map<string, LiveResult[]>();
let searchSeq = 0;
let mapView: MapView | null = null;
let offersReady: Promise<void> | null = null;

function $(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node;
}

const form = $('search-form') as HTMLFormElement;
const cityInput = $('city') as HTMLInputElement;
const monthSelect = $('month') as HTMLSelectElement;
const countrySelect = $('country') as HTMLSelectElement;
const radiusSelect = $('radius') as HTMLSelectElement;
const statusEl = $('status');
const monthInfoEl = $('month-info');
const nearbyList = $('nearby-list');
const onlineList = $('online-list');
const foundList = $('found-list');
const mapEl = $('map');
const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');

type StatusKind = 'info' | 'loading' | 'error' | 'success';
function setStatus(message: string, kind: StatusKind = 'info'): void {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
  document.body.classList.toggle('is-loading', kind === 'loading');
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();
function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

// ---------- tabs (WAI-ARIA tabs pattern) ----------
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
function visibleTabs(): HTMLButtonElement[] {
  return tabs.filter((t) => !t.hidden);
}
function selectTab(tab: HTMLButtonElement, focus = false): void {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    const panelId = t.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) panel.hidden = !selected;
  }
  if (focus) tab.focus();
  if (tab.id === 'tab-found') void refreshFoundOnline();
  if (tab.id === 'tab-nearby') mapView?.invalidateSize();
}
for (const t of tabs) {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const vis = visibleTabs();
    const i = vis.indexOf(t);
    let next: HTMLButtonElement | undefined;
    if (e.key === 'ArrowRight') next = vis[(i + 1) % vis.length];
    else if (e.key === 'ArrowLeft') next = vis[(i - 1 + vis.length) % vis.length];
    else if (e.key === 'Home') next = vis[0];
    else if (e.key === 'End') next = vis[vis.length - 1];
    if (next) {
      e.preventDefault();
      selectTab(next, true);
    }
  });
}
const foundTab = $('tab-found') as HTMLButtonElement;
foundTab.hidden = !isLiveSearchEnabled();

// ---------- offers ----------
function ensureOffers(): Promise<void> {
  if (!offersReady) {
    offersReady = loadOffers()
      .then((file) => {
        state.offers = file.offers;
        populateCountries();
        renderOnline();
      })
      .catch((err: unknown) => {
        offersReady = null;
        throw err;
      });
  }
  return offersReady;
}

function populateCountries(extra?: string): void {
  const codes = new Set<string>();
  for (const o of state.offers) for (const c of o.countries) if (c !== '*') codes.add(c);
  if (extra) codes.add(extra);
  const current = countrySelect.value;
  const sorted = [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  countrySelect.replaceChildren(
    el('option', { value: '' }, ['Pick your country…']),
    ...sorted.map((c) => el('option', { value: c }, [countryName(c)])),
  );
  countrySelect.value = codes.has(current) ? current : '';
}

function renderOnline(): void {
  const list = filterOffers({ offers: state.offers, country: state.onlineCountry, channel: 'online' });
  if (list.length === 0) {
    renderEmpty(
      onlineList,
      state.onlineCountry
        ? 'No online birthday quests for this country yet — try another country, or check back soon 🎀'
        : 'No worldwide online quests yet — pick your country above to see deals you can claim online 💻',
      'empty',
    );
  } else {
    renderQuestList(onlineList, list, { idPrefix: 'online' });
  }
}

function renderNearby(): void {
  if (!state.place) return;
  const list = filterOffers({ offers: state.offers, country: state.place.countryCode, channel: 'nearby' });
  if (list.length === 0) {
    renderEmpty(nearbyList, 'No in-store birthday quests here yet. Peek at the Online tab for treats you can claim from anywhere 💻');
    return;
  }
  const { place } = state;
  const distances = new Map<string, number>();
  for (const [id, b] of state.branches) distances.set(id, distanceM(place.lat, place.lng, b.lat, b.lng));
  renderNearbyList(nearbyList, list, {
    branches: state.branches,
    distances,
    restHeading:
      state.searchedRadiusM !== null
        ? `More quests in ${countryName(place.countryCode)} (no branch found within ${km(state.searchedRadiusM)})`
        : undefined,
    idPrefix: 'nearby',
  });
}

function km(radiusM: number): string {
  return `${Math.round(radiusM / 1000)} km`;
}

// ---------- found online ----------
async function refreshFoundOnline(): Promise<void> {
  if (!isLiveSearchEnabled()) return;
  const month = state.month;
  const country = state.onlineCountry;
  if (!month || !country) {
    renderEmpty(foundList, "Pick your birthday month and a country to see what's out there.");
    return;
  }
  const key = `${month}-${country}`;
  const cached = liveCache.get(key);
  if (cached) {
    showLive(cached);
    return;
  }
  renderEmpty(foundList, 'Searching the web for birthday deals…', 'loading');
  foundList.setAttribute('aria-busy', 'true');
  try {
    const results = await liveSearch(month, country);
    liveCache.set(key, results);
    if (state.month === month && state.onlineCountry === country) showLive(results);
  } catch {
    renderEmpty(foundList, "Live search isn't available right now. The Nearby and Online tabs still work!", 'error');
  } finally {
    foundList.removeAttribute('aria-busy');
  }
}
function showLive(results: LiveResult[]): void {
  if (results.length === 0) renderEmpty(foundList, 'Nothing new found online for this month — check back later.');
  else renderLiveList(foundList, results);
}
function foundTabSelected(): boolean {
  return foundTab.getAttribute('aria-selected') === 'true' && !foundTab.hidden;
}

// ---------- map ----------
async function getMap(): Promise<MapView> {
  if (!mapView) {
    const { createMap } = await import('./render/map');
    mapEl.replaceChildren();
    mapView = createMap(mapEl);
  }
  return mapView;
}

// ---------- search ----------
function readMonth(): number | null {
  const m = Number(monthSelect.value);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}

function showMonthInfo(): void {
  if (!state.month) {
    monthInfoEl.hidden = true;
    return;
  }
  const info = monthInfo(state.month);
  monthInfoEl.textContent = info.label;
  monthInfoEl.dataset.birthdayMonth = String(info.isBirthdayMonth);
  monthInfoEl.hidden = false;
}

function geocodeMessage(err: unknown): string {
  if (err instanceof GeocodeError) {
    switch (err.kind) {
      case 'NotFound':
        return "We couldn't find that place. Try a nearby city or add the country, e.g. “Indiranagar, Bengaluru”.";
      case 'RateLimited':
        return 'The map search is a bit busy. Please wait a few seconds and try again.';
      case 'Offline':
        return "You're offline. Reconnect to the internet and try again.";
      case 'Invalid':
        return 'Type a city or area to find quests near you (or open the Online tab).';
      case 'Upstream':
        return 'The map search is having trouble right now. Please try again in a moment.';
    }
  }
  return 'Something went wrong. Please try again.';
}

function readRadius(): number {
  const r = Number(radiusSelect.value);
  return (RADIUS_OPTIONS_M as readonly number[]).includes(r) ? r : DEFAULT_RADIUS_M;
}

async function onSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  combobox.cancel();
  const month = readMonth();
  if (!month) {
    ++searchSeq;
    setStatus('Pick your birthday month first 🎂', 'error');
    monthSelect.focus();
    return;
  }
  const city = cityInput.value;
  if (city.trim() === '') {
    ++searchSeq;
    state.month = month;
    showMonthInfo();
    setStatus('Type a city or area to find quests near you (or open the Online tab).', 'error');
    cityInput.focus();
    return;
  }
  // A picked suggestion already has coordinates + country: skip Nominatim entirely.
  await runSearch(picked && picked.text === city ? picked.place : city);
}

/** Runs the quest search for typed text (geocoded via Nominatim) or an already-resolved place. */
async function runSearch(where: string | Place): Promise<void> {
  const seq = ++searchSeq;
  const month = readMonth();
  if (!month) return;
  state.month = month;
  showMonthInfo();
  const radiusM = readRadius();

  setStatus('Looking up your area…', 'loading');
  submitBtn?.setAttribute('aria-disabled', 'true');
  try {
    const [place] = await Promise.all([typeof where === 'string' ? geocode(where) : Promise.resolve(where), ensureOffers()]);
    if (seq !== searchSeq) return;
    state.place = place;
    state.branches = new Map();
    state.searchedRadiusM = null;
    state.onlineCountry = place.countryCode;
    populateCountries(place.countryCode);
    countrySelect.value = place.countryCode;
    renderOnline();
    renderNearby();
    if (foundTabSelected()) void refreshFoundOnline();

    const nearby = filterOffers({ offers: state.offers, country: place.countryCode, channel: 'nearby' });
    const map = await getMap();
    if (seq !== searchSeq) return;
    map.clearBranches();
    map.showPlace(place, radiusM);

    if (nearby.length === 0) {
      setStatus(`No in-store quests near ${place.label} yet — the Online tab has treats you can claim anywhere.`, 'info');
      return;
    }
    const quests = `${nearby.length} quest${nearby.length === 1 ? '' : 's'}`;
    setStatus(`Found ${nearby.length} birthday quest${nearby.length === 1 ? '' : 's'}. Looking for shops within ${km(radiusM)}…`, 'loading');
    try {
      const branches = await fetchBranches(nearby, place.lat, place.lng, fetch, radiusM);
      if (seq !== searchSeq) return;
      state.branches = nearestByOffer(branches, place.lat, place.lng);
      state.searchedRadiusM = radiusM;
      map.showBranches(branches, new Map(state.offers.map((o) => [o.id, o])));
      renderNearby();
      setStatus(
        branches.length > 0
          ? `Found ${quests} and ${branches.length} shop${branches.length === 1 ? '' : 's'} on the map within ${km(radiusM)} of ${place.label}.`
          : `Found ${quests} for your area. We couldn't spot their shops within ${km(radiusM)} on the map — try a bigger search radius.`,
        'success',
      );
    } catch {
      if (seq !== searchSeq) return;
      setStatus(`Found ${quests}. We couldn't load shop pins right now — your quests are still listed below.`, 'info');
    }
  } catch (err) {
    if (seq !== searchSeq) return;
    setStatus(err instanceof GeocodeError ? geocodeMessage(err) : 'We couldn’t load the offers list. Please refresh and try again.', 'error');
  } finally {
    if (seq === searchSeq) submitBtn?.removeAttribute('aria-disabled');
  }
}

function onSuggestion(s: Suggestion): void {
  const place: Place = { lat: s.lat, lng: s.lng, countryCode: s.countryCode, label: s.label };
  picked = { text: cityInput.value, place };
  if (!readMonth()) {
    ++searchSeq;
    setStatus('Lovely! Now pick your birthday month 🎂', 'info');
    monthSelect.focus();
    return;
  }
  void runSearch(place);
}

const combobox = createCombobox({ input: cityInput, host: $('city-combo'), live: $('suggest-live'), onSelect: onSuggestion });
cityInput.addEventListener('input', () => {
  if (picked && picked.text !== cityInput.value) picked = null;
});
radiusSelect.addEventListener('change', () => {
  // Re-run for the place already on screen (no new geocoding; Overpass gets coordinates only).
  if (state.place && readMonth()) void runSearch(state.place);
});

form.addEventListener('submit', (e) => void onSubmit(e));
monthSelect.addEventListener('change', () => {
  state.month = readMonth();
  showMonthInfo();
  if (foundTabSelected()) void refreshFoundOnline();
});
countrySelect.addEventListener('change', () => {
  const v = countrySelect.value;
  state.onlineCountry = /^[A-Z]{2}$/.test(v) ? v : null;
  renderOnline();
  if (foundTabSelected()) void refreshFoundOnline();
});
initCelebrations($('celebrate-live'));
window.addEventListener('offline', () => setStatus("You're offline. Results already shown will stay here.", 'error'));

// Online tab works without a city — load offers up front (small static file, same origin).
ensureOffers().catch(() => {
  renderEmpty(onlineList, "We couldn't load the offers list. Please refresh the page.", 'error');
});
