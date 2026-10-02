import type { Category, Channel, ClaimWindow, Offer, OffersFile, OsmHint, RewardType, Venue } from './types';
import { distanceM } from './overpass';
import { hasUnsafeText } from './text';
import { directionsUrlByName, safeHttpsUrl } from './urls';

export const CATEGORIES: readonly Category[] = ['cafe', 'dessert', 'restaurant', 'beauty', 'fashion', 'retail', 'online'];
export const CHANNELS: readonly Channel[] = ['in-store', 'online', 'both'];
export const CLAIM_WINDOWS: readonly ClaimWindow[] = ['day', 'week', 'month', 'varies'];
export const REWARD_TYPES: readonly RewardType[] = ['free', 'discount'];

export const LIMITS = {
  id: 64,
  brand: 80,
  offer: 300,
  howToClaim: 400,
  nameRegex: 100,
  countries: 250,
  offers: 500,
  rewardItem: 140,
  steps: 6,
  step: 100,
  minSpend: 60,
  signupLeadDays: 90,
  validFor: 80,
  bring: 5,
  bringItem: 40,
  venues: 20,
  venueName: 80,
} as const;

/** A venue offer shows in Nearby only when its nearest venue is within this distance (DECISIONS #24). */
export const VENUE_MAX_M = 150_000;

export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WIKIDATA_RE = /^Q[1-9]\d{0,11}$/;
// Conservative charset for regexes that end up inside an Overpass QL string.
const NAME_REGEX_RE = /^[\p{L}\p{N} '’&.\-|()?^$]+$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0 || s.length > max || CONTROL_RE.test(s) || hasUnsafeText(s)) return null;
  return s;
}

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Worst-case backtracking paths a nameRegex may have (see nameRegexBranching). */
export const NAME_REGEX_MAX_BRANCHING = 1024;

/**
 * Upper bound on the number of ways a nameRegex can try to match at one position: 2 per `?` times
 * the number of alternatives of every group (and of the top level). The charset already excludes
 * `*`, `+` and `{}`, but stacked `?` (e.g. `a?a?a?…aaa`) or many alternation groups still backtrack
 * exponentially in JS's RegExp engine, so this keeps every pattern linear in practice.
 */
export function nameRegexBranching(re: string): number {
  let total = 1;
  const stack: number[] = [1];
  for (const ch of re) {
    if (ch === '?') total *= 2;
    else if (ch === '|') stack[stack.length - 1] = (stack[stack.length - 1] ?? 1) + 1;
    else if (ch === '(') stack.push(1);
    else if (ch === ')' && stack.length > 1) total *= stack.pop() ?? 1;
    if (total > NAME_REGEX_MAX_BRANCHING) return Infinity;
  }
  for (const n of stack) total *= n;
  return total;
}

function validateOsm(v: unknown): OsmHint | undefined | null {
  if (v === undefined) return undefined;
  if (!isObj(v)) return null;
  const out: OsmHint = {};
  if (v.wikidata !== undefined) {
    if (typeof v.wikidata !== 'string' || !WIKIDATA_RE.test(v.wikidata)) return null;
    out.wikidata = v.wikidata;
  }
  if (v.nameRegex !== undefined) {
    if (typeof v.nameRegex !== 'string' || v.nameRegex.length === 0 || v.nameRegex.length > LIMITS.nameRegex) return null;
    if (!NAME_REGEX_RE.test(v.nameRegex)) return null;
    if (nameRegexBranching(v.nameRegex) > NAME_REGEX_MAX_BRANCHING) return null;
    try {
      new RegExp(v.nameRegex, 'i');
    } catch {
      return null;
    }
    out.nameRegex = v.nameRegex;
  }
  return out.wikidata || out.nameRegex ? out : undefined;
}

function isCoord(v: unknown, limit: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
}

/** Optional venues: 1..20 entries of {name, lat, lng, exact?}. undefined = absent, null = invalid. */
function validateVenues(v: unknown): Venue[] | undefined | null {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length === 0 || v.length > LIMITS.venues) return null;
  const out: Venue[] = [];
  for (const item of v) {
    if (!isObj(item)) return null;
    const name = cleanText(item.name, LIMITS.venueName);
    if (!name) return null;
    // The name may become a directions-by-name link (exact: false), so it must pass that builder too
    // (no '<' '>', no lone surrogates); otherwise rendering the card would throw (security review PR #4).
    try {
      directionsUrlByName(name);
    } catch {
      return null;
    }
    if (!isCoord(item.lat, 90) || !isCoord(item.lng, 180)) return null;
    if (item.exact !== undefined && typeof item.exact !== 'boolean') return null;
    out.push({ name, lat: item.lat, lng: item.lng, exact: item.exact !== false });
  }
  return out;
}

/** Optional string list: 1..maxItems entries, each a clean non-empty string ≤ maxLen. null = invalid. */
function cleanList(v: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > maxItems) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = cleanText(item, maxLen);
    if (!s) return null;
    out.push(s);
  }
  return out;
}

type ClaimDetails = Pick<Offer, 'rewardItem' | 'steps' | 'purchaseRequired' | 'minSpend' | 'signupLeadDays' | 'validFor' | 'bring'>;

/** Validates the optional claim-detail fields. Absent fields stay absent; a present but bad field fails. */
function validateClaimDetails(raw: Record<string, unknown>): ClaimDetails | string {
  const out: ClaimDetails = {};
  if (raw.rewardItem !== undefined) {
    const v = cleanText(raw.rewardItem, LIMITS.rewardItem);
    if (!v) return 'bad rewardItem';
    out.rewardItem = v;
  }
  if (raw.steps !== undefined) {
    const v = cleanList(raw.steps, LIMITS.steps, LIMITS.step);
    if (!v) return 'bad steps';
    out.steps = v;
  }
  if (raw.purchaseRequired !== undefined) {
    if (raw.purchaseRequired !== null && typeof raw.purchaseRequired !== 'boolean') return 'bad purchaseRequired';
    out.purchaseRequired = raw.purchaseRequired;
  }
  if (raw.minSpend !== undefined) {
    const v = cleanText(raw.minSpend, LIMITS.minSpend);
    if (!v) return 'bad minSpend';
    out.minSpend = v;
  }
  if (raw.signupLeadDays !== undefined) {
    const n = raw.signupLeadDays;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > LIMITS.signupLeadDays) return 'bad signupLeadDays';
    out.signupLeadDays = n;
  }
  if (raw.validFor !== undefined) {
    const v = cleanText(raw.validFor, LIMITS.validFor);
    if (!v) return 'bad validFor';
    out.validFor = v;
  }
  if (raw.bring !== undefined) {
    const v = cleanList(raw.bring, LIMITS.bring, LIMITS.bringItem);
    if (!v) return 'bad bring';
    out.bring = v;
  }
  return out;
}

export type ValidationResult = { ok: true; offer: Offer } | { ok: false; reason: string };

/** Validates and normalises one offer. Unknown fields are dropped. */
export function validateOffer(raw: unknown): ValidationResult {
  const fail = (reason: string): ValidationResult => ({ ok: false, reason });
  if (!isObj(raw)) return fail('not an object');

  const id = typeof raw.id === 'string' && raw.id.length <= LIMITS.id && ID_RE.test(raw.id) ? raw.id : null;
  if (!id) return fail('bad id');
  const brand = cleanText(raw.brand, LIMITS.brand);
  if (!brand) return fail(`${id}: bad brand`);
  if (typeof raw.category !== 'string' || !CATEGORIES.includes(raw.category as Category)) return fail(`${id}: unknown category`);
  const offer = cleanText(raw.offer, LIMITS.offer);
  if (!offer) return fail(`${id}: bad offer text`);
  const howToClaim = cleanText(raw.howToClaim, LIMITS.howToClaim);
  if (!howToClaim) return fail(`${id}: bad howToClaim`);

  if (!Array.isArray(raw.countries) || raw.countries.length === 0 || raw.countries.length > LIMITS.countries) {
    return fail(`${id}: bad countries`);
  }
  const countries: string[] = [];
  for (const c of raw.countries) {
    if (typeof c !== 'string' || !(c === '*' || COUNTRY_RE.test(c))) return fail(`${id}: bad country code`);
    if (!countries.includes(c)) countries.push(c);
  }

  if (typeof raw.channel !== 'string' || !CHANNELS.includes(raw.channel as Channel)) return fail(`${id}: bad channel`);
  const claimWindow = raw.claimWindow === undefined ? 'varies' : raw.claimWindow;
  if (typeof claimWindow !== 'string' || !CLAIM_WINDOWS.includes(claimWindow as ClaimWindow)) return fail(`${id}: bad claimWindow`);

  const sourceUrl = safeHttpsUrl(raw.sourceUrl);
  if (!sourceUrl) return fail(`${id}: sourceUrl must be https`);
  if (!isValidIsoDate(raw.lastVerified)) return fail(`${id}: bad lastVerified`);
  if (raw.verified !== undefined && typeof raw.verified !== 'boolean') return fail(`${id}: verified must be boolean`);
  // Required since DECISIONS #27: they set the list order and the type chip.
  if (typeof raw.rewardType !== 'string' || !REWARD_TYPES.includes(raw.rewardType as RewardType)) return fail(`${id}: bad rewardType`);
  if (typeof raw.needsPastSpend !== 'boolean') return fail(`${id}: needsPastSpend must be boolean`);

  const osm = validateOsm(raw.osm);
  if (osm === null) return fail(`${id}: bad osm hint`);
  const venues = validateVenues(raw.venues);
  if (venues === null) return fail(`${id}: bad venues`);
  const details = validateClaimDetails(raw);
  if (typeof details === 'string') return fail(`${id}: ${details}`);

  const result: Offer = {
    id,
    brand,
    category: raw.category as Category,
    offer,
    howToClaim,
    countries,
    channel: raw.channel as Channel,
    claimWindow: claimWindow as ClaimWindow,
    sourceUrl,
    lastVerified: raw.lastVerified,
    verified: raw.verified === true,
    rewardType: raw.rewardType as RewardType,
    needsPastSpend: raw.needsPastSpend,
  };
  if (osm) result.osm = osm;
  if (venues) result.venues = venues;
  Object.assign(result, details);
  return { ok: true, offer: result };
}

/** Validates the whole file. Throws on a bad envelope; drops (and warns about) bad entries. */
export function validateOffersFile(raw: unknown, warn: (msg: string) => void = (m) => console.warn(m)): OffersFile {
  if (!isObj(raw)) throw new Error('offers.json: not an object');
  if (raw.schemaVersion !== 1) throw new Error('offers.json: unsupported schemaVersion');
  if (!Array.isArray(raw.offers)) throw new Error('offers.json: offers must be an array');
  const updated = isValidIsoDate(raw.updated) ? raw.updated : '';
  const seen = new Set<string>();
  const offers: Offer[] = [];
  for (const entry of raw.offers.slice(0, LIMITS.offers)) {
    const r = validateOffer(entry);
    if (!r.ok) {
      warn(`[offers] dropped invalid entry: ${r.reason}`);
      continue;
    }
    if (seen.has(r.offer.id)) {
      warn(`[offers] dropped duplicate id: ${r.offer.id}`);
      continue;
    }
    seen.add(r.offer.id);
    offers.push(r.offer);
  }
  return { schemaVersion: 1, updated, offers };
}

export async function loadOffers(fetchImpl: typeof fetch = fetch): Promise<OffersFile> {
  const res = await fetchImpl(`${import.meta.env.BASE_URL}offers.json`, { credentials: 'omit' });
  if (!res.ok) throw new Error(`offers.json: HTTP ${res.status}`);
  return validateOffersFile(await res.json());
}

export type TabChannel = 'nearby' | 'online';

/**
 * nearby: in-store/both offers available in `country` (or worldwide "*").
 * online: online/both offers for `country` (or only worldwide ones when country is null).
 */
export function filterOffers(args: { offers: readonly Offer[]; country: string | null; channel: TabChannel }): Offer[] {
  const { offers, channel } = args;
  const country = args.country && COUNTRY_RE.test(args.country) ? args.country : null;
  if (channel === 'nearby' && !country) return [];
  const channelOk = (c: Channel) => (channel === 'nearby' ? c === 'in-store' || c === 'both' : c === 'online' || c === 'both');
  return offers.filter(
    (o) => channelOk(o.channel) && (o.countries.includes('*') || (country !== null && o.countries.includes(country))),
  );
}

export interface VenueHit {
  venue: Venue;
  distanceM: number;
}

/** The offer's venue nearest to (lat, lng), or null when it has no venues (or the point is invalid). */
export function nearestVenue(offer: Pick<Offer, 'venues'>, lat: number, lng: number): VenueHit | null {
  if (!offer.venues?.length || !isCoord(lat, 90) || !isCoord(lng, 180)) return null;
  let best: VenueHit | null = null;
  for (const venue of offer.venues) {
    const d = distanceM(lat, lng, venue.lat, venue.lng);
    if (!best || d < best.distanceM) best = { venue, distanceM: d };
  }
  return best;
}

/**
 * Nearby tab list for a searched point: the country's in-store/both offers, except that an offer with
 * venues is kept only when its nearest venue is within VENUE_MAX_M (a single theme park near Mumbai
 * must not show up for Kolkata). `venues` maps the kept venue offers to that nearest venue.
 */
export function nearbyOffers(args: { offers: readonly Offer[]; country: string | null; lat: number; lng: number }): {
  offers: Offer[];
  venues: Map<string, VenueHit>;
} {
  const venues = new Map<string, VenueHit>();
  const offers = filterOffers({ offers: args.offers, country: args.country, channel: 'nearby' }).filter((o) => {
    if (!o.venues) return true;
    const hit = nearestVenue(o, args.lat, args.lng);
    if (!hit || hit.distanceM > VENUE_MAX_M) return false;
    venues.set(o.id, hit);
    return true;
  });
  return { offers, venues };
}

/** "Verified only" filter (DECISIONS #25): unverified offers are dropped when `verifiedOnly` is on. */
export function applyVerifiedFilter<T extends Pick<Offer, 'verified'>>(offers: readonly T[], verifiedOnly: boolean): T[] {
  return verifiedOnly ? offers.filter((o) => o.verified) : [...offers];
}

/**
 * Quest order (DECISIONS #27): 0 = free with no past spend, 1 = discount with no past spend,
 * 2 = needs past spend (free or discount). Lower tiers are listed first.
 */
export type QuestTier = 0 | 1 | 2;
export function questTier(offer: Pick<Offer, 'rewardType' | 'needsPastSpend'>): QuestTier {
  if (offer.needsPastSpend) return 2;
  return offer.rewardType === 'free' ? 0 : 1;
}

/** The three quest types the Filter box toggles, one per tier. */
export const QUEST_TYPES = ['free', 'discount', 'past'] as const;
export type QuestType = (typeof QUEST_TYPES)[number];
export const QUEST_TYPE_LABELS: Record<QuestType, string> = { free: 'Free', discount: 'Discount', past: 'Needs past spend' };

export function questType(offer: Pick<Offer, 'rewardType' | 'needsPastSpend'>): QuestType {
  return QUEST_TYPES[questTier(offer)];
}

const BRAND_COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Sort comparator: tier, then distance in metres ascending (when `distances` is given; offers without
 * one go after those with one), then brand A to Z, then id so the order is fully deterministic.
 */
export function compareQuests(
  a: Pick<Offer, 'id' | 'brand' | 'rewardType' | 'needsPastSpend'>,
  b: Pick<Offer, 'id' | 'brand' | 'rewardType' | 'needsPastSpend'>,
  distances?: ReadonlyMap<string, number>,
): number {
  const t = questTier(a) - questTier(b);
  if (t !== 0) return t;
  if (distances) {
    const da = distances.get(a.id);
    const db = distances.get(b.id);
    const fa = da !== undefined && Number.isFinite(da) ? da : Infinity;
    const fb = db !== undefined && Number.isFinite(db) ? db : Infinity;
    if (fa !== fb) return fa < fb ? -1 : 1;
  }
  const n = BRAND_COLLATOR.compare(a.brand, b.brand);
  if (n !== 0) return n;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A sorted copy (see compareQuests); the input is not changed. */
export function sortQuests<T extends Pick<Offer, 'id' | 'brand' | 'rewardType' | 'needsPastSpend'>>(
  offers: readonly T[],
  distances?: ReadonlyMap<string, number>,
): T[] {
  return [...offers].sort((a, b) => compareQuests(a, b, distances));
}

/** Which quest types are shown (Filter box). All on by default. */
export type QuestTypeFilter = Record<QuestType, boolean>;
export const ALL_QUEST_TYPES: Readonly<QuestTypeFilter> = Object.freeze({ free: true, discount: true, past: true });

export interface QuestFilters {
  verifiedOnly: boolean;
  types: QuestTypeFilter;
}

export function allTypesOn(types: QuestTypeFilter): boolean {
  return QUEST_TYPES.every((t) => types[t]);
}

/** Number of quest types switched off (the Filter button's badge). */
export function hiddenTypeCount(types: QuestTypeFilter): number {
  return QUEST_TYPES.filter((t) => !types[t]).length;
}

/** Every list filter in one place: "Verified only" (DECISIONS #25) plus the quest-type Filter (#27). */
export function applyQuestFilters<T extends Pick<Offer, 'verified' | 'rewardType' | 'needsPastSpend'>>(
  offers: readonly T[],
  filters: QuestFilters,
): T[] {
  return applyVerifiedFilter(offers, filters.verifiedOnly).filter((o) => filters.types[questType(o)]);
}

/** Live-region line after a Filter change, e.g. "Showing free quests only, 12 of 31". */
export function typeFilterMessage(types: QuestTypeFilter, shown: number, total: number): string {
  const on = QUEST_TYPES.filter((t) => types[t]);
  if (on.length === QUEST_TYPES.length) return `Showing all quest types, ${shown} of ${total}`;
  if (on.length === 0) return `No quest types selected, 0 of ${total}`;
  const names = on.map((t) => (t === 'past' ? 'past-spend' : t));
  if (names.length === 1) return `Showing ${names[0]} quests only, ${shown} of ${total}`;
  return `Showing ${names.join(' and ')} quests, ${shown} of ${total}`;
}

/**
 * Online-tab counts per country: offers with an online/both channel that list the country explicitly
 * (worldwide "*" offers are counted separately in `worldwide`).
 */
export function onlineCounts(offers: readonly Offer[]): { byCountry: Map<string, number>; worldwide: number } {
  const byCountry = new Map<string, number>();
  let worldwide = 0;
  for (const o of offers) {
    if (o.channel !== 'online' && o.channel !== 'both') continue;
    if (o.countries.includes('*')) {
      worldwide += 1;
      continue;
    }
    for (const c of o.countries) byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }
  return { byCountry, worldwide };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface MonthInfo {
  isBirthdayMonth: boolean;
  monthsAway: number;
  label: string;
}

export function monthInfo(birthMonth: number, now: Date = new Date()): MonthInfo {
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
    throw new RangeError('birthMonth must be an integer 1–12');
  }
  const current = now.getMonth() + 1;
  const monthsAway = (birthMonth - current + 12) % 12;
  let label: string;
  if (monthsAway === 0) label = "It's your birthday month";
  else if (monthsAway === 1) label = 'Your birthday month starts next month';
  else label = `Your birthday month starts in ${monthsAway} months`;
  return { isBirthdayMonth: monthsAway === 0, monthsAway, label };
}

const STALE_MONTHS = 6;

/** True when lastVerified is more than 6 months before `now` (or unparseable). */
export function isStale(lastVerified: string, now: Date = new Date()): boolean {
  if (!isValidIsoDate(lastVerified)) return true;
  const [y, m, d] = lastVerified.split('-').map(Number) as [number, number, number];
  const limit = new Date(Date.UTC(y, m - 1 + STALE_MONTHS, d));
  return now.getTime() > limit.getTime();
}
