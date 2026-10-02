// Self-hosted variable fonts, latin + latin-ext only (see fonts.css and DECISIONS #21).
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { countryName, countryOptions } from './countries';
import { GeocodeError, geocode } from './geocode';
import { isLiveSearchEnabled, liveSearch } from './liveSearch';
import {
  ALL_QUEST_TYPES,
  allTypesOn,
  applyQuestFilters,
  filterOffers,
  hiddenTypeCount,
  loadOffers,
  monthInfo,
  nearbyOffers,
  onlineCounts,
  QUEST_TYPES,
  type QuestFilters,
  type QuestType,
  type QuestTypeFilter,
  typeFilterMessage,
  type VenueHit,
} from './offers';
import type { Suggestion } from './autocomplete';
import { DEFAULT_RADIUS_M, RADIUS_OPTIONS_M, distanceM, fetchBranches, nearestByOffer } from './overpass';
import { createCombobox } from './render/combobox';
import { initCelebrations, setCandleLit } from './render/confetti';
import { el, svg } from './render/dom';
import { candleMark, icon, type IconName } from './render/icons';
import type { MapView } from './render/map';
import { doneIds, isDone, onDoneChange, renderEmpty, renderLiveList, renderNearbyList, renderQuestList, setDoneIds } from './render/quests';
import { clearSession, loadSession, saveSession, SESSION_TABS, SESSION_VERSION, type SessionTab } from './session';
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
  /** Number of map pins from the last finished branch lookup. */
  pinCount: number;
  /** The last branch lookup failed (Overpass down); quests are still listed. */
  pinsFailed: boolean;
  /** Every branch Overpass returned (all pins, before the "Verified only" filter). */
  pins: Branch[];
  /** Radius of the circle drawn on the map for the current search. */
  circleRadiusM: number;
  /** "Verified only" switch (DECISIONS #25). */
  verifiedOnly: boolean;
  /** Quest types shown by the Filter box (DECISIONS #27). */
  types: QuestTypeFilter;
}

const state: State = {
  offers: [],
  place: null,
  placeText: '',
  month: null,
  onlineCountry: null,
  branches: new Map(),
  searchedRadiusM: null,
  pinCount: 0,
  pinsFailed: false,
  pins: [],
  circleRadiusM: DEFAULT_RADIUS_M,
  verifiedOnly: false,
  types: { ...ALL_QUEST_TYPES },
};
/** Listed Nearby quests with a branch or venue inside the search circle (for the header summary). */
let nearbyWithin = 0;
/** True while the saved session is being applied, so intermediate states aren't written back. */
let restoring = false;
/** Place picked from the autocomplete list, valid while the input still shows its label. */
let picked: { text: string; place: Place } | null = null;
const liveCache = new Map<string, LiveResult[]>();
let searchSeq = 0;
let mapView: MapView | null = null;
let offersReady: Promise<void> | null = null;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function $(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node;
}

const form = $('search-form') as HTMLFormElement;
const cityInput = $('city') as HTMLInputElement;
const monthSelect = $('month') as HTMLSelectElement;
const countrySelect = $('country') as HTMLSelectElement;
const radiusGroup = $('radius');
const radioInputs = Array.from(radiusGroup.querySelectorAll<HTMLInputElement>('input[type="radio"][name="radius"]'));
const statusEl = $('status');
const monthInfoEl = $('month-info');
const nearbyList = $('nearby-list');
const onlineList = $('online-list');
const foundList = $('found-list');
const mapEl = $('map');
const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
const clearBtn = $('clear-search') as HTMLButtonElement;
const onlineCountEl = $('online-count');
const nearbyCountEl = $('nearby-count');
const foundCountEl = $('found-count');
const resultsTitle = $('results-heading');
const resultsSub = $('results-sub');
const progressEl = $('progress');
const progressCount = $('progress-count');
const tablist = document.querySelector<HTMLElement>('[role="tablist"]');
const verifiedSwitch = $('verified-only') as HTMLButtonElement;
const foundVerifiedNote = $('found-verified-note');
const filterWrap = $('type-filter');
const filterToggle = $('filter-toggle') as HTMLButtonElement;
const filterBox = $('filter-box');
const filterCount = $('filter-count');
const filterReset = $('filter-reset') as HTMLButtonElement;
const typeInputs = Array.from(filterBox.querySelectorAll<HTMLInputElement>('input[name="quest-type"]'));

// ---------- static decoration (icons are built with createElementNS, never innerHTML) ----------
function decorate(): void {
  $('site-mark').appendChild(candleMark());
  $('submit-orb').appendChild(icon('search'));
  $('privacy-note').prepend(icon('lock'));
  $('found-disclaimer').prepend(icon('globe'));
  $('filter-icon').appendChild(icon('filter'));
  for (const ctl of document.querySelectorAll<HTMLElement>('.field__control[data-icon]')) {
    ctl.prepend(icon(ctl.dataset.icon as IconName));
    if (ctl.dataset.chevron) ctl.appendChild(icon('chevron', 'icon--chev'));
  }
  // Progress ring: r=24 → circumference 150.8 (stroke-dasharray in CSS).
  $('progress-ring').appendChild(
    svg('svg', { viewBox: '0 0 56 56', class: 'ring', 'aria-hidden': 'true', focusable: 'false' }, [
      svg('circle', { class: 'ring__track', cx: '28', cy: '28', r: '24' }),
      svg('circle', { class: 'ring__fill', cx: '28', cy: '28', r: '24' }),
    ]),
  );
}
decorate();

const NEARBY_START = 'Type your city and pick your birthday month to see birthday offers near you.';

type StatusKind = 'info' | 'loading' | 'error' | 'success';
const STATUS_ICON: Partial<Record<StatusKind, IconName>> = { error: 'alert', info: 'sparkle' };
/** One polite live region. Success lines are visually hidden (the results header shows the summary). */
function setStatus(message: string, kind: StatusKind = 'info'): void {
  const ic = message ? STATUS_ICON[kind] : undefined;
  statusEl.replaceChildren(...(ic ? [icon(ic)] : []), message);
  statusEl.dataset.kind = kind;
  document.body.classList.toggle('is-loading', kind === 'loading');
}

// ---------- tabs (WAI-ARIA tabs pattern) with a sliding thumb ----------
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
function visibleTabs(): HTMLButtonElement[] {
  return tabs.filter((t) => !t.hidden);
}
function currentTab(): SessionTab {
  const t = tabs.find((x) => x.getAttribute('aria-selected') === 'true');
  const id = t?.id.replace(/^tab-/, '') ?? 'nearby';
  return (SESSION_TABS as readonly string[]).includes(id) ? (id as SessionTab) : 'nearby';
}
function moveThumb(): void {
  const vis = visibleTabs();
  const i = Math.max(0, vis.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
  tablist?.style.setProperty('--tab-count', String(vis.length));
  tablist?.style.setProperty('--tab-index', String(i));
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
  moveThumb();
  if (focus) tab.focus();
  if (tab.id === 'tab-found') void refreshFoundOnline();
  mapView?.invalidateSize();
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
const onlineTab = $('tab-online') as HTMLButtonElement;
foundTab.hidden = !isLiveSearchEnabled();
moveThumb();

/** Count chip inside a tab: visible number, screen readers hear "Online 14 quests". */
function setCount(node: HTMLElement, n: number | null, noun: [string, string] = ['quest', 'quests']): void {
  if (n === null) {
    node.hidden = true;
    node.replaceChildren();
    return;
  }
  node.replaceChildren(String(n), el('span', { class: 'visually-hidden' }, [` ${n === 1 ? noun[0] : noun[1]}`]));
  node.hidden = false;
}

// ---------- results header: title, summary and progress ring ----------
function shortPlace(): string {
  const text = state.placeText || state.place?.label || '';
  return text.split(',')[0]?.trim() || text;
}

/** Unique offers currently listed in Nearby + Online (Found online results can't be claimed). */
function listedOfferIds(): Set<string> {
  const ids = new Set<string>();
  for (const card of document.querySelectorAll<HTMLElement>('#nearby-list .quest-card, #online-list .quest-card')) {
    if (card.dataset.offerId) ids.add(card.dataset.offerId);
  }
  return ids;
}

function progress(): { claimed: number; total: number } {
  const ids = listedOfferIds();
  let claimed = 0;
  for (const id of ids) if (isDone(id)) claimed += 1;
  return { claimed, total: ids.size };
}

function updateHeader(): void {
  resultsTitle.textContent = state.month ? `Your ${MONTHS[state.month - 1] ?? ''} quests` : 'Your birthday quests';
  const { claimed, total } = progress();
  const totalText = `${total} quest${total === 1 ? '' : 's'} in total.`;
  let sub: string;
  if (!state.place) {
    sub = total > 0 ? `${totalText} Search your city to see shops near you.` : 'Search your city to see birthday offers near you, or open the Online tab.';
  } else if (state.pinsFailed) {
    sub = `${totalText} Shop pins for ${shortPlace()} didn’t load, so distances are missing.`;
  } else if (state.searchedRadiusM !== null) {
    sub = `${totalText} ${nearbyWithin} within ${km(state.searchedRadiusM)} of ${shortPlace()}.`;
  } else {
    sub = total > 0 ? `${totalText} Looking for shops near ${shortPlace()}.` : `No quests near ${shortPlace()} yet.`;
  }
  resultsSub.textContent = sub;

  progressEl.hidden = total === 0;
  progressCount.textContent = `${claimed} of ${total}`;
  const ratio = total > 0 ? claimed / total : 0;
  progressEl.style.setProperty('--progress', ratio.toFixed(4));
  setCandleLit(doneIds().length > 0);
  mapView?.setClaimed(new Set(doneIds()));
}

/** Card entry: fade up 14px, staggered 70ms (max 8 cards), only when a list first appears. */
function animateEntry(container: HTMLElement): void {
  const cards = Array.from(container.querySelectorAll<HTMLElement>('.quest-card, .live-card')).slice(0, 8);
  cards.forEach((c, i) => c.style.setProperty('--enter-delay', `${120 + i * 70}ms`));
  container.classList.remove('is-entering');
  void container.offsetWidth;
  container.classList.add('is-entering');
  window.setTimeout(() => container.classList.remove('is-entering'), 1400);
}

function hasCards(container: HTMLElement): boolean {
  return container.querySelector('.quest-card, .live-card') !== null;
}

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

/** Online tab offers for the current country, before the "Verified only" filter. */
function onlineAll(): Offer[] {
  return filterOffers({ offers: state.offers, country: state.onlineCountry, channel: 'online' });
}

/** Nearby tab offers for the searched place (venue offers only when a venue is close), before the filter. */
function nearbyAll(): { offers: Offer[]; venues: Map<string, VenueHit> } {
  const place = state.place;
  if (!place) return { offers: [], venues: new Map() };
  return nearbyOffers({ offers: state.offers, country: place.countryCode, lat: place.lat, lng: place.lng });
}

/** A venue as a branch for cards and pins. Approximate venues get directions by name and no pin. */
function venueBranch(offerId: string, hit: VenueHit): Branch {
  const b: Branch = { offerId, name: hit.venue.name, lat: hit.venue.lat, lng: hit.venue.lng };
  if (!hit.venue.exact) b.approximate = true;
  return b;
}

/** Current list filters: "Verified only" plus the quest-type Filter box. */
function filters(): QuestFilters {
  return { verifiedOnly: state.verifiedOnly, types: state.types };
}

/**
 * Empty state when the filters hide every quest in a list. "Show all quests" resets every filter.
 * With only "Verified only" on, the copy is the one from DECISIONS #25.
 */
function renderFilteredEmpty(container: HTMLElement): void {
  const onlyVerified = allTypesOn(state.types);
  const showAll = ghostButton('Show all quests', () => {
    resetFilters();
    (onlyVerified ? verifiedSwitch : filterToggle).focus();
  });
  if (onlyVerified) {
    renderEmpty(container, 'Every quest here is marked Check with store. Show all quests to see them, then confirm the offer with the shop.', 'empty', {
      title: 'No verified quests here yet',
      actions: [showAll],
    });
    return;
  }
  renderEmpty(container, 'None of the quests here match your filters. Turn a quest type back on in Filter, or show all quests.', 'empty', {
    title: 'No quests match your filters',
    actions: [showAll],
  });
}

function renderOnline(): void {
  const all = onlineAll();
  const list = applyQuestFilters(all, filters());
  setCount(onlineCountEl, state.offers.length ? list.length : null);
  if (all.length > 0 && list.length === 0) {
    renderFilteredEmpty(onlineList);
  } else if (list.length === 0) {
    renderEmpty(
      onlineList,
      state.onlineCountry
        ? 'No online birthday quests for this country yet. Try another country, or check back soon.'
        : 'No worldwide online quests yet, so pick your country above to see offers you can claim online.',
      'empty',
      { title: state.onlineCountry ? `Nothing online for ${countryName(state.onlineCountry)} yet` : 'Pick your country' },
    );
  } else {
    const fresh = !hasCards(onlineList);
    renderQuestList(onlineList, list, { idPrefix: 'online' });
    if (fresh) animateEntry(onlineList);
  }
  updateHeader();
}

/** Points the Online tab (and Found online) at a country and refreshes both straight away. */
function syncOnlineCountry(code: string | null): void {
  state.onlineCountry = code && /^[A-Z]{2}$/.test(code) ? code : null;
  if (state.offers.length) populateCountries(state.onlineCountry);
  countrySelect.value = state.onlineCountry ?? '';
  renderOnline();
  if (foundTabSelected()) void refreshFoundOnline();
}

function ghostButton(label: string, onClick: () => void, primary?: IconName): HTMLButtonElement {
  const b = el(
    'button',
    { type: 'button', class: primary ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm' },
    primary ? [el('span', {}, [label]), el('span', { class: 'btn__orb', 'aria-hidden': 'true' }, [icon(primary)])] : [label],
  );
  b.addEventListener('click', onClick);
  return b;
}

function nextRadius(current: number): number | null {
  const opts = RADIUS_OPTIONS_M as readonly number[];
  const i = opts.indexOf(current);
  return i >= 0 && i < opts.length - 1 ? (opts[i + 1] ?? null) : null;
}

/** "No shops within 2 km yet" notice with a "Widen to 5 km" action (quests are still listed below). */
function widenNotice(): HTMLElement | null {
  if (state.searchedRadiusM === null || state.branches.size > 0) return null;
  const wider = nextRadius(state.searchedRadiusM);
  return el('div', { class: 'notice notice--widen' }, [
    icon('radius'),
    el('div', {}, [
      el('p', { class: 'notice__title' }, [`No shops within ${km(state.searchedRadiusM)} yet`]),
      el('p', {}, ['We couldn’t spot these brands on the map that close. The quests below still work at any branch.']),
    ]),
    wider
      ? ghostButton(`Widen to ${km(wider)}`, () => {
          setRadius(wider);
          persist();
          if (state.place && readMonth()) void runSearch(state.place);
        })
      : null,
  ]);
}

function renderNearby(): void {
  if (!state.place) return;
  const { offers: all, venues } = nearbyAll();
  const list = applyQuestFilters(all, filters());
  setCount(nearbyCountEl, list.length);
  nearbyWithin = 0;
  if (all.length > 0 && list.length === 0) {
    renderFilteredEmpty(nearbyList);
    updateHeader();
    return;
  }
  if (list.length === 0) {
    renderEmpty(
      nearbyList,
      `Brands in ${countryName(state.place.countryCode)} haven’t shared an in-store birthday offer we can verify yet. The Online tab has offers you can claim from anywhere.`,
      'empty',
      { title: `No in-store quests near ${shortPlace()} yet`, actions: [ghostButton('See online quests', () => selectTab(onlineTab, true))] },
    );
    updateHeader();
    return;
  }
  const { place } = state;
  // Render-time merge: Overpass branches plus the nearest venue of each venue offer (state.branches
  // itself only ever holds Overpass results).
  const branches = new Map(state.branches);
  const distances = new Map<string, number>();
  for (const [id, b] of state.branches) distances.set(id, distanceM(place.lat, place.lng, b.lat, b.lng));
  for (const [id, hit] of venues) {
    branches.set(id, venueBranch(id, hit));
    distances.set(id, hit.distanceM);
  }
  if (state.searchedRadiusM !== null) {
    const r = state.searchedRadiusM;
    nearbyWithin = list.filter((o) => (distances.get(o.id) ?? Infinity) <= r).length;
  }
  const fresh = !hasCards(nearbyList);
  renderNearbyList(nearbyList, list, {
    branches,
    distances,
    restHeading: state.searchedRadiusM !== null ? `Also in ${countryName(place.countryCode)}: find your nearest branch` : undefined,
    notice: widenNotice(),
    idPrefix: 'nearby',
  });
  if (fresh) animateEntry(nearbyList);
  updateHeader();
}

function renderNearbyStart(): void {
  setCount(nearbyCountEl, null);
  renderEmpty(nearbyList, NEARBY_START, 'empty', { title: 'Your quests show up here' });
}

function km(radiusM: number): string {
  return `${Math.round(radiusM / 1000)} km`;
}

/**
 * Map pins: every Overpass branch, plus the nearest venue of each venue offer when it is exact and
 * inside the search circle. Venues further out keep their card distance and directions but get no
 * pin, so the map never zooms out to a park 100 km away (DECISIONS #24). "Verified only" and the
 * quest-type Filter hide the pins of offers they hide from the lists.
 */
function currentPins(): Branch[] {
  if (!state.place) return [];
  const pins = [...state.pins];
  for (const [id, hit] of nearbyAll().venues) {
    if (hit.venue.exact && hit.distanceM <= state.circleRadiusM) pins.push(venueBranch(id, hit));
  }
  if (!state.verifiedOnly && allTypesOn(state.types)) return pins;
  const shown = new Set(applyQuestFilters(state.offers, filters()).map((o) => o.id));
  return pins.filter((p) => shown.has(p.offerId));
}

function renderPins(fit: boolean): number {
  const pins = currentPins();
  if (!mapView || !state.place) return pins.length;
  mapView.showBranches(pins, new Map(state.offers.map((o) => [o.id, o])), { fit });
  mapView.setClaimed(new Set(doneIds()));
  return pins.length;
}

function applyVerifiedUi(): void {
  verifiedSwitch.setAttribute('aria-checked', String(state.verifiedOnly));
  foundVerifiedNote.hidden = !state.verifiedOnly;
}

/** Unique offers across Nearby and Online: before any filter, and after every filter. */
function filterCounts(): { shown: number; total: number } {
  const all = new Map<string, Offer>();
  for (const o of [...nearbyAll().offers, ...onlineAll()]) all.set(o.id, o);
  return { shown: applyQuestFilters([...all.values()], filters()).length, total: all.size };
}

/** Re-renders both lists and the pins after a filter change, and saves it. */
function rerenderFiltered(): void {
  renderOnline();
  if (state.place) renderNearby();
  renderPins(false);
  persist();
}

/** Turns "Verified only" on or off: re-renders both lists and the pins, saves and announces it. */
function setVerifiedOnly(on: boolean): void {
  state.verifiedOnly = on;
  applyVerifiedUi();
  rerenderFiltered();
  const { shown, total } = filterCounts();
  setStatus(on ? `Showing verified quests only, ${shown} of ${total}` : `Showing all quests, ${total} in total`, 'success');
}
verifiedSwitch.addEventListener('click', () => setVerifiedOnly(!state.verifiedOnly));

// ---------- quest-type Filter box (DECISIONS #27): disclosure with three checkboxes ----------
function applyTypesUi(): void {
  for (const input of typeInputs) input.checked = state.types[input.value as QuestType] !== false;
  const hidden = hiddenTypeCount(state.types);
  if (hidden > 0) {
    // Visible "2"; screen readers hear "Filter, 2 types hidden".
    filterCount.replaceChildren(
      el('span', { class: 'visually-hidden' }, [', ']),
      String(hidden),
      el('span', { class: 'visually-hidden' }, [` ${hidden === 1 ? 'type' : 'types'} hidden`]),
    );
    filterCount.hidden = false;
  } else {
    filterCount.replaceChildren();
    filterCount.hidden = true;
  }
  filterToggle.classList.toggle('is-filtered', hidden > 0);
}

function setTypes(types: QuestTypeFilter): void {
  state.types = { ...types };
  applyTypesUi();
  rerenderFiltered();
  const { shown, total } = filterCounts();
  setStatus(typeFilterMessage(state.types, shown, total), 'success');
}

/** "Show all quests": every quest type back on and "Verified only" off. */
function resetFilters(): void {
  state.types = { ...ALL_QUEST_TYPES };
  applyTypesUi();
  setVerifiedOnly(false);
}

function isFilterOpen(): boolean {
  return filterToggle.getAttribute('aria-expanded') === 'true';
}
function setFilterOpen(open: boolean, returnFocus = false): void {
  filterToggle.setAttribute('aria-expanded', String(open));
  filterBox.hidden = !open;
  if (!open && returnFocus) filterToggle.focus();
}
filterToggle.addEventListener('click', () => setFilterOpen(!isFilterOpen()));
filterWrap.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isFilterOpen()) {
    e.preventDefault();
    setFilterOpen(false, true);
  }
});
// Close when focus or a click moves outside the Filter control.
filterWrap.addEventListener('focusout', (e) => {
  const next = e.relatedTarget;
  if (isFilterOpen() && next instanceof Node && !filterWrap.contains(next)) setFilterOpen(false);
});
document.addEventListener('pointerdown', (e) => {
  if (isFilterOpen() && e.target instanceof Node && !filterWrap.contains(e.target)) setFilterOpen(false);
});
for (const input of typeInputs) {
  input.addEventListener('change', () => {
    const next: QuestTypeFilter = { ...state.types };
    for (const t of QUEST_TYPES) {
      const box = typeInputs.find((i) => i.value === t);
      if (box) next[t] = box.checked;
    }
    setTypes(next);
  });
}
filterReset.addEventListener('click', () => {
  setTypes({ ...ALL_QUEST_TYPES });
  typeInputs[0]?.focus();
});

// ---------- found online ----------
async function refreshFoundOnline(): Promise<void> {
  if (!isLiveSearchEnabled()) return;
  const month = state.month;
  const country = state.onlineCountry;
  if (!month || !country) {
    setCount(foundCountEl, null);
    renderEmpty(foundList, "Pick your birthday month and a country to see what's out there.", 'empty', { title: 'Search the web for more' });
    return;
  }
  const key = `${month}-${country}`;
  const cached = liveCache.get(key);
  if (cached) {
    showLive(cached);
    return;
  }
  renderEmpty(foundList, 'Searching the web for birthday offers…', 'loading');
  foundList.setAttribute('aria-busy', 'true');
  try {
    const results = await liveSearch(month, country);
    liveCache.set(key, results);
    if (state.month === month && state.onlineCountry === country) showLive(results);
  } catch {
    setCount(foundCountEl, null);
    renderEmpty(foundList, "Live search isn't available right now. The Nearby and Online tabs still work.", 'error', { title: 'Web search is down' });
  } finally {
    foundList.removeAttribute('aria-busy');
  }
}
function showLive(results: LiveResult[]): void {
  setCount(foundCountEl, results.length, ['result', 'results']);
  if (results.length === 0) renderEmpty(foundList, 'Nothing new found online for this month. Check back later.', 'empty', { title: 'Nothing new yet' });
  else {
    renderLiveList(foundList, results);
    animateEntry(foundList);
  }
}
function foundTabSelected(): boolean {
  return foundTab.getAttribute('aria-selected') === 'true' && !foundTab.hidden;
}

// ---------- map ----------
const desktop = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1100px)') : null;
function highlightCard(offerId: string): void {
  let target: HTMLElement | null = null;
  for (const card of nearbyList.querySelectorAll<HTMLElement>('.quest-card')) {
    const on = card.dataset.offerId === offerId;
    card.classList.toggle('is-active', on);
    if (on) target = card;
  }
  if (target && desktop?.matches) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function getMap(): Promise<MapView> {
  if (!mapView) {
    const { createMap } = await import('./render/map');
    mapEl.replaceChildren();
    mapView = createMap(mapEl, { onSelect: highlightCard });
    mapView.setClaimed(new Set(doneIds()));
  }
  return mapView;
}

// ---------- search ----------
function readMonth(): number | null {
  const m = Number(monthSelect.value);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}

function showMonthInfo(): void {
  updateHeader();
  if (!state.month) {
    monthInfoEl.hidden = true;
    return;
  }
  const info = monthInfo(state.month);
  monthInfoEl.replaceChildren(icon(info.isBirthdayMonth ? 'sparkle' : 'calendar'), info.label);
  monthInfoEl.dataset.birthdayMonth = String(info.isBirthdayMonth);
  monthInfoEl.hidden = false;
}

function geocodeMessage(err: unknown): string {
  if (err instanceof GeocodeError) {
    switch (err.kind) {
      case 'NotFound':
        return "We couldn't find that place. Try just the city name, like “Pune” or “Manchester”, or add the country.";
      case 'RateLimited':
        return 'The map search is a bit busy. Wait a few seconds and try again.';
      case 'Offline':
        return "You're offline. Reconnect to the internet and try again.";
      case 'Invalid':
        return 'Type your city to find quests near you, or open the Online tab.';
      case 'Upstream':
        return 'The map search is having trouble right now. Try again in a moment.';
    }
  }
  return 'Something went wrong. Try again.';
}

function readRadius(): number {
  const r = Number(radioInputs.find((i) => i.checked)?.value);
  return (RADIUS_OPTIONS_M as readonly number[]).includes(r) ? r : DEFAULT_RADIUS_M;
}
function setRadius(r: number): void {
  const want = (RADIUS_OPTIONS_M as readonly number[]).includes(r) ? r : DEFAULT_RADIUS_M;
  for (const i of radioInputs) i.checked = Number(i.value) === want;
}

function setCityError(on: boolean): void {
  if (on) {
    cityInput.setAttribute('aria-invalid', 'true');
    cityInput.setAttribute('aria-describedby', 'status');
  } else {
    cityInput.removeAttribute('aria-invalid');
    cityInput.removeAttribute('aria-describedby');
  }
}

async function onSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  combobox.cancel();
  const month = readMonth();
  if (!month) {
    ++searchSeq;
    setStatus('Pick your birthday month first.', 'error');
    monthSelect.focus();
    return;
  }
  const city = cityInput.value;
  if (city.trim() === '') {
    ++searchSeq;
    state.month = month;
    showMonthInfo();
    persist();
    setCityError(true);
    setStatus('Type your city to find quests near you, or open the Online tab.', 'error');
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
  setCityError(false);
  setStatus('Looking up your city…', 'loading');
  const skeleton = !hasCards(nearbyList);
  if (skeleton) renderEmpty(nearbyList, 'Loading quests…', 'loading');
  submitBtn?.setAttribute('aria-disabled', 'true');
  try {
    const [place] = await Promise.all([typeof where === 'string' ? geocode(where) : Promise.resolve(where), ensureOffers()]);
    if (seq !== searchSeq) return;
    state.place = place;
    state.placeText = text || place.label;
    state.branches = new Map();
    state.searchedRadiusM = null;
    state.pinsFailed = false;
    state.pins = [];
    state.circleRadiusM = radiusM;
    // Auto-sync: the Online tab (and Found online) follow the searched city's country.
    syncOnlineCountry(place.countryCode);
    renderNearby();
    persist();

    const nearby = nearbyAll().offers;
    const map = await getMap();
    if (seq !== searchSeq) return;
    map.clearBranches();
    map.showPlace(place, radiusM);
    renderPins(true);

    if (nearby.length === 0) {
      setStatus(`No in-store quests near ${place.label} yet. The Online tab has offers you can claim anywhere.`, 'info');
      return;
    }
    const shown = applyQuestFilters(nearby, filters()).length;
    const quests = `${shown} ${state.verifiedOnly ? 'verified ' : ''}quest${shown === 1 ? '' : 's'}`;
    setStatus(`Found ${quests}. Looking for shops within ${km(radiusM)}…`, 'loading');
    try {
      // Venue offers (theme parks) have fixed coordinates, so only chains go to Overpass.
      const branches = await fetchBranches(
        nearby.filter((o) => !o.venues),
        place.lat,
        place.lng,
        fetch,
        radiusM,
      );
      if (seq !== searchSeq) return;
      state.branches = nearestByOffer(branches, place.lat, place.lng);
      state.searchedRadiusM = radiusM;
      state.pins = branches;
      const pinCount = renderPins(true);
      state.pinCount = pinCount;
      renderNearby();
      setStatus(
        pinCount > 0
          ? `Found ${quests} and ${pinCount} place${pinCount === 1 ? '' : 's'} on the map within ${km(radiusM)} of ${place.label}.`
          : `Found ${quests} for your city. We couldn't spot their shops within ${km(radiusM)} on the map. Try a bigger search radius.`,
        'success',
      );
    } catch {
      if (seq !== searchSeq) return;
      state.pinsFailed = true;
      updateHeader();
      setStatus(`Found ${quests}. We couldn't load shop pins right now, but your quests are still listed below.`, 'info');
    }
  } catch (err) {
    if (seq !== searchSeq) return;
    if (skeleton) {
      if (state.place) renderNearby();
      else renderNearbyStart();
    }
    if (err instanceof GeocodeError && (err.kind === 'NotFound' || err.kind === 'Invalid')) setCityError(true);
    setStatus(err instanceof GeocodeError ? geocodeMessage(err) : 'We couldn’t load the offers list. Refresh the page and try again.', 'error');
  } finally {
    if (seq === searchSeq) submitBtn?.removeAttribute('aria-disabled');
  }
}

function onSuggestion(s: Suggestion): void {
  const place: Place = { lat: s.lat, lng: s.lng, countryCode: s.countryCode, label: s.label };
  picked = { text: cityInput.value, place };
  if (!readMonth()) {
    ++searchSeq;
    setStatus('Got it. Now pick your birthday month.', 'info');
    monthSelect.focus();
    return;
  }
  void runSearch(place);
}

const combobox = createCombobox({ input: cityInput, host: $('city-combo'), live: $('suggest-live'), onSelect: onSuggestion });
cityInput.addEventListener('input', () => {
  if (picked && picked.text !== cityInput.value) picked = null;
  setCityError(false);
});
for (const r of radioInputs) {
  r.addEventListener('change', () => {
    combobox.cancel();
    persist();
    // Re-run for the place already on screen (no new geocoding; Overpass gets coordinates only).
    if (state.place && readMonth()) void runSearch(state.place);
  });
}

form.addEventListener('submit', (e) => void onSubmit(e));
monthSelect.addEventListener('change', () => {
  combobox.cancel();
  state.month = readMonth();
  showMonthInfo();
  persist();
  if (foundTabSelected()) void refreshFoundOnline();
});
countrySelect.addEventListener('change', () => {
  syncOnlineCountry(countrySelect.value);
  persist();
});
initCelebrations($('celebrate-live'), progress);
window.addEventListener('offline', () => setStatus("You're offline. Results already shown will stay here.", 'error'));

// ---------- session (sessionStorage, this tab only) ----------
/** Writes the one allowed record. Location goes only here, never into the URL. */
function persist(): void {
  if (restoring) return;
  const place = state.place;
  saveSession({
    v: SESSION_VERSION,
    city: place ? state.placeText : null,
    lat: place ? place.lat : null,
    lng: place ? place.lng : null,
    countryCode: place ? place.countryCode : state.onlineCountry,
    month: readMonth(),
    radius: readRadius(),
    tab: currentTab(),
    done: doneIds(),
    verifiedOnly: state.verifiedOnly,
    types: { ...state.types },
  });
}
onDoneChange(() => {
  updateHeader();
  persist();
});

/** Re-applies a saved search after a refresh: inputs, tab, done quests, then re-runs the search. */
function restoreSession(): void {
  const saved = loadSession();
  if (!saved) return;
  restoring = true;
  try {
    if (saved.month) monthSelect.value = String(saved.month);
    setRadius(saved.radius);
    state.month = readMonth();
    showMonthInfo();
    setDoneIds(saved.done);
    state.verifiedOnly = saved.verifiedOnly;
    applyVerifiedUi();
    state.types = { ...saved.types };
    applyTypesUi();
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
    setRadius(DEFAULT_RADIUS_M);
    setCityError(false);
    Object.assign(state, {
      place: null,
      placeText: '',
      month: null,
      branches: new Map(),
      searchedRadiusM: null,
      pinCount: 0,
      pinsFailed: false,
      pins: [],
      circleRadiusM: DEFAULT_RADIUS_M,
      verifiedOnly: false,
      types: { ...ALL_QUEST_TYPES },
    });
    applyVerifiedUi();
    applyTypesUi();
    setFilterOpen(false);
    setDoneIds([]);
    liveCache.clear();
    if (tabs[0]) selectTab(tabs[0]);
    showMonthInfo();
    syncOnlineCountry(null);
    renderNearbyStart();
    if (foundTabSelected()) void refreshFoundOnline();
    else setCount(foundCountEl, null);
    mapView?.reset();
    submitBtn?.removeAttribute('aria-disabled');
    updateHeader();
  } finally {
    restoring = false;
  }
  setStatus('Search cleared. Nothing from it is kept in this tab.', 'info');
  cityInput.focus();
}
clearBtn.addEventListener('click', clearSearch);

renderNearbyStart();
renderEmpty(foundList, "Pick your birthday month and a country to see what's out there.", 'empty', { title: 'Search the web for more' });
updateHeader();
// Online tab works without a city: load offers up front (small static file, same origin).
ensureOffers().catch(() => {
  renderEmpty(onlineList, "We couldn't load the offers list. Refresh the page and try again.", 'error', { title: 'Offers didn’t load' });
});
restoreSession();
