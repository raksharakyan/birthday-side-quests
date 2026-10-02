// Only the weights/subsets we use (Fredoka 600 display, Nunito 400/700 body); other scripts fall back to system fonts.
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-ext-400.css';
import '@fontsource/nunito/latin-ext-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { countryName, countryOptions } from './countries';
import { GeocodeError, geocode } from './geocode';
import { isLiveSearchEnabled, liveSearch } from './liveSearch';
import { filterOffers, loadOffers, monthInfo, onlineCounts } from './offers';
import type { Suggestion } from './autocomplete';
import { DEFAULT_RADIUS_M, RADIUS_OPTIONS_M, distanceM, fetchBranches, nearestByOffer } from './overpass';
import { createCombobox } from './render/combobox';
import { initCelebrations } from './render/confetti';
import { el } from './render/dom';
import type { MapView } from './render/map';
import { doneIds, onDoneChange, renderEmpty, renderLiveList, renderNearbyList, renderQuestList, setDoneIds } from './render/quests';
import { clearSession, loadSession, saveSession, SESSION_TABS, type SessionTab } from './session';
import type { Branch, LiveResult, Offer, Place } from './types';

/*
 * App state lives in memory. The only thing persisted is one validated record in sessionStorage
 * (src/session.ts, DECISIONS #18): it survives a refresh and is gone when the tab closes. Never
 * localStorage, cookies or IndexedDB; never the user's location in the URL; never browser geolocation.
 */
interface State {
  offers: Offer[];
  place: Place | null;
  /** City text that produced `place` (what the input showed). Saved for this tab's session. */
  placeText: string;
  month: number | null;
  onlineCountry: string | null;
  branches: Map<string, Branch>;
  /** Radius used for the last finished branch lookup (null while loading / before any lookup). */
  searchedRadiusM: number | null;
}

const state: State = {
  offers: [],
  place: null,
  placeText: '',
  month: null,
  onlineCountry: null,
  branches: new Map(),
  searchedRadiusM: null,
};
/** True while the saved session is being applied, so intermediate states aren't written back. */
let restoring = false;
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
const clearBtn = $('clear-search') as HTMLButtonElement;
const onlineCountEl = $('online-count');

const NEARBY_START = 'Type your city and pick your birthday month to see quests near you.';

type StatusKind = 'info' | 'loading' | 'error' | 'success';
function setStatus(message: string, kind: StatusKind = 'info'): void {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
  document.body.classList.toggle('is-loading', kind === 'loading');
}

// ---------- tabs (WAI-ARIA tabs pattern) ----------
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
function visibleTabs(): HTMLButtonElement[] {
  return tabs.filter((t) => !t.hidden);
}
function currentTab(): SessionTab {
  const t = tabs.find((x) => x.getAttribute('aria-selected') === 'true');
  const id = t?.id.replace(/^tab-/, '') ?? 'nearby';
  return (SESSION_TABS as readonly string[]).includes(id) ? (id as SessionTab) : 'nearby';
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
  persist();
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

/** Every country (ISO 3166-1), countries with their own online quests first, with a count. */
function populateCountries(extra?: string | null): void {
  const { byCountry, worldwide } = onlineCounts(state.offers);
  const { withQuests, others } = countryOptions(byCountry, worldwide, extra);
  const wanted = state.onlineCountry ?? countrySelect.value;
  const groups: HTMLElement[] = [el('option', { value: '' }, ['Pick your country…'])];
  if (withQuests.length) {
    groups.push(
      el('optgroup', { label: 'Countries with online quests' }, withQuests.map((c) => el('option', { value: c.code }, [`${c.name} (${c.count})`]))),
    );
  }
  groups.push(
    el('optgroup', { label: withQuests.length ? 'All other countries' : 'All countries' }, others.map((c) => el('option', { value: c.code }, [c.name]))),
  );
  countrySelect.replaceChildren(...groups);
  countrySelect.value = wanted;
  if (countrySelect.value !== wanted) countrySelect.value = '';
}

function setOnlineCount(n: number | null): void {
  if (n === null) {
    onlineCountEl.hidden = true;
    onlineCountEl.replaceChildren();
    return;
  }
  // Visible number; screen readers hear "Online 14 quests" (the flex item gets its own word boundary).
  onlineCountEl.replaceChildren(
    String(n),
    el('span', { class: 'visually-hidden' }, [n === 1 ? ' quest' : ' quests']),
  );
  onlineCountEl.hidden = false;
}

function renderOnline(): void {
  const list = filterOffers({ offers: state.offers, country: state.onlineCountry, channel: 'online' });
  setOnlineCount(state.offers.length ? list.length : null);
  if (list.length === 0) {
    renderEmpty(
      onlineList,
      state.onlineCountry
        ? 'No online birthday quests for this country yet. Try another country, or check back soon 🎀'
        : 'No worldwide online quests yet, so pick your country above to see deals you can claim online 💻',
      'empty',
    );
  } else {
    renderQuestList(onlineList, list, { idPrefix: 'online' });
  }
}

/** Points the Online tab (and Found online) at a country and refreshes both straight away. */
function syncOnlineCountry(code: string | null): void {
  state.onlineCountry = code && /^[A-Z]{2}$/.test(code) ? code : null;
  if (state.offers.length) populateCountries(state.onlineCountry);
  countrySelect.value = state.onlineCountry ?? '';
  renderOnline();
  if (foundTabSelected()) void refreshFoundOnline();
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
  if (results.length === 0) renderEmpty(foundList, 'Nothing new found online for this month. Check back later.');
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
        return "We couldn't find that place. Try just the city name, like “Pune” or “Manchester”, or add the country.";
      case 'RateLimited':
        return 'The map search is a bit busy. Please wait a few seconds and try again.';
      case 'Offline':
        return "You're offline. Reconnect to the internet and try again.";
      case 'Invalid':
        return 'Type your city to find quests near you (or open the Online tab).';
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
    persist();
    setStatus('Type your city to find quests near you (or open the Online tab).', 'error');
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

  const text = (typeof where === 'string' ? where : cityInput.value).replace(/\s+/g, ' ').trim();
  setStatus('Looking up your city…', 'loading');
  submitBtn?.setAttribute('aria-disabled', 'true');
  try {
    const [place] = await Promise.all([typeof where === 'string' ? geocode(where) : Promise.resolve(where), ensureOffers()]);
    if (seq !== searchSeq) return;
    state.place = place;
    state.placeText = text || place.label;
    state.branches = new Map();
    state.searchedRadiusM = null;
    // Auto-sync: the Online tab (and Found online) follow the searched city's country.
    syncOnlineCountry(place.countryCode);
    renderNearby();
    persist();

    const nearby = filterOffers({ offers: state.offers, country: place.countryCode, channel: 'nearby' });
    const map = await getMap();
    if (seq !== searchSeq) return;
    map.clearBranches();
    map.showPlace(place, radiusM);

    if (nearby.length === 0) {
      setStatus(`No in-store quests near ${place.label} yet. The Online tab has treats you can claim anywhere.`, 'info');
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
          : `Found ${quests} for your city. We couldn't spot their shops within ${km(radiusM)} on the map. Try a bigger search radius.`,
        'success',
      );
    } catch {
      if (seq !== searchSeq) return;
      setStatus(`Found ${quests}. We couldn't load shop pins right now, but your quests are still listed below.`, 'info');
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
  persist();
  // Re-run for the place already on screen (no new geocoding; Overpass gets coordinates only).
  if (state.place && readMonth()) void runSearch(state.place);
});

form.addEventListener('submit', (e) => void onSubmit(e));
monthSelect.addEventListener('change', () => {
  state.month = readMonth();
  showMonthInfo();
  persist();
  if (foundTabSelected()) void refreshFoundOnline();
});
countrySelect.addEventListener('change', () => {
  syncOnlineCountry(countrySelect.value);
  persist();
});
initCelebrations($('celebrate-live'));
window.addEventListener('offline', () => setStatus("You're offline. Results already shown will stay here.", 'error'));

// ---------- session (sessionStorage, this tab only) ----------
/** Writes the one allowed record. Location goes only here, never into the URL. */
function persist(): void {
  if (restoring) return;
  const place = state.place;
  saveSession({
    v: 1,
    city: place ? state.placeText : null,
    lat: place ? place.lat : null,
    lng: place ? place.lng : null,
    countryCode: place ? place.countryCode : state.onlineCountry,
    month: readMonth(),
    radius: readRadius(),
    tab: currentTab(),
    done: doneIds(),
  });
}
onDoneChange(persist);

/** Re-applies a saved search after a refresh: inputs, tab, done quests, then re-runs the search. */
function restoreSession(): void {
  const saved = loadSession();
  if (!saved) return;
  restoring = true;
  try {
    if (saved.month) monthSelect.value = String(saved.month);
    radiusSelect.value = String(saved.radius);
    state.month = readMonth();
    showMonthInfo();
    setDoneIds(saved.done);
    const tab = tabs.find((t) => t.id === `tab-${saved.tab}` && !t.hidden) ?? tabs[0];
    if (tab) selectTab(tab);
    if (saved.city !== null && saved.lat !== null && saved.lng !== null && saved.countryCode) {
      const place: Place = { lat: saved.lat, lng: saved.lng, countryCode: saved.countryCode, label: saved.city };
      cityInput.value = saved.city;
      // Coordinates are stored, so the re-run skips Nominatim (like a picked suggestion).
      picked = { text: saved.city, place };
      if (state.month) void runSearch(place);
      else syncOnlineCountry(saved.countryCode);
    } else if (saved.countryCode) {
      syncOnlineCountry(saved.countryCode);
    }
  } finally {
    restoring = false;
  }
}

/** "Clear search": wipes the saved record and puts the page back to its starting state. */
function clearSearch(): void {
  ++searchSeq;
  combobox.cancel();
  clearSession();
  restoring = true;
  try {
    picked = null;
    form.reset();
    Object.assign(state, { place: null, placeText: '', month: null, branches: new Map(), searchedRadiusM: null });
    setDoneIds([]);
    liveCache.clear();
    showMonthInfo();
    syncOnlineCountry(null);
    renderEmpty(nearbyList, NEARBY_START);
    mapView?.reset();
    submitBtn?.removeAttribute('aria-disabled');
  } finally {
    restoring = false;
  }
  setStatus('Search cleared. Nothing from it is kept in this tab.', 'info');
  cityInput.focus();
}
clearBtn.addEventListener('click', clearSearch);

// Online tab works without a city: load offers up front (small static file, same origin).
ensureOffers().catch(() => {
  renderEmpty(onlineList, "We couldn't load the offers list. Please refresh the page.", 'error');
});
restoreSession();
